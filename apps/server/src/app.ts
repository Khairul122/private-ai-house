import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type {} from '@fastify/static';
import { z } from 'zod';
import { getFreelancerCapabilities } from '@fvh/adapter-freelancer';
import { GitHubReadAdapter, GitHubReadError } from '@fvh/adapter-github';
import { assessProject, createId, decideBid, FixtureDraftingAdapter, hashPayload } from '@fvh/application';
import type { AiDraftingPort } from '@fvh/application';
import { activatePolicySchema, knowledgeImportSchema, knowledgeSearchSchema, updatePolicySchema, updateProfileSchema } from '@fvh/contracts';
import { transitionPipeline } from '@fvh/domain';
import type { AutonomyPolicy, BidDraft } from '@fvh/domain';
import { prepareKnowledgeFile } from '@fvh/knowledge';
import { WorkspaceRepository } from '@fvh/persistence';
import type { CredentialStatus } from './credential-store.js';

const paramsSchema = z.object({ id: z.string().min(1).max(150) });
const draftUpdateSchema = z.object({ proposal: z.string().trim().min(40).max(4_000), proposedPrice: z.number().finite().positive() });
const githubSyncSchema = z.object({ repository: z.string().trim().min(3).max(200) });
const allowedDevOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173']);

export type AppOptions = {
  repository?: WorkspaceRepository;
  githubToken?: string;
  credentialStatus?: CredentialStatus;
  fetcher?: typeof fetch;
  clock?: () => Date;
  drafting?: AiDraftingPort;
  draftingMode?: 'fixture' | 'opencode';
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

export function createApp(options: AppOptions = {}): FastifyInstance {
  const repository = options.repository ?? new WorkspaceRepository();
  const now = options.clock ?? (() => new Date());
  const drafting = options.drafting ?? new FixtureDraftingAdapter();
  const draftingMode = options.draftingMode ?? 'fixture';
  const app = Fastify({ logger: false, bodyLimit: 2_500_000, trustProxy: false });

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
    reply.header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' ws://127.0.0.1:5173 ws://localhost:5173; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    return payload;
  });

  app.get('/api/health', async () => ({ ok: true, mode: 'local', database: 'sqlite', ai: 'fixture', liveWrites: false }));
  app.get('/api/capabilities', async () => ({
    marketplace: getFreelancerCapabilities(),
    freelancerCredentials: { accessTokenConfigured: options.credentialStatus?.freelancerAccessTokenConfigured ?? false },
    github: { read: 'supported', scope: 'selected repository Contents: read', tokenConfigured: Boolean(options.githubToken ?? process.env.GITHUB_TOKEN) },
    linkedin: {
      read: 'manual-only',
      clientConfigured: options.credentialStatus?.linkedinClientConfigured ?? false,
      reason: 'Profile API access requires developer approval; this workspace supports user-provided text imports.',
    },
    opencode: {
      draft: 'optional', active: draftingMode === 'opencode',
      reason: draftingMode === 'opencode'
        ? 'Selected project details, supplied profile facts, and up to four relevant local evidence chunks are sent to the configured OpenCode provider; marketplace credentials are excluded.'
        : 'Fixture drafting is the default until a provider is configured and data-processing consent is set.',
    },
  }));

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
    repository.appendAudit({ type: 'bid.draft_created', resourceId: project.id, status: 'recorded', reason: 'Draf contoh dibuat dari brief; klaim profil belum ditambahkan tanpa fakta bersumber.', policyVersion: repository.getPolicy().version, payloadHash: hashPayload({ proposal: draft.proposal, proposedPrice: draft.proposedPrice, currency: draft.currency }) });
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
      mode: 'contoh lokal',
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

  app.get('/api/settings', async () => ({
    workspace: { id: 'workspace_local', name: 'Freelancer Virtual House', accountMode: 'single-user lokal' },
    fields: ['Fullstack Engineer', 'Backend Engineer', 'Android Engineer', 'iOS Engineer', 'Frontend Engineer', 'DevOps Engineer', 'QA Engineer', 'UI/UX Designer', 'Data Engineer', 'Technical Writer'],
    profile: repository.getProfile(),
    capabilities: { freelancer: 'unknown', github: 'read-only', linkedin: 'manual-only', opencode: 'optional' },
    externalWrites: false,
  }));

  app.setErrorHandler((_error, _request, reply) => reply.code(500).send({ error: 'Permintaan tidak dapat diproses.' }));
  app.setNotFoundHandler((request, reply) => {
    const pathname = request.url.split('?')[0] ?? request.url;
    if (options.spaFallback && ['GET', 'HEAD'].includes(request.method) && pathname !== '/api' && !pathname.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Endpoint tidak ditemukan.' });
  });
  app.addHook('onClose', async () => {
    if (!options.repository) repository.close();
  });
  return app;
}
