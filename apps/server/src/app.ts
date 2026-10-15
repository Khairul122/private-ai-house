import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type {} from '@fastify/static';
import { z } from 'zod';
import { FreelancerReadError, FreelancerSandboxWriteError, FreelancerWriteError, getFreelancerCapabilities } from '@fvh/adapter-freelancer';
import type { FreelancerSandboxWriteInput, FreelancerSandboxWriteOperation, FreelancerSandboxWriteResult, FreelancerWriteInput, FreelancerWriteOperation, FreelancerWriteResult } from '@fvh/adapter-freelancer';
import { GitHubReadAdapter, GitHubReadError } from '@fvh/adapter-github';
import { assessProject, createId, decideBid, hashPayload, UnavailableDraftingAdapter } from '@fvh/application';
import type { AiDraftingPort } from '@fvh/application';
import { activatePolicySchema, createClientProjectSchema, createPaymentSchema, knowledgeImportSchema, knowledgeSearchSchema, updateClientProjectSchema, updatePolicySchema, updateProfileSchema } from '@fvh/contracts';
import { transitionPipeline } from '@fvh/domain';
import type { AutonomyPolicy, BidDraft, ProjectOpportunity } from '@fvh/domain';
import { prepareKnowledgeFile } from '@fvh/knowledge';
import { WorkspaceRepository } from '@fvh/persistence';
import type { CredentialStatus, FreelancerVerification } from './credential-store.js';
import type { LinkedInOAuthService } from './linkedin-oauth.js';
import { localDateKey, mondayKey } from './autopilot.js';
import type { FreelancerAutopilot } from './autopilot.js';
import type { BusinessSync } from './business-sync.js';

const paramsSchema = z.object({ id: z.string().min(1).max(150) });
const FOLLOW_UP_DAYS = 3;
const draftUpdateSchema = z.object({ proposal: z.string().trim().min(40).max(4_000), proposedPrice: z.number().finite().positive() });
const githubSyncSchema = z.object({ repository: z.string().trim().min(3).max(200) });
const freelancerSyncSchema = z.object({ query: z.string().trim().min(2).max(120), limit: z.number().int().min(1).max(50).default(25) });
const safeFreelancerIdSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const freelancerProductionWriteSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('submit_bid'), projectId: safeFreelancerIdSchema, amount: z.number().finite().positive(), period: z.number().int().positive(), milestonePercentage: z.number().int().min(1).max(100), description: z.string().trim().min(1).max(4_000), confirmLive: z.literal(true) }),
  z.object({ operation: z.literal('edit_profile'), jobIds: z.array(safeFreelancerIdSchema).min(1).max(20).refine((ids) => new Set(ids).size === ids.length, 'ID job tidak boleh duplikat.'), confirmLive: z.literal(true) }),
  z.object({ operation: z.literal('send_message'), threadId: safeFreelancerIdSchema, message: z.string().trim().min(1).max(4_000), confirmLive: z.literal(true) }),
]);
const freelancerSandboxWriteSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('submit_bid'), projectId: safeFreelancerIdSchema, amount: z.number().finite().positive(), period: z.number().int().positive(), milestonePercentage: z.number().int().min(1).max(100), description: z.string().trim().min(1).max(4_000) }),
  z.object({ operation: z.literal('edit_profile'), jobIds: z.array(safeFreelancerIdSchema).min(1).max(20).refine((ids) => new Set(ids).size === ids.length, 'ID job tidak boleh duplikat.') }),
  z.object({ operation: z.literal('send_message'), threadId: safeFreelancerIdSchema, message: z.string().trim().min(1).max(4_000) }),
]);
const allowedDevOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:5174', 'http://localhost:5174']);

type FreelancerSandboxWriteCheck = { statusCode: number | null; checkedAt: string; resultId?: string; resultStatus?: string };
type FreelancerProductionWriteCheck = FreelancerSandboxWriteCheck;

export type AppOptions = {
  repository?: WorkspaceRepository;
  githubToken?: string;
  getGitHubToken?: () => string | undefined;
  credentialStatus?: CredentialStatus;
  getCredentialStatus?: () => CredentialStatus;
  freelancerSandboxTokenConfigured?: boolean;
  verifyFreelancer?: () => Promise<FreelancerVerification>;
  runFreelancerProductionWrite?: (input: FreelancerWriteInput) => Promise<FreelancerWriteResult>;
  verifyFreelancerSandboxWrite?: (input: FreelancerSandboxWriteInput) => Promise<FreelancerSandboxWriteResult>;
  readFreelancerProjects?: (query: string, limit: number) => Promise<{ projects: ProjectOpportunity[]; skipped: number }>;
  autopilot?: FreelancerAutopilot;
  businessSync?: BusinessSync;
  linkedinOAuth?: Pick<LinkedInOAuthService, 'redirectUri' | 'start' | 'handleCallback' | 'close'>;
  disconnectLinkedIn?: () => Promise<void>;
  fetcher?: typeof fetch;
  clock?: () => Date;
  drafting?: AiDraftingPort;
  draftingMode?: 'disabled' | 'fixture' | 'hermes';
  draftingReason?: string;
  spaFallback?: boolean;
};

function parseBody<T>(schema: z.ZodType<T>, body: unknown): { value: T } | { issues: string[] } {
  const result = schema.safeParse(body);
  return result.success ? { value: result.data } : { issues: result.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`) };
}

function isSameOrigin(origin: string, protocol: string, host: string | undefined): boolean {
  if (!host) return false;
  try {
    const source = new URL(origin);
    const request = new URL(`${protocol}://${host}`);
    return source.origin === origin && source.origin === request.origin;
  } catch {
    return false;
  }
}

function readProductionWriteChecks(repository: WorkspaceRepository): Map<FreelancerWriteOperation, FreelancerProductionWriteCheck> {
  const checks = new Map<FreelancerWriteOperation, FreelancerProductionWriteCheck>();
  const operations = new Set<FreelancerWriteOperation>(['submit_bid', 'edit_profile', 'send_message']);
  for (const event of repository.listAudit(500)) {
    const prefix = 'marketplace.production.';
    if (!event.type.startsWith(prefix)) continue;
    const operation = event.type.slice(prefix.length) as FreelancerWriteOperation;
    if (!operations.has(operation) || checks.has(operation)) continue;
    const statusCode = event.reason.match(/HTTP (\d{3})/)?.[1];
    const resultId = event.reason.match(/ID hasil: (\d{1,30})/)?.[1];
    checks.set(operation, {
      statusCode: statusCode ? Number(statusCode) : null,
      checkedAt: event.createdAt,
      ...(resultId ? { resultId } : {}),
    });
  }
  return checks;
}

function linkedinVerification(credentialStatus: CredentialStatus | undefined, now: Date) {
  if (!credentialStatus?.linkedinAccessTokenConfigured) return { authorized: false, verificationStatus: 'unverified' as const };
  const expiresAt = credentialStatus.linkedinAccessTokenExpiresAt;
  if (!expiresAt) return { authorized: false, verificationStatus: 'unverified' as const };
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) return { authorized: false, verificationStatus: 'unverified' as const };
  if (expiry <= now.getTime()) return { authorized: false, verificationStatus: 'expired' as const };
  return { authorized: true, verificationStatus: 'connected' as const };
}

export function createApp(options: AppOptions = {}): FastifyInstance {
  const repository = options.repository ?? new WorkspaceRepository();
  const now = options.clock ?? (() => new Date());
  const drafting = options.drafting ?? new UnavailableDraftingAdapter();
  const draftingMode = options.drafting ? options.draftingMode ?? 'fixture' : 'disabled';
  // Lets the office show the Hermes lead as working only while a draft request is actually running.
  let draftsInProgress = 0;
  const app = Fastify({ logger: false, bodyLimit: 2_500_000, trustProxy: false });
  let freelancerVerification: FreelancerVerification | null = null;
  const freelancerSandboxWriteChecks = new Map<FreelancerSandboxWriteOperation, FreelancerSandboxWriteCheck>();
  const freelancerProductionWriteChecks = readProductionWriteChecks(repository);
  const refreshProductionWriteChecks = () => {
    for (const [operation, check] of readProductionWriteChecks(repository)) freelancerProductionWriteChecks.set(operation, check);
  };

  app.addHook('onRequest', async (request, reply) => {
    const host = request.headers.host;
    try {
      const hostname = host ? new URL(`http://${host}`).hostname : '';
      if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(hostname)) return reply.code(403).send({ error: 'Host tidak diizinkan.' });
    } catch {
      return reply.code(403).send({ error: 'Host tidak diizinkan.' });
    }
    const origin = request.headers.origin;
    if (origin && !allowedDevOrigins.has(origin) && !isSameOrigin(origin, request.protocol, request.headers.host)) {
      return reply.code(403).send({ error: 'Origin tidak diizinkan.' });
    }
  });
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws://127.0.0.1:5173 ws://localhost:5173 ws://127.0.0.1:5174 ws://localhost:5174; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    return payload;
  });

  app.get('/api/health', async () => ({
    ok: true, mode: 'local', database: 'sqlite', ai: draftingMode, liveWrites: options.autopilot?.getStatus().state === 'running',
    manualProductionWritesConfigured: (options.getCredentialStatus?.() ?? options.credentialStatus)?.freelancerAccessTokenConfigured ?? false,
    autopilot: options.autopilot?.getStatus().state ?? 'unavailable',
  }));
  app.get('/api/autopilot', async () => options.autopilot?.getStatus() ?? {
    state: 'blocked', lastRunAt: null, nextRunAt: null, lastMessage: 'Autopilot belum tersedia pada server ini.', lastImported: 0, lastSubmitted: 0, specializations: [],
  });
  app.get('/api/business-sync', async () => options.businessSync?.getStatus() ?? null);
  // Thread project ids are bare Freelancer ids; local project ids are 'freelancer:<id>'.
  const threadProjectIds = () => new Set(repository.listClientThreads().map((thread) => thread.projectId).filter((id): id is string => id !== null).map((id) => `freelancer:${id}`));
  const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

  app.get('/api/insights/bids', async () => {
    const outcomes = repository.listBidOutcomes();
    const won = outcomes.filter(({ outcome }) => outcome === 'won').length;
    const lost = outcomes.filter(({ outcome }) => outcome === 'lost').length;
    const pending = outcomes.filter(({ outcome }) => outcome === 'pending').length;
    const conversations = threadProjectIds();
    const since = new Date(now().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const reasons = repository.skipReasonSummary(since);
    const sync = options.businessSync?.getStatus().outcomes;
    const lastChecked = outcomes.map(({ checkedAt }) => checkedAt).filter((value): value is string => value !== null).sort().at(-1) ?? null;
    return {
      outcomes: { submitted: outcomes.length, won, lost, pending, withConversation: outcomes.filter((row) => conversations.has(row.projectId)).length, winRate: won + lost === 0 ? null : won / (won + lost) },
      recent: outcomes.slice(0, 10).map((outcome) => ({ projectId: outcome.projectId, title: repository.getProject(outcome.projectId)?.title ?? null, submittedAt: outcome.submittedAt, outcome: outcome.outcome, awardStatus: outcome.awardStatus, checkedAt: outcome.checkedAt })),
      skips: { total: reasons.reduce((total, reason) => total + Number(reason.total), 0), recent7d: reasons.reduce((total, reason) => total + Number(reason.recent), 0), reasons },
      lastCheck: sync?.lastRunAt ? { at: sync.lastRunAt, ok: sync.ok, error: sync.error } : { at: lastChecked, ok: lastChecked ? true : null, error: null },
    };
  });

  app.get('/api/inbox', async () => {
    const sync = options.businessSync?.getStatus().messages ?? null;
    const selfId = sync?.selfId ?? null;
    const nowMs = now().getTime();
    const needsReply = selfId === null ? [] : repository.listClientThreads()
      .filter((thread) => thread.lastSenderId !== selfId)
      .sort((a, b) => a.lastMessageAt.localeCompare(b.lastMessageAt))
      .map((thread) => ({
        threadId: thread.threadId, projectId: thread.projectId, preview: thread.preview, lastMessageAt: thread.lastMessageAt,
        projectTitle: thread.projectId ? repository.getProject(`freelancer:${thread.projectId}`)?.title ?? null : null,
        waitingHours: Math.max(0, Math.floor((nowMs - Date.parse(thread.lastMessageAt)) / 3_600_000)),
      }));
    const conversations = threadProjectIds();
    const followUps = repository.listBidOutcomes()
      .filter((row) => row.outcome === 'pending' && !conversations.has(row.projectId))
      .map((row) => ({ projectId: row.projectId, title: repository.getProject(row.projectId)?.title ?? row.projectId, submittedAt: row.submittedAt, daysSinceBid: Math.floor((nowMs - Date.parse(row.submittedAt)) / 86_400_000) }))
      .filter((row) => row.daysSinceBid >= FOLLOW_UP_DAYS);
    return { sync: sync && { lastRunAt: sync.lastRunAt, ok: sync.ok, error: sync.error }, needsReply, followUps };
  });

  app.get('/api/work', async () => {
    const policy = repository.getPolicy();
    const today = localDateKey(now(), policy.timezone);
    const month = today.slice(0, 7);
    const projectsById = new Map(repository.listClientProjects().map((project) => [project.id, project]));
    const projects = [...projectsById.values()]
      .map((project) => ({ ...project, daysToDeadline: project.deadline ? dayDiff(today, project.deadline) : null }))
      .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || (a.daysToDeadline ?? Infinity) - (b.daysToDeadline ?? Infinity));
    const payments = repository.listPayments();
    const received = new Map<string, { currency: string; total: number; bySource: Record<string, number> }>();
    const expected = new Map<string, { currency: string; total: number }>();
    for (const payment of payments) {
      if (payment.status === 'expected') {
        const entry = expected.get(payment.currency) ?? { currency: payment.currency, total: 0 };
        entry.total += payment.amount;
        expected.set(payment.currency, entry);
      } else if (payment.receivedAt && localDateKey(new Date(payment.receivedAt), policy.timezone).startsWith(month)) {
        const entry = received.get(payment.currency) ?? { currency: payment.currency, total: 0, bySource: {} };
        const source = projectsById.get(payment.projectId)?.source ?? 'other';
        entry.total += payment.amount;
        entry.bySource[source] = (entry.bySource[source] ?? 0) + payment.amount;
        received.set(payment.currency, entry);
      }
    }
    return {
      projects, payments, income: { month, received: [...received.values()], expected: [...expected.values()] },
      dueSoon: projects.filter((project) => project.status === 'active' && project.daysToDeadline !== null && project.daysToDeadline >= 0 && project.daysToDeadline <= 2).length,
    };
  });

  app.post('/api/work/projects', async (request, reply) => {
    const parsed = parseBody(createClientProjectSchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Data proyek tidak valid.', issues: parsed.issues });
    const project = repository.createClientProject({ ...parsed.value, externalProjectId: null });
    if (!project) return reply.code(409).send({ error: 'Proyek sudah ada.' });
    repository.appendAudit({ type: 'work.project_created', resourceId: project.id, status: 'recorded', reason: `Proyek klien "${project.title}" ditambahkan.`, policyVersion: null, payloadHash: null });
    return reply.code(201).send(project);
  });

  app.put('/api/work/projects/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const parsed = parseBody(updateClientProjectSchema, request.body);
    if (!params.success || 'issues' in parsed) return reply.code(400).send({ error: 'Perubahan proyek tidak valid.', ...('issues' in parsed ? { issues: parsed.issues } : {}) });
    const patch = Object.fromEntries(Object.entries(parsed.value).filter(([, value]) => value !== undefined));
    const project = repository.updateClientProject(params.data.id, patch);
    if (!project) return reply.code(404).send({ error: 'Proyek tidak ditemukan.' });
    repository.appendAudit({ type: 'work.project_updated', resourceId: project.id, status: 'recorded', reason: `Proyek "${project.title}" diperbarui (status ${project.status}).`, policyVersion: null, payloadHash: null });
    return project;
  });

  app.post('/api/work/payments', async (request, reply) => {
    const parsed = parseBody(createPaymentSchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Data pembayaran tidak valid.', issues: parsed.issues });
    if (!repository.getClientProject(parsed.value.projectId)) return reply.code(404).send({ error: 'Proyek tidak ditemukan.' });
    const payment = repository.createPayment({ ...parsed.value, receivedAt: parsed.value.status === 'received' ? now().toISOString() : null });
    repository.appendAudit({ type: 'work.payment_recorded', resourceId: payment.id, status: 'recorded', reason: `Pembayaran ${payment.currency} ${payment.amount} dicatat (${payment.status === 'received' ? 'diterima' : 'diharapkan'}).`, policyVersion: null, payloadHash: null });
    return reply.code(201).send(payment);
  });

  app.post('/api/work/payments/:id/received', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID pembayaran tidak valid.' });
    const payment = repository.markPaymentReceived(params.data.id, now().toISOString());
    if (!payment) return reply.code(404).send({ error: 'Pembayaran tidak ditemukan.' });
    repository.appendAudit({ type: 'work.payment_received', resourceId: payment.id, status: 'recorded', reason: `Pembayaran ${payment.currency} ${payment.amount} ditandai diterima.`, policyVersion: null, payloadHash: null });
    return payment;
  });

  app.get('/api/capabilities', async () => {
    refreshProductionWriteChecks();
    const credentialStatus = options.getCredentialStatus?.() ?? options.credentialStatus;
    const linkedin = linkedinVerification(credentialStatus, now());
    return {
    marketplace: getFreelancerCapabilities(freelancerVerification).map((capability) => {
      const productionVerification = freelancerProductionWriteChecks.get(capability.operation as FreelancerWriteOperation);
      return {
        ...capability,
        ...(productionVerification ? {
          status: productionVerification.statusCode === 200 ? 'supported' : 'unknown',
          evidence: productionVerification.statusCode === 200
            ? `Permintaan live Freelancer berhasil dengan HTTP 200 pada ${productionVerification.checkedAt}.${productionVerification.resultId ? ` ID hasil: ${productionVerification.resultId}.` : ''}`
            : `Permintaan live terakhir belum terkonfirmasi${productionVerification.statusCode ? ` (HTTP ${productionVerification.statusCode})` : ''}; capability tetap belum terverifikasi.`,
          productionVerification,
        } : {}),
        ...(freelancerSandboxWriteChecks.has(capability.operation as FreelancerSandboxWriteOperation)
          ? { sandboxVerification: freelancerSandboxWriteChecks.get(capability.operation as FreelancerSandboxWriteOperation) }
          : {}),
      };
    }),
    freelancerCredentials: {
      accessTokenConfigured: credentialStatus?.freelancerAccessTokenConfigured ?? false,
      productionWriteConfigured: credentialStatus?.freelancerAccessTokenConfigured ?? false,
      sandboxWriteTestConfigured: options.freelancerSandboxTokenConfigured ?? false,
      verificationStatus: freelancerVerification?.connected ? 'connected' : freelancerVerification?.reason === 'invalid_token' ? 'invalid' : freelancerVerification ? 'unavailable' : 'unverified',
      readProfile: freelancerVerification?.readProfile ?? false,
      readProjects: freelancerVerification?.readProjects ?? false,
      readPortfolio: freelancerVerification?.readPortfolio ?? false,
      readMessages: freelancerVerification?.readMessages ?? false,
    },
    github: {
      read: 'supported',
      verificationStatus: repository.listKnowledgeSources().some((source) => source.provider === 'github') ? 'supported' : 'unknown',
      scope: 'selected repository Contents: read',
      tokenConfigured: Boolean(options.getGitHubToken?.() ?? options.githubToken),
    },
    linkedin: {
      read: linkedin.authorized ? 'oidc-lite' : 'manual-only',
      clientConfigured: credentialStatus?.linkedinClientConfigured ?? false,
      authorized: linkedin.authorized,
      verificationStatus: linkedin.verificationStatus,
      accessTokenExpiresAt: credentialStatus?.linkedinAccessTokenExpiresAt ?? null,
      redirectUri: options.linkedinOAuth?.redirectUri ?? null,
      reason: 'Hanya profil OIDC ringan yang diminta. Produk OIDC LinkedIn harus disetujui dan URL callback yang ditampilkan harus diterima di Developer Portal; akses profil lengkap tetap tidak tersedia.',
    },
    hermes: {
      draft: 'optional', active: draftingMode === 'hermes', draftsInProgress: draftsInProgress + (options.autopilot?.getStatus().draftsInProgress ?? 0),
      reason: draftingMode === 'hermes'
        ? 'Data proyek terpilih, fakta profil yang diberikan, dan hingga empat potongan bukti lokal dikirim ke profil Hermes yang dikonfigurasi; kredensial marketplace tidak disertakan.'
        : options.draftingReason ?? 'Hermes belum aktif. Draf AI tidak dibuat sampai profil Hermes dikonfigurasi dan persetujuan pemrosesan data diberikan.',
    },
  };
  });

  app.post('/api/freelancer/verify', async (_request, reply) => {
    const credentialStatus = options.getCredentialStatus?.() ?? options.credentialStatus;
    if (!credentialStatus?.freelancerAccessTokenConfigured) return reply.code(409).send({ error: 'Token Freelancer belum dikonfigurasi di .env atau secure store Windows.' });
    if (!options.verifyFreelancer) return reply.code(503).send({ error: 'Pemeriksaan koneksi Freelancer belum tersedia di server ini.' });
    freelancerVerification = await options.verifyFreelancer();
    const resultSummary = [
      ['profil', freelancerVerification.readProfile],
      ['proyek', freelancerVerification.readProjects],
      ['portofolio', freelancerVerification.readPortfolio ?? false],
      ['pesan', freelancerVerification.readMessages ?? false],
    ].map(([label, ok]) => `${label}: ${ok ? 'ok' : 'belum terverifikasi'}`).join('; ');
    return {
      ...freelancerVerification,
      message: `${freelancerVerification.connected ? 'Koneksi Freelancer berhasil diperiksa' : 'Koneksi Freelancer belum terverifikasi'}. ${resultSummary}.`,
    };
  });

  app.post('/api/freelancer/sandbox-write-test', async (request, reply) => {
    if (!options.freelancerSandboxTokenConfigured) {
      return reply.code(409).send({ error: 'Token sandbox Freelancer belum dikonfigurasi pada FVH_FREELANCER_SANDBOX_ACCESS_TOKEN.' });
    }
    if (!options.verifyFreelancerSandboxWrite) {
      return reply.code(503).send({ error: 'Adapter uji tulis sandbox belum tersedia di server ini.' });
    }
    const parsed = parseBody(freelancerSandboxWriteSchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Data uji sandbox tidak valid.', issues: parsed.issues });

    const input = parsed.value as FreelancerSandboxWriteInput;
    try {
      const result = await options.verifyFreelancerSandboxWrite(input);
      const checkedAt = now().toISOString();
      freelancerSandboxWriteChecks.set(input.operation, {
        statusCode: result.statusCode, checkedAt,
        ...(result.resultId ? { resultId: result.resultId } : {}),
        ...(result.resultStatus ? { resultStatus: result.resultStatus } : {}),
      });
      const success = result.statusCode === 200;
      const resultDescription = result.resultId ? `ID hasil: ${result.resultId}.` : result.resultStatus ? `Status hasil: ${result.resultStatus}.` : 'Freelancer tidak memberikan ID hasil.';
      repository.appendAudit({
        type: `marketplace.sandbox.${input.operation}_test`, resourceId: result.resultId ?? 'freelancer-sandbox',
        status: success ? 'recorded' : 'failed',
        reason: `Uji tulis sandbox ${input.operation} menghasilkan HTTP ${result.statusCode}. ${resultDescription} Isi payload tidak disimpan.`,
        policyVersion: repository.getPolicy().version, payloadHash: hashPayload(input),
      });
      if (!success) return reply.code(502).send({ error: `Freelancer sandbox merespons HTTP ${result.statusCode}; status bukan 200.`, providerStatusCode: result.statusCode });
      return {
        operation: input.operation, statusCode: result.statusCode, environment: 'sandbox', checkedAt,
        ...(result.resultId ? { resultId: result.resultId } : {}),
        ...(result.resultStatus ? { resultStatus: result.resultStatus } : {}),
        message: `Uji ${input.operation} menerima HTTP 200 dari Freelancer sandbox. ${resultDescription}`,
      };
    } catch (error) {
      const checkedAt = now().toISOString();
      const providerStatusCode = error instanceof FreelancerSandboxWriteError ? error.statusCode ?? null : null;
      freelancerSandboxWriteChecks.set(input.operation, { statusCode: providerStatusCode, checkedAt });
      repository.appendAudit({
        type: `marketplace.sandbox.${input.operation}_test`, resourceId: 'freelancer-sandbox', status: 'failed',
        reason: providerStatusCode === null
          ? `Uji tulis sandbox ${input.operation} tidak menerima hasil; jangan retry sebelum memeriksa sandbox.`
          : `Uji tulis sandbox ${input.operation} menghasilkan HTTP ${providerStatusCode}.`,
        policyVersion: repository.getPolicy().version, payloadHash: hashPayload(input),
      });
      const message = providerStatusCode === null
        ? 'Uji sandbox tidak memperoleh respons yang dapat dipastikan. Periksa thread/proyek sandbox sebelum mengulang.'
        : `Freelancer sandbox merespons HTTP ${providerStatusCode}; status bukan 200.`;
      return reply.code(502).send({ error: message, providerStatusCode });
    }
  });

  app.post('/api/freelancer/production-write', async (request, reply) => {
    const credentialStatus = options.getCredentialStatus?.() ?? options.credentialStatus;
    if (!credentialStatus?.freelancerAccessTokenConfigured) {
      return reply.code(409).send({ error: 'Token produksi Freelancer belum dikonfigurasi di .env atau secure store Windows.' });
    }
    if (!options.runFreelancerProductionWrite) {
      return reply.code(503).send({ error: 'Adapter operasi live Freelancer belum tersedia di server ini.' });
    }
    const parsed = parseBody(freelancerProductionWriteSchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Data operasi live tidak valid.', issues: parsed.issues });

    const { confirmLive, ...input } = parsed.value;
    if (!confirmLive) return reply.code(400).send({ error: 'Konfirmasi operasi live wajib diberikan.' });
    const liveInput = input as FreelancerWriteInput;
    try {
      const result = await options.runFreelancerProductionWrite(liveInput);
      const checkedAt = now().toISOString();
      const check = {
        statusCode: result.statusCode, checkedAt,
        ...(result.resultId ? { resultId: result.resultId } : {}),
        ...(result.resultStatus ? { resultStatus: result.resultStatus } : {}),
      };
      freelancerProductionWriteChecks.set(liveInput.operation, check);
      const resultDescription = result.resultId ? `ID hasil: ${result.resultId}.` : result.resultStatus ? `Status hasil: ${result.resultStatus}.` : 'Freelancer tidak memberikan ID hasil.';
      const success = result.statusCode === 200;
      repository.appendAudit({
        type: `marketplace.production.${liveInput.operation}`, resourceId: result.resultId ?? 'freelancer-production',
        status: success ? 'recorded' : 'failed',
        reason: `Operasi live ${liveInput.operation} menghasilkan HTTP ${result.statusCode}. ${resultDescription} Isi payload tidak disimpan.`,
        policyVersion: repository.getPolicy().version, payloadHash: hashPayload(liveInput),
      });
      if (!success) return reply.code(502).send({ error: `Freelancer merespons HTTP ${result.statusCode}; operasi tidak dinyatakan berhasil.`, providerStatusCode: result.statusCode });
      return {
        operation: liveInput.operation, statusCode: result.statusCode, environment: 'production', checkedAt,
        ...(result.resultId ? { resultId: result.resultId } : {}),
        ...(result.resultStatus ? { resultStatus: result.resultStatus } : {}),
        message: `Freelancer production menerima ${liveInput.operation} dengan HTTP 200. ${resultDescription}`,
      };
    } catch (error) {
      const checkedAt = now().toISOString();
      const providerStatusCode = error instanceof FreelancerWriteError ? error.statusCode ?? null : null;
      freelancerProductionWriteChecks.set(liveInput.operation, { statusCode: providerStatusCode, checkedAt });
      repository.appendAudit({
        type: `marketplace.production.${liveInput.operation}`, resourceId: 'freelancer-production', status: 'failed',
        reason: providerStatusCode === null
          ? `Hasil operasi live ${liveInput.operation} tidak dapat dipastikan; periksa akun Freelancer sebelum mengulang.`
          : `Operasi live ${liveInput.operation} menghasilkan HTTP ${providerStatusCode}.`,
        policyVersion: repository.getPolicy().version, payloadHash: hashPayload(liveInput),
      });
      const message = providerStatusCode === null
        ? 'Hasil operasi live tidak dapat dipastikan. Periksa akun Freelancer sebelum mencoba lagi agar tidak membuat duplikasi.'
        : `Freelancer merespons HTTP ${providerStatusCode}; operasi tidak dinyatakan berhasil.`;
      return reply.code(502).send({ error: message, providerStatusCode });
    }
  });

  app.post('/api/freelancer/projects/sync', async (request, reply) => {
    const credentialStatus = options.getCredentialStatus?.() ?? options.credentialStatus;
    if (!credentialStatus?.freelancerAccessTokenConfigured) return reply.code(409).send({ error: 'Token Freelancer belum dikonfigurasi di .env atau secure store Windows.' });
    if (!options.readFreelancerProjects) return reply.code(503).send({ error: 'Sinkronisasi Freelancer belum tersedia di server ini.' });
    const parsed = parseBody(freelancerSyncSchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Pencarian proyek tidak valid.', issues: parsed.issues });
    try {
      const result = await options.readFreelancerProjects(parsed.value.query, parsed.value.limit);
      const synced = repository.syncFreelancerProjects(result.projects);
      freelancerVerification = {
        connected: true,
        readProfile: freelancerVerification?.readProfile ?? false,
        readProjects: true,
        readPortfolio: freelancerVerification?.readPortfolio ?? false,
        readMessages: freelancerVerification?.readMessages ?? false,
        ...(freelancerVerification?.portfolioError ? { portfolioError: freelancerVerification.portfolioError } : {}),
        ...(freelancerVerification?.messagesError ? { messagesError: freelancerVerification.messagesError } : {}),
        reason: freelancerVerification?.readProfile ? 'verified' : 'profile_unavailable',
      };
      repository.appendAudit({
        type: 'marketplace.projects_synced', resourceId: 'freelancer', status: 'recorded',
        reason: `Sinkronisasi baca-saja menyimpan ${synced.upserted} proyek dari Freelancer; ${result.skipped} hasil tidak valid dilewati.`,
        policyVersion: repository.getPolicy().version, payloadHash: null,
      });
      return { imported: synced.upserted, skipped: result.skipped, projects: repository.listProjects().filter((project) => project.source === 'freelancer') };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Freelancer tidak dapat diperiksa.';
      repository.appendAudit({ type: 'marketplace.sync_failed', resourceId: 'freelancer', status: 'failed', reason: message, policyVersion: repository.getPolicy().version, payloadHash: null });
      const statusCode = error instanceof FreelancerReadError ? error.statusCode : undefined;
      return reply.code(statusCode === 401 || statusCode === 403 || statusCode === 429 ? statusCode : 502).send({ error: message });
    }
  });

  app.post('/api/linkedin/connect', async (request, reply) => {
    if (!options.linkedinOAuth) return reply.code(503).send({ error: 'Alur OAuth LinkedIn belum tersedia di server ini.' });
    const origin = request.headers.origin;
    const returnOrigin = origin && allowedDevOrigins.has(origin) ? origin : `http://127.0.0.1:${Number.parseInt(process.env.FVH_PORT ?? '3001', 10)}`;
    try {
      return await options.linkedinOAuth.start(`${returnOrigin}/capabilities`);
    } catch {
      return reply.code(409).send({ error: 'OAuth LinkedIn tidak dapat dimulai. Periksa kredensial aplikasi dan pastikan tidak ada alur otorisasi lain yang sedang berjalan.' });
    }
  });

  app.get('/api/linkedin/callback', async (request, reply) => {
    if (!options.linkedinOAuth) return reply.code(503).send({ error: 'Alur OAuth LinkedIn belum tersedia di server ini.' });
    const query = request.query as Record<string, unknown>;
    const result = await options.linkedinOAuth.handleCallback({
      ...(typeof query.state === 'string' ? { state: query.state } : {}),
      ...(typeof query.code === 'string' ? { code: query.code } : {}),
      ...(typeof query.error === 'string' ? { error: query.error } : {}),
    });
    const destination = new URL(result.returnUrl);
    destination.searchParams.set('linkedin', result.statusCode === 200 ? 'connected' : 'error');
    return reply
      .code(303)
      .header('Cache-Control', 'no-store')
      .header('Referrer-Policy', 'no-referrer')
      .redirect(destination.toString());
  });

  app.post('/api/linkedin/disconnect', async (_request, reply) => {
    if (!options.disconnectLinkedIn) return reply.code(503).send({ error: 'Pemutusan LinkedIn belum tersedia di server ini.' });
    try {
      await options.disconnectLinkedIn();
      return { disconnected: true };
    } catch {
      return reply.code(500).send({ error: 'Token LinkedIn tidak dapat dihapus dari secure store.' });
    }
  });

  app.get('/api/profile', async () => repository.getProfile());
  app.put('/api/profile', async (request, reply) => {
    const parsed = parseBody(updateProfileSchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Profil tidak valid.', issues: parsed.issues });
    const profile = parsed.value;
    repository.saveProfile(profile);
    const policy = repository.getPolicy();
    if (policy.state === 'active') {
      const changed: AutonomyPolicy = { ...policy, state: 'draft', version: policy.version + 1, primaryField: profile.primaryField, specializations: profile.specializations };
      repository.savePolicy(changed);
      repository.appendAudit({ type: 'policy.reactivation_required', resourceId: 'policy', status: 'recorded', reason: 'Profil berubah; kebijakan kembali ke draf dan perlu diaktifkan ulang.', policyVersion: changed.version, payloadHash: null });
    } else {
      repository.savePolicy({ ...policy, primaryField: profile.primaryField, specializations: profile.specializations });
    }
    repository.appendAudit({ type: 'profile.updated', resourceId: 'profile', status: 'recorded', reason: 'Fakta dan bidang kerja lokal diperbarui.', policyVersion: repository.getPolicy().version, payloadHash: null });
    return { profile, policy: repository.getPolicy() };
  });

  app.get('/api/policy', async () => repository.getPolicy());
  app.put('/api/policy', async (request, reply) => {
    const parsed = parseBody(updatePolicySchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Kebijakan tidak valid.', issues: parsed.issues });
    const previous = repository.getPolicy();
    const profile = repository.getProfile();
    const next: AutonomyPolicy = {
      ...previous,
      ...parsed.value,
      version: previous.version + 1,
      state: 'draft',
      primaryField: profile.primaryField,
      specializations: profile.specializations,
      simulationOnly: true,
    };
    repository.savePolicy(next);
    repository.appendAudit({ type: 'policy.updated', resourceId: 'policy', status: 'recorded', reason: 'Batas kebijakan diperbarui; perlu aktivasi ulang.', policyVersion: next.version, payloadHash: hashPayload(next) });
    return next;
  });
  app.post('/api/policy/activate', async (request, reply) => {
    const parsed = parseBody(activatePolicySchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Aktivasi memerlukan konfirmasi simulasi lokal.', issues: parsed.issues });
    const policy = repository.getPolicy();
    const profile = repository.getProfile();
    if (!profile.primaryField.trim() || profile.specializations.length === 0) return reply.code(409).send({ error: 'Isi bidang utama dan minimal satu spesialisasi sebelum mengaktifkan kebijakan.' });
    if (!policy.allowedActions.includes('bid.submit')) return reply.code(409).send({ error: 'Pilih tindakan bid simulasi yang tercakup kebijakan.' });
    const activated: AutonomyPolicy = { ...policy, state: 'active', primaryField: profile.primaryField, specializations: profile.specializations, simulationOnly: true };
    repository.savePolicy(activated);
    repository.appendAudit({ type: 'policy.activated', resourceId: 'policy', status: 'recorded', reason: 'Pemilik mengaktifkan satu kebijakan simulasi lokal.', policyVersion: activated.version, payloadHash: hashPayload(activated) });
    return { policy: activated, externalWrites: false };
  });
  app.post('/api/policy/pause', async () => {
    const policy = repository.getPolicy();
    const paused: AutonomyPolicy = { ...policy, state: 'paused' };
    repository.savePolicy(paused);
    repository.appendAudit({ type: 'policy.paused', resourceId: 'policy', status: 'recorded', reason: 'Jeda darurat diaktifkan dari dashboard.', policyVersion: paused.version, payloadHash: null });
    return paused;
  });
  app.post('/api/policy/resume', async (_request, reply) => {
    const policy = repository.getPolicy();
    if (policy.state !== 'paused') return reply.code(409).send({ error: 'Kebijakan tidak sedang dijeda.' });
    if (Date.parse(policy.expiresAt) <= now().getTime()) return reply.code(409).send({ error: 'Kebijakan kedaluwarsa dan perlu dikonfigurasi ulang.' });
    const resumed = { ...policy, state: 'active' as const };
    repository.savePolicy(resumed);
    repository.appendAudit({ type: 'policy.resumed', resourceId: 'policy', status: 'recorded', reason: 'Kebijakan dilanjutkan oleh pemilik.', policyVersion: resumed.version, payloadHash: null });
    void options.autopilot?.start();
    return resumed;
  });

  app.get('/api/projects', async (request) => {
    const query = request.query as { search?: string; status?: string };
    const profile = repository.getProfile();
    const search = query.search?.trim().toLowerCase() ?? '';
    return repository.listProjects().map((project) => {
      const assessment = assessProject(project, profile.specializations);
      repository.evaluateProject(project.id, assessment.score, assessment.factors);
      return { ...project, score: assessment.score, factors: assessment.factors };
    }).filter((project) => (!search || `${project.title} ${project.description} ${project.skills.join(' ')}`.toLowerCase().includes(search)) && (!query.status || query.status === 'all' || project.status === query.status))
      .sort((a, b) => b.score - a.score);
  });
  app.get('/api/projects/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID peluang tidak valid.' });
    const project = repository.getProject(params.data.id);
    if (!project) return reply.code(404).send({ error: 'Peluang tidak ditemukan.' });
    return project;
  });
  app.post('/api/projects/:id/draft', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID peluang tidak valid.' });
    const project = repository.getProject(params.data.id);
    if (!project) return reply.code(404).send({ error: 'Peluang tidak ditemukan.' });
    if (project.status !== 'open') return reply.code(409).send({ error: 'Peluang ini sudah tidak terbuka.' });
    if (draftingMode === 'disabled') return reply.code(503).send({ error: options.draftingReason ?? 'Hermes belum aktif. Hubungkan profil Hermes dan aktifkan persetujuan pemrosesan data sebelum meminta draf AI.' });
    const profile = repository.getProfile();
    const score = assessProject(project, profile.specializations).score;
    let generated;
    draftsInProgress += 1;
    try {
      generated = await drafting.draftBid({
        project,
        profileFacts: profile.facts,
        evidence: repository.searchKnowledge(`${project.title} ${project.skills.join(' ')}`, 4).map((item) => ({ label: item.path, source: item.url, content: item.content })),
        profileRate: { min: profile.minPrice, max: profile.maxPrice },
        score,
      });
    } catch {
      repository.appendAudit({ type: 'bid.draft_failed', resourceId: project.id, status: 'failed', reason: 'Adapter drafting gagal atau mengembalikan output yang tidak valid. Tidak ada tindakan marketplace.', policyVersion: repository.getPolicy().version, payloadHash: null });
      return reply.code(503).send({ error: 'Draf tidak dapat dibuat saat ini. Tidak ada tindakan marketplace yang dijalankan.' });
    } finally {
      draftsInProgress -= 1;
    }
    const draft: BidDraft = {
      id: createId('draft'), projectId: project.id, ...generated, currency: project.currency,
      status: 'draft_ready', createdAt: now().toISOString(),
    };
    repository.createDraft(draft);
    repository.appendAudit({ type: 'bid.draft_created', resourceId: project.id, status: 'recorded', reason: draftingMode === 'hermes' ? 'Draf dibuat Hermes dari fakta dan bukti lokal yang dipilih.' : 'Draf dibuat oleh adapter yang secara eksplisit dipilih untuk pengujian.', policyVersion: repository.getPolicy().version, payloadHash: hashPayload({ proposal: draft.proposal, proposedPrice: draft.proposedPrice, currency: draft.currency }) });
    return reply.code(201).send(draft);
  });
  app.put('/api/drafts/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const parsed = parseBody(draftUpdateSchema, request.body);
    if (!params.success) return reply.code(400).send({ error: 'ID draf tidak valid.' });
    if ('issues' in parsed) return reply.code(400).send({ error: 'Draf tidak valid.', issues: parsed.issues });
    const before = repository.getDraft(params.data.id);
    if (!before) return reply.code(404).send({ error: 'Draf tidak ditemukan.' });
    const updated = repository.updateDraft(params.data.id, parsed.value);
    if (!updated) return reply.code(404).send({ error: 'Draf tidak ditemukan.' });
    repository.appendAudit({ type: 'bid.draft_updated', resourceId: updated.projectId, status: 'recorded', reason: 'Pemilik memperbarui draf lokal.', policyVersion: repository.getPolicy().version, payloadHash: hashPayload({ proposal: updated.proposal, proposedPrice: updated.proposedPrice, currency: updated.currency }) });
    return updated;
  });
  app.post('/api/projects/:id/simulate-submit', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID peluang tidak valid.' });
    const project = repository.getProject(params.data.id);
    const draft = repository.getLatestDraft(params.data.id);
    if (!project || !draft) return reply.code(404).send({ error: 'Buat draf sebelum menjalankan simulasi.' });
    const policy = repository.getPolicy();
    const audits = repository.listAudit(1000).filter((event) => event.type === 'bid.simulated' && event.status === 'recorded');
    const today = localDateKey(now(), policy.timezone);
    const week = mondayKey(today);
    const dailyUsed = audits.filter((event) => localDateKey(new Date(event.createdAt), policy.timezone) === today).length;
    const weeklyUsed = audits.filter((event) => mondayKey(localDateKey(new Date(event.createdAt), policy.timezone)) === week).length;
    const payload = { projectId: project.id, proposal: draft.proposal, proposedPrice: draft.proposedPrice, currency: draft.currency, policyVersion: policy.version };
    const decision = decideBid({ policy, project, confidence: draft.confidence, proposedPrice: draft.proposedPrice, dailyUsed, weeklyUsed, now: now() });
    const transition = decision.allowed ? transitionPipeline('draft_ready', 'policy_check') : undefined;
    if (transition && !transition.ok) return reply.code(409).send({ error: 'Status pipeline tidak dapat diperiksa.' });
    const event = repository.appendAudit({
      type: decision.allowed ? 'bid.simulated' : 'bid.simulation_skipped', resourceId: project.id,
      status: decision.allowed ? 'recorded' : 'blocked', reason: decision.reason,
      policyVersion: policy.version, payloadHash: hashPayload(payload),
    });
    return {
      decision,
      event,
      externalWrites: false,
      marketplaceStatus: 'unchanged',
      pipelineStatus: decision.allowed ? 'draft_ready' : repository.listProjects().find((item) => item.id === project.id)?.pipelineStatus ?? 'draft_ready',
    };
  });

  app.get('/api/pipeline', async () => repository.listProjects().map((project) => ({
    ...project,
    latestDraft: repository.getLatestDraft(project.id) ?? null,
  })).sort((a, b) => b.score - a.score));
  app.get('/api/dashboard', async () => {
    const projects = repository.listProjects();
    const activity = repository.listAudit(8);
    const audits = repository.listAudit(5_000);
    const sources = repository.listKnowledgeSources();
    const policy = repository.getPolicy();
    const profile = repository.getProfile();
    const currentDate = localDateKey(now(), policy.timezone);
    const currentWeek = mondayKey(currentDate);
    const bidAudits = audits.filter((event) => event.type === 'marketplace.production.submit_bid' && event.status === 'recorded');
    return {
      mode: 'workspace lokal',
      counts: {
        openProjects: projects.filter((project) => project.status === 'open').length,
        drafts: projects.filter((project) => repository.getLatestDraft(project.id)).length,
        submittedBids: projects.filter((project) => project.pipelineStatus === 'submitted').length,
        policySkips: repository.countAuditByStatus('blocked'),
        knowledgeSources: sources.length,
      },
      policy: { state: policy.state, version: policy.version, simulationOnly: policy.simulationOnly },
      bidUsage: {
        today: bidAudits.filter((event) => localDateKey(new Date(event.createdAt), policy.timezone) === currentDate).length,
        week: bidAudits.filter((event) => mondayKey(localDateKey(new Date(event.createdAt), policy.timezone)) === currentWeek).length,
      },
      profileComplete: Boolean(profile.primaryField && profile.specializations.length),
      projects: projects.slice(0, 4),
      activity,
      externalWrites: policy.state === 'active' && !policy.simulationOnly,
    };
  });
  app.get('/api/activity', async (request) => {
    const query = request.query as { limit?: string };
    const limit = Math.max(1, Math.min(100, Number.parseInt(query.limit ?? '50', 10) || 50));
    return repository.listAudit(limit);
  });

  app.get('/api/knowledge', async () => ({
    sources: repository.listKnowledgeSources(),
    coverage: repository.knowledgeCoverage(),
    freshness: repository.listKnowledgeSources().map(({ id, updatedAt }) => ({ id, updatedAt })),
    searchMode: 'sqlite-fts5',
  }));
  app.post('/api/knowledge/import', async (request, reply) => {
    const parsed = parseBody(knowledgeImportSchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Impor tidak valid.', issues: parsed.issues });
    const sourceId = createId('source');
    const updatedAt = now().toISOString();
    const chunks = [];
    const rejected: Array<{ path: string; code: string; reason: string }> = [];
    for (const file of parsed.value.files) {
      const prepared = prepareKnowledgeFile({ ...file, sourceId, provider: parsed.value.provider, label: parsed.value.label, referenceUrl: parsed.value.referenceUrl, sourceRef: parsed.value.sourceRef || 'user-import', updatedAt });
      if (prepared.ok) chunks.push(...prepared.chunks);
      else rejected.push({ path: file.path, code: prepared.code, reason: prepared.reason });
    }
    if (chunks.length === 0) return reply.code(422).send({ error: 'Tidak ada konten yang lolos pemeriksaan sebelum indeks.', rejected });
    const source = repository.createKnowledgeSource({ id: sourceId, provider: parsed.value.provider, label: parsed.value.label, referenceUrl: parsed.value.referenceUrl, updatedAt }, chunks);
    repository.appendAudit({ type: 'knowledge.imported', resourceId: sourceId, status: 'recorded', reason: `${chunks.length} potongan teks ditambahkan; ${rejected.length} file dikecualikan.`, policyVersion: repository.getPolicy().version, payloadHash: null });
    return reply.code(201).send({ source, chunks: chunks.length, rejected });
  });
  const githubAdapter = () => {
    const token = options.getGitHubToken?.() ?? options.githubToken;
    return new GitHubReadAdapter({ ...(token ? { token } : {}), ...(options.fetcher ? { fetcher: options.fetcher } : {}) });
  };
  // Re-syncing a repository replaces its previous source instead of indexing it twice.
  const syncGitHubRepository = async (adapter: GitHubReadAdapter, name: string) => {
    const result = await adapter.readRepository(name);
    const sourceId = createId('source');
    const updatedAt = now().toISOString();
    const repositoryUrl = `https://github.com/${result.repository}`;
    const chunks = [];
    let rejected = 0;
    for (const file of result.files) {
      const prepared = prepareKnowledgeFile({ sourceId, provider: 'github', label: result.repository, referenceUrl: repositoryUrl, sourceRef: result.ref, updatedAt, path: file.path, content: file.content });
      if (prepared.ok) chunks.push(...prepared.chunks);
      else rejected += 1;
    }
    if (!chunks.length) return { result, chunks: 0, rejected, source: null };
    for (const old of repository.listKnowledgeSources()) if (old.provider === 'github' && old.label === result.repository) repository.deleteKnowledgeSource(old.id);
    const source = repository.createKnowledgeSource({ id: sourceId, provider: 'github', label: result.repository, referenceUrl: repositoryUrl, updatedAt }, chunks);
    repository.appendAudit({ type: 'knowledge.github_sync', resourceId: sourceId, status: 'recorded', reason: `${result.repository}: ${result.fetched} file dibaca pada ${result.ref}; ${rejected + result.skipped} file dilewati.`, policyVersion: repository.getPolicy().version, payloadHash: null });
    return { result, chunks: chunks.length, rejected, source };
  };

  app.post('/api/knowledge/github/sync', async (request, reply) => {
    const parsed = parseBody(githubSyncSchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Repositori tidak valid.', issues: parsed.issues });
    try {
      const { result, chunks, rejected, source } = await syncGitHubRepository(githubAdapter(), parsed.value.repository);
      if (!source) return reply.code(422).send({ error: 'Tidak ada file yang lolos pemeriksaan sebelum indeks.', filesSeen: result.fetched, rejected });
      return reply.code(201).send({ source, branch: result.branch, ref: result.ref, filesSeen: result.fetched, chunks, rejected: rejected + result.skipped, complete: result.skipped === 0 });
    } catch (error) {
      if (error instanceof GitHubReadError) return reply.code(error.code === 'permission_denied' ? 403 : error.code === 'repository_not_found' ? 404 : 502).send({ error: error.message, code: error.code });
      return reply.code(502).send({ error: 'Sinkronisasi GitHub gagal; tidak ada data yang ditambahkan.' });
    }
  });

  app.post('/api/knowledge/github/sync-all', async (_request, reply) => {
    if (!(options.getGitHubToken?.() ?? options.githubToken)) return reply.code(400).send({ error: 'Token GitHub belum diatur; daftar repositori milik Anda tidak dapat dibaca.' });
    const adapter = githubAdapter();
    let names: string[];
    try {
      names = await adapter.listOwnRepositories();
    } catch (error) {
      return reply.code(error instanceof GitHubReadError && error.code === 'permission_denied' ? 403 : 502).send({ error: error instanceof Error ? error.message : 'Daftar repositori tidak dapat dibaca.' });
    }
    const repositories: Array<{ repository: string; chunks: number; error: string | null }> = [];
    for (const name of names) {
      try {
        const { chunks } = await syncGitHubRepository(adapter, name);
        repositories.push({ repository: name, chunks, error: chunks ? null : 'Tidak ada file teks yang lolos pemeriksaan.' });
      } catch (error) {
        repositories.push({ repository: name, chunks: 0, error: error instanceof Error ? error.message : 'Gagal dibaca.' });
      }
    }
    return { repositories, synced: repositories.filter((item) => item.chunks > 0).length, chunks: repositories.reduce((total, item) => total + item.chunks, 0) };
  });

  app.post('/api/knowledge/search', async (request, reply) => {
    const parsed = parseBody(knowledgeSearchSchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Pencarian tidak valid.', issues: parsed.issues });
    return repository.searchKnowledge(parsed.value.query, parsed.value.limit);
  });
  app.delete('/api/knowledge/sources/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID sumber tidak valid.' });
    if (!repository.deleteKnowledgeSource(params.data.id)) return reply.code(404).send({ error: 'Sumber tidak ditemukan.' });
    repository.appendAudit({ type: 'knowledge.deleted', resourceId: params.data.id, status: 'recorded', reason: 'Sumber dan potongan indeks terkait dihapus.', policyVersion: repository.getPolicy().version, payloadHash: null });
    return { deleted: true, id: params.data.id };
  });

  app.get('/api/settings', async () => {
    refreshProductionWriteChecks();
    const credentialStatus = options.getCredentialStatus?.() ?? options.credentialStatus;
    const linkedinStatus = linkedinVerification(credentialStatus, now());
    const writeOperations = Object.fromEntries((['submit_bid', 'edit_profile', 'send_message'] as const).map((operation) => [
      operation,
      freelancerProductionWriteChecks.get(operation)?.statusCode === 200 ? 'supported' : 'unknown',
    ]));
    const writeValues = Object.values(writeOperations);
    const writes = writeValues.every((status) => status === 'supported') ? 'supported' : writeValues.some((status) => status === 'supported') ? 'partial' : 'unknown';
    return {
      workspace: { id: 'workspace_local', name: 'Freelancer Virtual House', accountMode: 'single-user lokal' },
      fields: ['Fullstack Engineer', 'Backend Engineer', 'Android Engineer', 'iOS Engineer', 'Frontend Engineer', 'DevOps Engineer', 'QA Engineer', 'UI/UX Designer', 'Data Engineer', 'Technical Writer'],
      profile: repository.getProfile(),
      capabilities: {
        freelancer: {
          connection: freelancerVerification?.connected ? 'connected' : freelancerVerification?.reason === 'invalid_token' ? 'invalid' : freelancerVerification ? 'unavailable' : 'unverified',
          readProjects: freelancerVerification?.readProjects ? 'supported' : 'unknown',
          readProfile: freelancerVerification?.readProfile ? 'supported' : 'unknown',
          readPortfolio: freelancerVerification?.readPortfolio ? 'supported' : freelancerVerification?.portfolioError === 'scope_denied' ? 'unsupported' : 'unknown',
          readMessages: freelancerVerification?.readMessages ? 'supported' : freelancerVerification?.messagesError === 'scope_denied' ? 'unsupported' : 'unknown',
          writes,
          writeOperations,
        },
        github: 'read-only',
        linkedin: { read: linkedinStatus.authorized ? 'oidc-lite' : 'manual-only', clientConfigured: credentialStatus?.linkedinClientConfigured ?? false, authorized: linkedinStatus.authorized, verificationStatus: linkedinStatus.verificationStatus },
        hermes: 'optional',
      },
      externalWrites: repository.getPolicy().state === 'active' && !repository.getPolicy().simulationOnly,
    };
  });

  app.setErrorHandler((_error, _request, reply) => reply.code(500).send({ error: 'Permintaan tidak dapat diproses.' }));
  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split('?')[0] ?? request.url;
    if (options.spaFallback && ['GET', 'HEAD'].includes(request.method) && pathname !== '/api' && !pathname.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Endpoint tidak ditemukan.' });
  });
  app.addHook('onClose', async () => {
    options.autopilot?.stop();
    options.linkedinOAuth?.close();
    if (!options.repository) repository.close();
  });
  return app;
}
