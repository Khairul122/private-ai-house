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
import { CODING_KEYWORD_GROUPS, CODING_KEYWORDS, transitionPipeline } from '@fvh/domain';
import type { AutonomyPolicy, BidDraft, ProjectOpportunity } from '@fvh/domain';
import { prepareKnowledgeFile } from '@fvh/knowledge';
import { WorkspaceRepository } from '@fvh/persistence';
import type { CredentialStatus, FreelancerVerification } from './credential-store.js';
import type { LinkedInOAuthService } from './linkedin-oauth.js';
import { localDateKey, mondayKey } from './autopilot.js';
import type { FreelancerAutopilot } from './autopilot.js';
import type { BusinessSync } from './business-sync.js';
import { OperationsService } from './operations.js';
import { registerOperationsRoutes } from './operations-routes.js';
import type { WhatsAppService } from './whatsapp.js';
import type { GoogleCalendarService } from './google-calendar.js';

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
  operations?: OperationsService;
  whatsapp?: WhatsAppService;
  googleCalendar?: GoogleCalendarService;
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
  syncLinkedIn?: () => Promise<{ sourceId: string; chunks: number }>;
  fetcher?: typeof fetch;
  clock?: () => Date;
  drafting?: AiDraftingPort;
  draftingMode?: 'disabled' | 'fixture' | 'hermes';
  draftingReason?: string;
  publicPortfolio?: (evidence:Parameters<AiDraftingPort['draftBid']>[0]['evidence'])=>Promise<Array<{label:string;url:string}>>;
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

async function readProductionWriteChecks(repository: WorkspaceRepository): Promise<Map<FreelancerWriteOperation, FreelancerProductionWriteCheck>> {
  const checks = new Map<FreelancerWriteOperation, FreelancerProductionWriteCheck>();
  const operations = new Set<FreelancerWriteOperation>(['submit_bid', 'edit_profile', 'send_message']);
  for (const event of await repository.listAudit(1_000)) {
    const prefix = 'marketplace.production.';
    if (!event.type.startsWith(prefix) || event.status === 'allowed') continue;
    const operation = event.type.slice(prefix.length) as FreelancerWriteOperation;
    if (!operations.has(operation) || checks.get(operation)?.statusCode === 200) continue;
    const statusCode = event.reason.match(/HTTP (\d{3})/)?.[1];
    if (checks.has(operation) && statusCode !== '200') continue;
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

export async function createApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const repository = options.repository ?? await WorkspaceRepository.open();
  const now = options.clock ?? (() => new Date());
  const drafting = options.drafting ?? new UnavailableDraftingAdapter();
  const draftingMode = options.drafting ? options.draftingMode ?? 'fixture' : 'disabled';
  // Lets the office show the Hermes lead as working only while a draft request is actually running.
  let draftsInProgress = 0;
  const app = Fastify({ logger: false, bodyLimit: 2_500_000, trustProxy: false });
  const operations = options.operations ?? new OperationsService({ repository });
  let freelancerVerification: FreelancerVerification | null = null;
  const freelancerSandboxWriteChecks = new Map<FreelancerSandboxWriteOperation, FreelancerSandboxWriteCheck>();
  const freelancerProductionWriteChecks = await readProductionWriteChecks(repository);
  const refreshProductionWriteChecks = async () => {
    for (const [operation, check] of await readProductionWriteChecks(repository)) freelancerProductionWriteChecks.set(operation, check);
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
    ok: true, mode: 'local', database: 'supabase', ai: draftingMode, liveWrites: (await options.autopilot?.getStatus())?.state === 'running',
    manualProductionWritesConfigured: (options.getCredentialStatus?.() ?? options.credentialStatus)?.freelancerAccessTokenConfigured ?? false,
    autopilot: (await options.autopilot?.getStatus())?.state ?? 'unavailable',
  }));
  app.get('/api/autopilot', async () => await options.autopilot?.getStatus() ?? {
    state: 'blocked', lastRunAt: null, nextRunAt: null, lastMessage: 'Autopilot belum tersedia pada server ini.', lastImported: 0, lastSubmitted: 0, specializations: [],
  });
  app.get('/api/business-sync', async () => options.businessSync?.getStatus() ?? null);
  registerOperationsRoutes(app, {repository,operations,whatsapp:options.whatsapp,google:options.googleCalendar});
  // Thread project ids are bare Freelancer ids; local project ids are 'freelancer:<id>'.
  const threadProjectIds = async () => new Set((await repository.listClientThreads()).map((thread) => thread.projectId).filter((id): id is string => id !== null).map((id) => `freelancer:${id}`));
  const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

  app.get('/api/insights/bids', async () => {
    const outcomes = await repository.listBidOutcomes();
    const won = outcomes.filter(({ outcome }) => outcome === 'won').length;
    const lost = outcomes.filter(({ outcome }) => outcome === 'lost').length;
    const pending = outcomes.filter(({ outcome }) => outcome === 'pending').length;
    const conversations = await threadProjectIds();
    const since = new Date(now().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const reasons = await repository.skipReasonSummary(since);
    const sync = options.businessSync?.getStatus().outcomes;
    const lastChecked = outcomes.map(({ checkedAt }) => checkedAt).filter((value): value is string => value !== null).sort().at(-1) ?? null;
    return {
      outcomes: { submitted: outcomes.length, won, lost, pending, withConversation: outcomes.filter((row) => conversations.has(row.projectId)).length, winRate: won + lost === 0 ? null : won / (won + lost) },
      recent: await Promise.all(outcomes.slice(0, 10).map(async (outcome) => ({ projectId: outcome.projectId, title: (await repository.getProject(outcome.projectId))?.title ?? null, submittedAt: outcome.submittedAt, outcome: outcome.outcome, awardStatus: outcome.awardStatus, checkedAt: outcome.checkedAt }))),
      skips: { total: reasons.reduce((total, reason) => total + Number(reason.total), 0), recent7d: reasons.reduce((total, reason) => total + Number(reason.recent), 0), reasons },
      lastCheck: sync?.lastRunAt ? { at: sync.lastRunAt, ok: sync.ok, error: sync.error } : { at: lastChecked, ok: lastChecked ? true : null, error: null },
    };
  });

  app.get('/api/inbox', async () => {
    const sync = options.businessSync?.getStatus().messages ?? null;
    const selfId = sync?.selfId ?? null;
    const nowMs = now().getTime();
    const needsReply = selfId === null ? [] : await Promise.all((await repository.listClientThreads())
      .filter((thread) => thread.lastSenderId !== selfId)
      .sort((a, b) => a.lastMessageAt.localeCompare(b.lastMessageAt))
      .map(async (thread) => ({
        threadId: thread.threadId, projectId: thread.projectId, preview: thread.preview, lastMessageAt: thread.lastMessageAt,
        projectTitle: thread.projectId ? (await repository.getProject(`freelancer:${thread.projectId}`))?.title ?? null : null,
        waitingHours: Math.max(0, Math.floor((nowMs - Date.parse(thread.lastMessageAt)) / 3_600_000)),
      })));
    const conversations = await threadProjectIds();
    const followUps = (await Promise.all((await repository.listBidOutcomes())
      .filter((row) => row.outcome === 'pending' && !conversations.has(row.projectId))
      .map(async (row) => ({ projectId: row.projectId, title: (await repository.getProject(row.projectId))?.title ?? row.projectId, submittedAt: row.submittedAt, daysSinceBid: Math.floor((nowMs - Date.parse(row.submittedAt)) / 86_400_000) }))))
      .filter((row) => row.daysSinceBid >= FOLLOW_UP_DAYS);
    return { sync: sync && { lastRunAt: sync.lastRunAt, ok: sync.ok, error: sync.error }, needsReply, followUps };
  });

  app.get('/api/work', async () => {
    const policy = await repository.getPolicy();
    const today = localDateKey(now(), policy.timezone);
    const month = today.slice(0, 7);
    const projectsById = new Map((await repository.listClientProjects()).map((project) => [project.id, project]));
    const projects = [...projectsById.values()]
      .map((project) => ({ ...project, daysToDeadline: project.deadline ? dayDiff(today, project.deadline) : null }))
      .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || (a.daysToDeadline ?? Infinity) - (b.daysToDeadline ?? Infinity));
    const payments = await repository.listPayments();
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
    const project = await repository.createClientProject({ ...parsed.value, externalProjectId: null });
    if (!project) return reply.code(409).send({ error: 'Proyek sudah ada.' });
    await repository.appendAudit({ type: 'work.project_created', resourceId: project.id, status: 'recorded', reason: `Proyek klien "${project.title}" ditambahkan.`, policyVersion: null, payloadHash: null });
    return reply.code(201).send(project);
  });

  app.put('/api/work/projects/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const parsed = parseBody(updateClientProjectSchema, request.body);
    if (!params.success || 'issues' in parsed) return reply.code(400).send({ error: 'Perubahan proyek tidak valid.', ...('issues' in parsed ? { issues: parsed.issues } : {}) });
    const patch = Object.fromEntries(Object.entries(parsed.value).filter(([, value]) => value !== undefined));
    const project = await repository.updateClientProject(params.data.id, patch);
    if (!project) return reply.code(404).send({ error: 'Proyek tidak ditemukan.' });
    await repository.appendAudit({ type: 'work.project_updated', resourceId: project.id, status: 'recorded', reason: `Proyek "${project.title}" diperbarui (status ${project.status}).`, policyVersion: null, payloadHash: null });
    return project;
  });

  app.post('/api/work/payments', async (request, reply) => {
    const parsed = parseBody(createPaymentSchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Data pembayaran tidak valid.', issues: parsed.issues });
    if (!await repository.getClientProject(parsed.value.projectId)) return reply.code(404).send({ error: 'Proyek tidak ditemukan.' });
    const payment = await repository.createPayment({ ...parsed.value, receivedAt: parsed.value.status === 'received' ? now().toISOString() : null });
    await repository.appendAudit({ type: 'work.payment_recorded', resourceId: payment.id, status: 'recorded', reason: `Pembayaran ${payment.currency} ${payment.amount} dicatat (${payment.status === 'received' ? 'diterima' : 'diharapkan'}).`, policyVersion: null, payloadHash: null });
    return reply.code(201).send(payment);
  });

  app.post('/api/work/payments/:id/received', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID pembayaran tidak valid.' });
    const payment = await repository.markPaymentReceived(params.data.id, now().toISOString());
    if (!payment) return reply.code(404).send({ error: 'Pembayaran tidak ditemukan.' });
    await repository.appendAudit({ type: 'work.payment_received', resourceId: payment.id, status: 'recorded', reason: `Pembayaran ${payment.currency} ${payment.amount} ditandai diterima.`, policyVersion: null, payloadHash: null });
    return payment;
  });

  app.get('/api/capabilities', async () => {
    await refreshProductionWriteChecks();
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
      verificationStatus: (await repository.listKnowledgeSources()).some((source) => source.provider === 'github') ? 'supported' : 'unknown',
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
      draft: 'optional', active: draftingMode === 'hermes', draftsInProgress: draftsInProgress + ((await options.autopilot?.getStatus())?.draftsInProgress ?? 0),
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
      await repository.appendAudit({
        type: `marketplace.sandbox.${input.operation}_test`, resourceId: result.resultId ?? 'freelancer-sandbox',
        status: success ? 'recorded' : 'failed',
        reason: `Uji tulis sandbox ${input.operation} menghasilkan HTTP ${result.statusCode}. ${resultDescription} Isi payload tidak disimpan.`,
        policyVersion: (await repository.getPolicy()).version, payloadHash: hashPayload(input),
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
      await repository.appendAudit({
        type: `marketplace.sandbox.${input.operation}_test`, resourceId: 'freelancer-sandbox', status: 'failed',
        reason: providerStatusCode === null
          ? `Uji tulis sandbox ${input.operation} tidak menerima hasil; jangan retry sebelum memeriksa sandbox.`
          : `Uji tulis sandbox ${input.operation} menghasilkan HTTP ${providerStatusCode}.`,
        policyVersion: (await repository.getPolicy()).version, payloadHash: hashPayload(input),
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
      await repository.appendAudit({
        type: `marketplace.production.${liveInput.operation}`, resourceId: result.resultId ?? 'freelancer-production',
        status: success ? 'recorded' : 'failed',
        reason: `Operasi live ${liveInput.operation} menghasilkan HTTP ${result.statusCode}. ${resultDescription} Isi payload tidak disimpan.`,
        policyVersion: (await repository.getPolicy()).version, payloadHash: hashPayload(liveInput),
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
      await repository.appendAudit({
        type: `marketplace.production.${liveInput.operation}`, resourceId: 'freelancer-production', status: 'failed',
        reason: providerStatusCode === null
          ? `Hasil operasi live ${liveInput.operation} tidak dapat dipastikan; periksa akun Freelancer sebelum mengulang.`
          : `Operasi live ${liveInput.operation} menghasilkan HTTP ${providerStatusCode}.`,
        policyVersion: (await repository.getPolicy()).version, payloadHash: hashPayload(liveInput),
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
      const synced = await repository.syncFreelancerProjects(result.projects);
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
      await repository.appendAudit({
        type: 'marketplace.projects_synced', resourceId: 'freelancer', status: 'recorded',
        reason: `Sinkronisasi baca-saja menyimpan ${synced.upserted} proyek dari Freelancer; ${result.skipped} hasil tidak valid dilewati.`,
        policyVersion: (await repository.getPolicy()).version, payloadHash: null,
      });
      return { imported: synced.upserted, skipped: result.skipped, projects: (await repository.listProjects()).filter((project) => project.source === 'freelancer') };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Freelancer tidak dapat diperiksa.';
      await repository.appendAudit({ type: 'marketplace.sync_failed', resourceId: 'freelancer', status: 'failed', reason: message, policyVersion: (await repository.getPolicy()).version, payloadHash: null });
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

  app.post('/api/linkedin/sync', async (_request, reply) => {
    if (!options.syncLinkedIn) return reply.code(503).send({ error: 'Sinkronisasi LinkedIn API belum tersedia.' });
    try {
      return { synced: true, ...(await options.syncLinkedIn()) };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'LinkedIn API tidak dapat dibaca.';
      return reply.code(502).send({ error: message });
    }
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

  // Read-only probes of every integration, with the real HTTP status where one exists.
  app.post('/api/integrations/check', async () => {
    const checkedAt = now().toISOString();
    type Probe = { ok: boolean; status: number | null; detail: string };
    const probe = async (id: string, label: string, run: () => Promise<Probe>) => {
      const started = Date.now();
      try { return { id, label, ...(await run()), latencyMs: Date.now() - started, checkedAt }; }
      catch (error) { return { id, label, ok: false, status: null, detail: error instanceof Error ? error.message.slice(0, 200) : 'Pemeriksaan gagal.', latencyMs: Date.now() - started, checkedAt }; }
    };
    const credentialStatus = options.getCredentialStatus?.() ?? options.credentialStatus;
    return await Promise.all([
      probe('supabase', 'Supabase (Postgres)', async () => {
        const [row] = await repository.sql.query<{ projects: number; chunks: number }>('SELECT (SELECT COUNT(*) FROM projects)::int AS projects, (SELECT COUNT(*) FROM knowledge_chunks)::int AS chunks');
        return { ok: true, status: 200, detail: `Query berhasil di schema fvh: ${row?.projects ?? 0} proyek, ${row?.chunks ?? 0} potongan knowledge.` };
      }),
      probe('freelancer', 'Freelancer.com (baca)', async () => {
        if (!credentialStatus?.freelancerAccessTokenConfigured || !options.verifyFreelancer) return { ok: false, status: null, detail: 'Token Freelancer belum dikonfigurasi.' };
        const result = await options.verifyFreelancer();
        const reads = [['profil', result.readProfile], ['proyek', result.readProjects], ['portofolio', result.readPortfolio ?? false], ['pesan', result.readMessages ?? false]].map(([name, ok]) => `${name}: ${ok ? 'ok' : 'gagal'}`).join(', ');
        return { ok: result.connected, status: result.connected ? 200 : null, detail: `${reads}.${result.connected ? '' : ` Alasan: ${result.reason}.`}` };
      }),
      probe('github', 'GitHub (baca repo)', async () => {
        const token = options.getGitHubToken?.() ?? options.githubToken;
        const response = await (options.fetcher ?? fetch)('https://api.github.com/rate_limit', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'freelancer-virtual-house', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(10_000) });
        const body = (await response.json().catch(() => null)) as { resources?: { core?: { remaining?: number; limit?: number } } } | null;
        const core = body?.resources?.core;
        return { ok: response.ok, status: response.status, detail: response.ok ? `${token ? 'Token terdaftar' : 'Tanpa token'}; sisa kuota API ${core?.remaining ?? '?'} dari ${core?.limit ?? '?'}.` : `GitHub menolak permintaan (${response.status}).` };
      }),
      probe('linkedin', 'LinkedIn (OIDC)', async () => {
        const state = linkedinVerification(credentialStatus, now());
        const expiry = credentialStatus?.linkedinAccessTokenExpiresAt;
        return { ok: state.authorized, status: null, detail: state.authorized ? `Token tersimpan, berlaku sampai ${expiry}. Tidak diuji langsung ke LinkedIn.` : state.verificationStatus === 'expired' ? 'Token sudah kedaluwarsa.' : 'Belum terhubung.' };
      }),
      probe('hermes', 'Hermes Agent (draf)', async () => ({ ok: draftingMode === 'hermes', status: null, detail: draftingMode === 'hermes' ? 'Aktif; proposal ditulis lewat profil Hermes lokal.' : options.draftingReason ?? 'Nonaktif.' })),
      probe('autopilot', 'Autopilot', async () => {
        const status = await options.autopilot?.getStatus();
        return { ok: status?.state === 'running', status: null, detail: status ? `${status.state}: ${status.lastMessage}` : 'Autopilot tidak tersedia di server ini.' };
      }),
    ]);
  });

  app.get('/api/profile', async () => await repository.getProfile());
  app.put('/api/profile', async (request, reply) => {
    const parsed = parseBody(updateProfileSchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Profil tidak valid.', issues: parsed.issues });
    const profile = parsed.value;
    await repository.saveProfile(profile);
    const policy = await repository.getPolicy();
    if (policy.state === 'active') {
      const changed: AutonomyPolicy = { ...policy, state: 'draft', version: policy.version + 1, primaryField: profile.primaryField, specializations: profile.specializations };
      await repository.savePolicy(changed);
      await repository.appendAudit({ type: 'policy.reactivation_required', resourceId: 'policy', status: 'recorded', reason: 'Profil berubah; kebijakan kembali ke draf dan perlu diaktifkan ulang.', policyVersion: changed.version, payloadHash: null });
    } else {
      await repository.savePolicy({ ...policy, primaryField: profile.primaryField, specializations: profile.specializations });
    }
    await repository.appendAudit({ type: 'profile.updated', resourceId: 'profile', status: 'recorded', reason: 'Fakta dan bidang kerja lokal diperbarui.', policyVersion: (await repository.getPolicy()).version, payloadHash: null });
    return { profile, policy: await repository.getPolicy() };
  });

  app.get('/api/policy', async () => await repository.getPolicy());
  app.get('/api/policy/presets', async () => ({ groups: CODING_KEYWORD_GROUPS, keywords: CODING_KEYWORDS, searchTermsPerCycle: 8, supportedBids: 'Harga tetap, USD', storage: 'supabase' }));
  app.put('/api/policy', async (request, reply) => {
    const parsed = parseBody(updatePolicySchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Kebijakan tidak valid.', issues: parsed.issues });
    const previous = await repository.getPolicy();
    if (parsed.value.expectedVersion !== undefined && parsed.value.expectedVersion !== previous.version) return reply.code(409).send({ error: 'Kebijakan sudah berubah. Muat ulang sebelum menyimpan.' });
    const profile = await repository.getProfile();
    const { expectedVersion: _expectedVersion, validityDays, ...changes } = parsed.value;
    void _expectedVersion;
    const keepLive = previous.state === 'active' && !previous.simulationOnly;
    const next: AutonomyPolicy = {
      ...previous,
      ...changes,
      ...(validityDays === undefined ? {} : { expiresAt: new Date(now().getTime() + validityDays * 86_400_000).toISOString() }),
      version: previous.version + 1,
      state: previous.state,
      primaryField: profile.primaryField,
      specializations: profile.specializations,
      simulationOnly: previous.simulationOnly,
    };
    if (!await repository.savePolicyIfVersion(next, previous.version)) return reply.code(409).send({ error: 'Kebijakan berubah saat penyimpanan. Muat ulang sebelum menyimpan.' });
    await repository.appendAudit({ type: 'policy.updated', resourceId: 'policy', status: 'recorded', reason: keepLive ? 'Batas kebijakan live diperbarui; langsung berlaku di siklus berikutnya.' : 'Batas kebijakan diperbarui; perlu aktivasi ulang.', policyVersion: next.version, payloadHash: hashPayload(next) });
    return next;
  });
  app.post('/api/policy/activate', async (request, reply) => {
    const parsed = parseBody(activatePolicySchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Pilih dan konfirmasikan mode simulasi atau bid live.', issues: parsed.issues });
    const policy = await repository.getPolicy();
    if (policy.state === 'paused') return reply.code(409).send({ error: 'Kebijakan dijeda. Gunakan tindakan lanjutkan oleh pemilik.' });
    if (!Number.isFinite(Date.parse(policy.expiresAt)) || Date.parse(policy.expiresAt) <= now().getTime()) return reply.code(409).send({ error: 'Perbarui masa berlaku sebelum aktivasi.' });
    const live = 'confirmLive' in parsed.value;
    if (live && (!options.autopilot || !(options.getCredentialStatus?.() ?? options.credentialStatus)?.freelancerAccessTokenConfigured)) return reply.code(409).send({ error: 'Autopilot dan kredensial Freelancer harus tersedia sebelum aktivasi live.' });
    const profile = await repository.getProfile();
    if (!profile.primaryField.trim() || profile.specializations.length === 0) return reply.code(409).send({ error: 'Isi bidang utama dan minimal satu spesialisasi sebelum mengaktifkan kebijakan.' });
    if (!policy.allowedActions.includes('bid.submit')) return reply.code(409).send({ error: 'Pilih tindakan bid simulasi yang tercakup kebijakan.' });
    const activated: AutonomyPolicy = { ...policy, version: policy.version + 1, state: 'active', primaryField: profile.primaryField, specializations: profile.specializations, simulationOnly: !live };
    await repository.savePolicy(activated);
    await repository.appendAudit({ type: 'policy.activated', resourceId: 'policy', status: 'recorded', reason: live ? 'Pemilik mengaktifkan bid live dalam batas kebijakan tersimpan.' : 'Pemilik mengaktifkan satu kebijakan simulasi lokal.', policyVersion: activated.version, payloadHash: hashPayload(activated) });
    if (live) void options.autopilot?.start();
    return { policy: activated, externalWrites: live };
  });
  app.post('/api/policy/pause', async () => {
    const policy = await repository.getPolicy();
    const paused: AutonomyPolicy = { ...policy, state: 'paused', version: policy.version + 1 };
    await repository.savePolicy(paused);
    await repository.appendAudit({ type: 'policy.paused', resourceId: 'policy', status: 'recorded', reason: 'Jeda darurat diaktifkan dari dashboard.', policyVersion: paused.version, payloadHash: null });
    return paused;
  });
  app.post('/api/policy/resume', async (_request, reply) => {
    const policy = await repository.getPolicy();
    if (policy.state !== 'paused') return reply.code(409).send({ error: 'Kebijakan tidak sedang dijeda.' });
    if (!Number.isFinite(Date.parse(policy.expiresAt)) || Date.parse(policy.expiresAt) <= now().getTime()) return reply.code(409).send({ error: 'Kebijakan kedaluwarsa dan perlu dikonfigurasi ulang.' });
    const resumed = { ...policy, state: 'active' as const, version: policy.version + 1 };
    await repository.savePolicy(resumed);
    await repository.appendAudit({ type: 'policy.resumed', resourceId: 'policy', status: 'recorded', reason: 'Kebijakan dilanjutkan oleh pemilik.', policyVersion: resumed.version, payloadHash: null });
    void options.autopilot?.start();
    return resumed;
  });

  app.get('/api/projects', async (request) => {
    const query = request.query as { search?: string; status?: string };
    const profile = await repository.getProfile();
    const search = query.search?.trim().toLowerCase() ?? '';
    const assessed = (await repository.listProjects()).map((project) => {
      const assessment = assessProject(project, profile.specializations);
      return { ...project, score: assessment.score, factors: assessment.factors };
    });
    await repository.evaluateProjects(assessed.map((project) => ({ id: project.id, score: project.score, factors: project.factors })));
    return assessed.filter((project) => (!search || `${project.title} ${project.description} ${project.skills.join(' ')}`.toLowerCase().includes(search)) && (!query.status || query.status === 'all' || project.status === query.status))
      .sort((a, b) => b.score - a.score);
  });
  app.get('/api/projects/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID peluang tidak valid.' });
    const project = await repository.getProject(params.data.id);
    if (!project) return reply.code(404).send({ error: 'Peluang tidak ditemukan.' });
    return project;
  });
  app.get('/api/projects/:id/draft', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID peluang tidak valid.' });
    return { draft: await repository.getLatestDraft(params.data.id) ?? null };
  });
  app.post('/api/projects/:id/draft', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID peluang tidak valid.' });
    const project = await repository.getProject(params.data.id);
    if (!project) return reply.code(404).send({ error: 'Peluang tidak ditemukan.' });
    if (project.status !== 'open') return reply.code(409).send({ error: 'Peluang ini sudah tidak terbuka.' });
    if (draftingMode === 'disabled') return reply.code(503).send({ error: options.draftingReason ?? 'Hermes belum aktif. Hubungkan profil Hermes dan aktifkan persetujuan pemrosesan data sebelum meminta draf AI.' });
    const profile = await repository.getProfile();
    const score = assessProject(project, profile.specializations).score;
    let generated;
    draftsInProgress += 1;
    try {
      const evidence=(await repository.searchKnowledge(`${project.title} ${project.skills.join(' ')}`,4)).map(item=>({label:item.path,source:item.url,content:item.content}));
      generated = await drafting.draftBid({
        project,
        profileFacts: profile.facts,
        evidence,publicPortfolio:await options.publicPortfolio?.(evidence).catch(()=>[]) ?? [],
        profileRate: { min: profile.minPrice, max: profile.maxPrice },
        score,
      });
    } catch {
      await repository.appendAudit({ type: 'bid.draft_failed', resourceId: project.id, status: 'failed', reason: 'Adapter drafting gagal atau mengembalikan output yang tidak valid. Tidak ada tindakan marketplace.', policyVersion: (await repository.getPolicy()).version, payloadHash: null });
      return reply.code(503).send({ error: 'Draf tidak dapat dibuat saat ini. Tidak ada tindakan marketplace yang dijalankan.' });
    } finally {
      draftsInProgress -= 1;
    }
    const draft: BidDraft = {
      id: createId('draft'), projectId: project.id, ...generated, currency: project.currency,
      status: 'draft_ready', createdAt: now().toISOString(),
    };
    await repository.createDraft(draft);
    await repository.appendAudit({ type: 'bid.draft_created', resourceId: project.id, status: 'recorded', reason: draftingMode === 'hermes' ? 'Draf dibuat Hermes dari fakta dan bukti lokal yang dipilih.' : 'Draf dibuat oleh adapter yang secara eksplisit dipilih untuk pengujian.', policyVersion: (await repository.getPolicy()).version, payloadHash: hashPayload({ proposal: draft.proposal, proposedPrice: draft.proposedPrice, currency: draft.currency }) });
    return reply.code(201).send(draft);
  });
  app.put('/api/drafts/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const parsed = parseBody(draftUpdateSchema, request.body);
    if (!params.success) return reply.code(400).send({ error: 'ID draf tidak valid.' });
    if ('issues' in parsed) return reply.code(400).send({ error: 'Draf tidak valid.', issues: parsed.issues });
    const before = await repository.getDraft(params.data.id);
    if (!before) return reply.code(404).send({ error: 'Draf tidak ditemukan.' });
    const updated = await repository.updateDraft(params.data.id, parsed.value);
    if (!updated) return reply.code(404).send({ error: 'Draf tidak ditemukan.' });
    await repository.appendAudit({ type: 'bid.draft_updated', resourceId: updated.projectId, status: 'recorded', reason: 'Pemilik memperbarui draf lokal.', policyVersion: (await repository.getPolicy()).version, payloadHash: hashPayload({ proposal: updated.proposal, proposedPrice: updated.proposedPrice, currency: updated.currency }) });
    return updated;
  });
  app.post('/api/projects/:id/simulate-submit', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID peluang tidak valid.' });
    const project = await repository.getProject(params.data.id);
    const draft = await repository.getLatestDraft(params.data.id);
    if (!project || !draft) return reply.code(404).send({ error: 'Buat draf sebelum menjalankan simulasi.' });
    const policy = await repository.getPolicy();
    const audits = (await repository.listAudit(1000)).filter((event) => event.type === 'bid.simulated' && event.status === 'recorded');
    const today = localDateKey(now(), policy.timezone);
    const week = mondayKey(today);
    const dailyUsed = audits.filter((event) => localDateKey(new Date(event.createdAt), policy.timezone) === today).length;
    const weeklyUsed = audits.filter((event) => mondayKey(localDateKey(new Date(event.createdAt), policy.timezone)) === week).length;
    const payload = { projectId: project.id, proposal: draft.proposal, proposedPrice: draft.proposedPrice, currency: draft.currency, policyVersion: policy.version };
    const decision = decideBid({ policy, project, confidence: draft.confidence, proposedPrice: draft.proposedPrice, dailyUsed, weeklyUsed, now: now() });
    const transition = decision.allowed ? transitionPipeline('draft_ready', 'policy_check') : undefined;
    if (transition && !transition.ok) return reply.code(409).send({ error: 'Status pipeline tidak dapat diperiksa.' });
    const event = await repository.appendAudit({
      type: decision.allowed ? 'bid.simulated' : 'bid.simulation_skipped', resourceId: project.id,
      status: decision.allowed ? 'recorded' : 'blocked', reason: decision.reason,
      policyVersion: policy.version, payloadHash: hashPayload(payload),
    });
    return {
      decision,
      event,
      externalWrites: false,
      marketplaceStatus: 'unchanged',
      pipelineStatus: decision.allowed ? 'draft_ready' : (await repository.listProjects()).find((item) => item.id === project.id)?.pipelineStatus ?? 'draft_ready',
    };
  });

  app.get('/api/pipeline', async () => {
    const drafts = await repository.latestDrafts();
    return (await repository.listProjects()).map((project) => ({ ...project, latestDraft: drafts.get(project.id) ?? null })).sort((a, b) => b.score - a.score);
  });
  app.get('/api/dashboard', async () => {
    const projects = await repository.listProjects();
    const draftCount = (await repository.latestDrafts()).size;
    const activity = await repository.listAudit(8);
    const sources = await repository.listKnowledgeSources();
    const policy = await repository.getPolicy();
    const profile = await repository.getProfile();
    return {
      mode: 'workspace lokal',
      counts: {
        openProjects: projects.filter((project) => project.status === 'open').length,
        drafts: draftCount,
        submittedBids: projects.filter((project) => project.pipelineStatus === 'submitted').length,
        policySkips: await repository.countAuditByStatus('blocked'),
        knowledgeSources: sources.length,
      },
      policy: { state: policy.state, version: policy.version, simulationOnly: policy.simulationOnly },
      bidUsage: await repository.bidUsage(now(), policy.timezone),
      profileComplete: Boolean(profile.primaryField && profile.specializations.length),
      projects: projects.slice(0, 4),
      activity,
      externalWrites: policy.state === 'active' && !policy.simulationOnly,
    };
  });
  const agendaSchema = z.object({ days: z.coerce.number().int().min(1).max(366).default(120), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
  const agendaCategory = (type: string, status: string): string | null => {
    if (type === 'marketplace.production.submit_bid') return status === 'recorded' ? 'bidSent' : status === 'failed' ? 'bidFailed' : null;
    if (type === 'autopilot.cycle') return 'cycles';
    if (type === 'autopilot.bid_skipped') return 'skipped';
    if (type.startsWith('policy.') || type === 'autopilot.policy_bootstrapped') return 'policy';
    if (type.startsWith('bid.draft') || type === 'autopilot.draft_fallback') return 'drafts';
    if (type.startsWith('knowledge.')) return 'knowledge';
    if (type.startsWith('business.') || type.startsWith('marketplace.')) return 'sync';
    return 'other';
  };
  // Past activity for the calendar: per-day counts, or the events of one day when ?date= is given.
  app.get('/api/agenda/activity', async (request, reply) => {
    const parsed = agendaSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Parameter agenda tidak valid.' });
    const timezone = (await repository.getPolicy()).timezone;
    if (parsed.data.date) return { date: parsed.data.date, events: await repository.auditForDay(timezone, parsed.data.date) };
    const rows = await repository.auditDailySummary(timezone, new Date(now().getTime() - parsed.data.days * 86_400_000).toISOString());
    const days: Record<string, Record<string, number>> = {};
    for (const row of rows) {
      const category = agendaCategory(row.type, row.status);
      if (!category) continue;
      const day = (days[row.day] ??= {});
      day[category] = (day[category] ?? 0) + row.total;
    }
    return { timezone, days };
  });
  app.get('/api/activity', async (request) => {
    const query = request.query as { limit?: string; type?: string };
    const limit = Math.max(1, Math.min(500, Number.parseInt(query.limit ?? '50', 10) || 50));
    return query.type ? await repository.listAuditForType(query.type.slice(0, 120), limit) : await repository.listAudit(limit);
  });

  app.get('/api/knowledge', async () => ({
    sources: await repository.listKnowledgeSources(),
    coverage: await repository.knowledgeCoverage(),
    freshness: (await repository.listKnowledgeSources()).map(({ id, updatedAt }) => ({ id, updatedAt })),
    searchMode: 'postgres-fts',
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
    const source = await repository.createKnowledgeSource({ id: sourceId, provider: parsed.value.provider, label: parsed.value.label, referenceUrl: parsed.value.referenceUrl, updatedAt }, chunks);
    await repository.appendAudit({ type: 'knowledge.imported', resourceId: sourceId, status: 'recorded', reason: `${chunks.length} potongan teks ditambahkan; ${rejected.length} file dikecualikan.`, policyVersion: (await repository.getPolicy()).version, payloadHash: null });
    return reply.code(201).send({ source, chunks: chunks.length, rejected });
  });
  const githubAdapter = () => {
    const token = options.getGitHubToken?.() ?? options.githubToken;
    return new GitHubReadAdapter({ ...(token ? { token } : {}), ...(options.fetcher ? { fetcher: options.fetcher } : {}) });
  };
  // Re-syncing a repository replaces its previous source instead of indexing it twice.
  const syncGitHubRepository = async (adapter: GitHubReadAdapter, name: string) => {
    const existing = (await repository.listKnowledgeSources()).find((item) => item.provider === 'github' && item.label.toLowerCase() === name.toLowerCase());
    const knownRef = existing ? await repository.knowledgeSourceRef(existing.id) : undefined;
    const result = await adapter.readRepository(name, knownRef);
    const sourceId = existing?.id ?? `github:${hashPayload(result.repository.toLowerCase()).slice(0, 32)}`;
    const updatedAt = now().toISOString();
    const repositoryUrl = `https://github.com/${result.repository}`;
    if (result.unchanged && existing) {
      await repository.markKnowledgeChecked(existing.id, updatedAt);
      await repository.appendAudit({ type: 'knowledge.github_sync', resourceId: existing.id, status: 'recorded', reason: `${result.repository}: snapshot ${result.ref} tetap sama; ${existing.chunkCount} potongan dipertahankan tanpa mengunduh ulang.`, policyVersion: (await repository.getPolicy()).version, payloadHash: null });
      return { result, chunks: existing.chunkCount, rejected: 0, source: { ...existing, updatedAt } };
    }
    const chunks = [];
    let rejected = 0;
    for (const file of result.files) {
      const prepared = prepareKnowledgeFile({ sourceId, provider: 'github', label: result.repository, referenceUrl: repositoryUrl, sourceRef: result.ref, updatedAt, path: file.path, content: file.content });
      if (prepared.ok) chunks.push(...prepared.chunks);
      else rejected += 1;
    }
    if (!chunks.length) return { result, chunks: 0, rejected, source: null };
    await repository.replaceKnowledgeSource({ id: sourceId, provider: 'github', label: result.repository, referenceUrl: repositoryUrl, updatedAt }, chunks);
    const source = (await repository.listKnowledgeSources()).find((item) => item.id === sourceId)!;
    await repository.appendAudit({ type: 'knowledge.github_sync', resourceId: sourceId, status: 'recorded', reason: `${result.repository}: ${result.fetched} file dibaca pada ${result.ref}; ${rejected + result.skipped} file dilewati.`, policyVersion: (await repository.getPolicy()).version, payloadHash: null });
    return { result, chunks: chunks.length, rejected, source };
  };

  type SyncJob = { id: string; provider: 'github' | 'linkedin'; state: 'running' | 'completed' | 'failed'; startedAt: string; finishedAt: string | null; current: string | null; total: number; completed: number; chunks: number; results: Array<{ label: string; chunks: number; error: string | null; note?: string }>; error: string | null };
  let knowledgeJob: SyncJob | null = null;
  let knowledgeTask: Promise<void> | null = null;
  app.addHook('onClose', async () => { await knowledgeTask; });
  app.get('/api/knowledge/sync-status', async () => ({ job: knowledgeJob }));
  app.post('/api/knowledge/sync', async (request, reply) => {
    const parsed = z.object({ provider: z.enum(['github', 'linkedin']), repository: z.string().regex(/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/).optional() }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Pilih GitHub atau LinkedIn dan format repositori yang valid.' });
    if (knowledgeJob?.state === 'running') return reply.code(409).send({ error: 'Sinkronisasi lain masih berjalan. Tunggu hingga selesai.' });
    if (parsed.data.provider === 'linkedin' && !options.syncLinkedIn) return reply.code(409).send({ error: 'Sinkronisasi LinkedIn belum tersedia.' });
    if (parsed.data.provider === 'github' && !parsed.data.repository && !(options.getGitHubToken?.() ?? options.githubToken)) return reply.code(400).send({ error: 'Token GitHub diperlukan untuk membaca daftar repo milik Anda.' });
    const job: SyncJob = { id: createId('sync'), provider: parsed.data.provider, state: 'running', startedAt: now().toISOString(), finishedAt: null, current: 'Membaca sumber API', total: 0, completed: 0, chunks: 0, results: [], error: null };
    knowledgeJob = job;
    knowledgeTask = (async () => {
      try {
        if (parsed.data.provider === 'linkedin') {
          job.total = 1; job.current = 'LinkedIn /userinfo';
          const result = await options.syncLinkedIn!();
          job.chunks = result.chunks; job.completed = 1;
          job.results.push({ label: 'LinkedIn API userinfo', chunks: result.chunks, error: null });
        } else {
          const adapter = githubAdapter();
          const names = parsed.data.repository ? [parsed.data.repository] : await adapter.listOwnRepositories();
          job.total = names.length;
          for (const name of names) {
            job.current = name;
            try {
              const result = await syncGitHubRepository(adapter, name);
              job.results.push({ label: name, chunks: result.chunks, error: null, ...(!result.chunks ? { note: 'Dilewati: tidak ada berkas teks yang lolos pemeriksaan.' } : result.result.limited > 0 || result.rejected > 0 ? { note: `Cakupan parsial: ${result.result.limited} berkas layak belum diambil, ${result.rejected} ditolak pemeriksaan konten.` } : {}) });
              job.chunks += result.chunks;
            } catch (error) {
              const message = error instanceof GitHubReadError ? error.message : 'Repositori tidak dapat diindeks; sumber sebelumnya dipertahankan.';
              job.results.push({ label: name, chunks: 0, error: error instanceof GitHubReadError && error.code === 'repository_empty' ? null : message, ...(error instanceof GitHubReadError && error.code === 'repository_empty' ? { note: 'Dilewati: repositori kosong.' } : {}) });
              if (error instanceof GitHubReadError && error.code === 'rate_limited') throw error;
            }
            job.completed += 1;
          }
        }
        job.state = job.results.some((item) => item.error) ? 'failed' : 'completed';
        job.error = job.state === 'failed' ? 'Sebagian sumber gagal. Periksa hasil per sumber; sumber yang berhasil sudah tersimpan.' : null;
      } catch (error) {
        job.state = 'failed'; job.error = error instanceof GitHubReadError ? error.message : 'API tidak dapat disinkronkan. Periksa koneksi dan izin akun di Status Integrasi.';
      } finally {
        job.finishedAt = now().toISOString(); job.current = null;
      }
    })();
    return reply.code(202).send({ job });
  });

  app.post('/api/knowledge/github/sync', async (request, reply) => {
    const parsed = parseBody(githubSyncSchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Repositori tidak valid.', issues: parsed.issues });
    try {
      const { result, chunks, rejected, source } = await syncGitHubRepository(githubAdapter(), parsed.value.repository);
      if (!source) return reply.code(422).send({ error: 'Tidak ada file yang lolos pemeriksaan sebelum indeks.', filesSeen: result.fetched, rejected });
      return reply.code(201).send({ source, branch: result.branch, ref: result.ref, filesSeen: result.fetched, chunks, rejected: rejected + result.skipped, eligible: result.eligible, limited: result.limited, complete: result.limited === 0 && rejected === 0 });
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
    return await repository.searchKnowledge(parsed.value.query, parsed.value.limit);
  });
  app.delete('/api/knowledge/sources/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'ID sumber tidak valid.' });
    if (!await repository.deleteKnowledgeSource(params.data.id)) return reply.code(404).send({ error: 'Sumber tidak ditemukan.' });
    await repository.appendAudit({ type: 'knowledge.deleted', resourceId: params.data.id, status: 'recorded', reason: 'Sumber dan potongan indeks terkait dihapus.', policyVersion: (await repository.getPolicy()).version, payloadHash: null });
    return { deleted: true, id: params.data.id };
  });

  app.get('/api/settings', async () => {
    await refreshProductionWriteChecks();
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
      profile: await repository.getProfile(),
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
      externalWrites: (await repository.getPolicy()).state === 'active' && !(await repository.getPolicy()).simulationOnly,
    };
  });

  app.setErrorHandler((error, _request, reply) => error instanceof z.ZodError
    ? reply.code(400).send({error:'Data tidak valid.',issues:error.issues.map(issue=>`${issue.path.join('.') || 'body'}: ${issue.message}`)})
    : reply.code(500).send({ error: 'Permintaan tidak dapat diproses.' }));
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
    if (!options.repository) await repository.close();
  });
  return app;
}
