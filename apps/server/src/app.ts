import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type {} from '@fastify/static';
import { z } from 'zod';
import { FreelancerReadError, getFreelancerCapabilities } from '@fvh/adapter-freelancer';
import { GitHubReadAdapter, GitHubReadError } from '@fvh/adapter-github';
import { assessProject, createId, decideBid, hashPayload, UnavailableDraftingAdapter } from '@fvh/application';
import type { AiDraftingPort } from '@fvh/application';
import { activatePolicySchema, knowledgeImportSchema, knowledgeSearchSchema, updatePolicySchema, updateProfileSchema } from '@fvh/contracts';
import { transitionPipeline } from '@fvh/domain';
import type { AutonomyPolicy, BidDraft, ProjectOpportunity } from '@fvh/domain';
import { prepareKnowledgeFile } from '@fvh/knowledge';
import { WorkspaceRepository } from '@fvh/persistence';
import type { CredentialStatus, FreelancerVerification } from './credential-store.js';
import type { LinkedInOAuthService } from './linkedin-oauth.js';

const paramsSchema = z.object({ id: z.string().min(1).max(150) });
const draftUpdateSchema = z.object({ proposal: z.string().trim().min(40).max(4_000), proposedPrice: z.number().finite().positive() });
const githubSyncSchema = z.object({ repository: z.string().trim().min(3).max(200) });
const freelancerSyncSchema = z.object({ query: z.string().trim().min(2).max(120), limit: z.number().int().min(1).max(50).default(25) });
const allowedDevOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:5174', 'http://localhost:5174']);

export type AppOptions = {
  repository?: WorkspaceRepository;
  githubToken?: string;
  credentialStatus?: CredentialStatus;
  getCredentialStatus?: () => CredentialStatus;
  verifyFreelancer?: () => Promise<FreelancerVerification>;
  readFreelancerProjects?: (query: string, limit: number) => Promise<{ projects: ProjectOpportunity[]; skipped: number }>;
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

function localDateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function mondayKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
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
  const app = Fastify({ logger: false, bodyLimit: 2_500_000, trustProxy: false });
  let freelancerVerification: FreelancerVerification | null = null;

  app.addHook('onRequest', async (request, reply) => {
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

  app.get('/api/health', async () => ({ ok: true, mode: 'local', database: 'sqlite', ai: draftingMode, liveWrites: false }));
  app.get('/api/capabilities', async () => {
    const credentialStatus = options.getCredentialStatus?.() ?? options.credentialStatus;
    const linkedin = linkedinVerification(credentialStatus, now());
    return {
    marketplace: getFreelancerCapabilities(freelancerVerification),
    freelancerCredentials: {
      accessTokenConfigured: credentialStatus?.freelancerAccessTokenConfigured ?? false,
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
      tokenConfigured: Boolean(options.githubToken ?? process.env.GITHUB_TOKEN),
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
      draft: 'optional', active: draftingMode === 'hermes',
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
    repository.appendAudit({ type: 'policy.resumed', resourceId: 'policy', status: 'recorded', reason: 'Kebijakan simulasi dilanjutkan oleh pemilik.', policyVersion: resumed.version, payloadHash: null });
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
    const sources = repository.listKnowledgeSources();
    const policy = repository.getPolicy();
    const profile = repository.getProfile();
    return {
      mode: 'workspace lokal',
      counts: {
        openProjects: projects.filter((project) => project.status === 'open').length,
        drafts: projects.filter((project) => repository.getLatestDraft(project.id)).length,
        policySkips: repository.listAudit(200).filter((event) => event.status === 'blocked').length,
        knowledgeSources: sources.length,
      },
      policy: { state: policy.state, version: policy.version, simulationOnly: true },
      profileComplete: Boolean(profile.primaryField && profile.specializations.length),
      projects: projects.slice(0, 4),
      activity,
      externalWrites: false,
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
  app.post('/api/knowledge/github/sync', async (request, reply) => {
    const parsed = parseBody(githubSyncSchema, request.body);
    if ('issues' in parsed) return reply.code(400).send({ error: 'Repositori tidak valid.', issues: parsed.issues });
    const token = options.githubToken ?? process.env.GITHUB_TOKEN;
    const adapter = new GitHubReadAdapter({ ...(token ? { token } : {}), ...(options.fetcher ? { fetcher: options.fetcher } : {}) });
    try {
      const result = await adapter.readRepository(parsed.value.repository);
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
      if (!chunks.length) return reply.code(422).send({ error: 'Tidak ada file yang lolos pemeriksaan sebelum indeks.', filesSeen: result.fetched, rejected });
      const source = repository.createKnowledgeSource({ id: sourceId, provider: 'github', label: result.repository, referenceUrl: repositoryUrl, updatedAt }, chunks);
      repository.appendAudit({ type: 'knowledge.github_sync', resourceId: sourceId, status: 'recorded', reason: `${result.fetched} file dibaca pada ${result.ref}; ${rejected + result.skipped} file dilewati.`, policyVersion: repository.getPolicy().version, payloadHash: null });
      return reply.code(201).send({ source, branch: result.branch, ref: result.ref, filesSeen: result.fetched, chunks: chunks.length, rejected: rejected + result.skipped, complete: result.skipped === 0 });
    } catch (error) {
      if (error instanceof GitHubReadError) return reply.code(error.code === 'permission_denied' ? 403 : error.code === 'repository_not_found' ? 404 : 502).send({ error: error.message, code: error.code });
      return reply.code(502).send({ error: 'Sinkronisasi GitHub gagal; tidak ada data yang ditambahkan.' });
    }
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
    const credentialStatus = options.getCredentialStatus?.() ?? options.credentialStatus;
    const linkedinStatus = linkedinVerification(credentialStatus, now());
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
          writes: 'unknown',
        },
        github: 'read-only',
        linkedin: { read: linkedinStatus.authorized ? 'oidc-lite' : 'manual-only', clientConfigured: credentialStatus?.linkedinClientConfigured ?? false, authorized: linkedinStatus.authorized, verificationStatus: linkedinStatus.verificationStatus },
        hermes: 'optional',
      },
      externalWrites: false,
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
    options.linkedinOAuth?.close();
    if (!options.repository) repository.close();
  });
  return app;
}
