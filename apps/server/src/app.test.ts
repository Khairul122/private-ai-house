import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixtureDraftingAdapter } from '@fvh/application';
import { FreelancerReadError, FreelancerSandboxWriteError, FreelancerWriteError } from '@fvh/adapter-freelancer';
import { WorkspaceRepository } from '@fvh/persistence';
import { createApp } from './app.js';
import { insertTestOpportunity, testOpportunity } from './test-fixtures.js';

const fixedNow = new Date('2026-10-14T04:00:00.000Z');
let repository: WorkspaceRepository;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  repository = new WorkspaceRepository();
  insertTestOpportunity(repository);
  app = createApp({ repository, clock: () => new Date(fixedNow), drafting: new FixtureDraftingAdapter(), draftingMode: 'fixture' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  repository.close();
});

async function configureAndActivatePolicy() {
  await app.inject({ method: 'PUT', url: '/api/profile', payload: {
    primaryField: 'Software Engineering', specializations: ['Backend Engineer'], language: 'id', currency: 'USD', timezone: 'Asia/Jakarta',
    minPrice: 100, maxPrice: 800, facts: [],
  } });
  await app.inject({ method: 'PUT', url: '/api/policy', payload: {
    allowedActions: ['bid.submit'], keywords: ['typescript'], minimumConfidence: 0.5,
    minPrice: 100, maxPrice: 800, dailyBidLimit: 4, weeklyBidLimit: 12, timezone: 'Asia/Jakarta',
    activeHours: { start: 8, end: 19 }, noNegotiationTerms: ['crypto gambling'],
  } });
  return app.inject({ method: 'POST', url: '/api/policy/activate', payload: { confirmSimulation: true } });
}

describe('local API', () => {
  it('rejects untrusted hosts while accepting localhost', async () => {
    const evil = await app.inject({ method: 'GET', url: '/api/health', headers: { host: 'evil.example:3001' } });
    const normal = await app.inject({ method: 'GET', url: '/api/health' });
    expect(evil.statusCode).toBe(403);
    expect(evil.json()).toEqual({ error: 'Host tidak diizinkan.' });
    expect(normal.statusCode).toBe(200);
  });

  it('serves health, capabilities, and only test-injected opportunities', async () => {
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    const capabilities = await app.inject({ method: 'GET', url: '/api/capabilities' });
    const settings = await app.inject({ method: 'GET', url: '/api/settings' });
    const projects = await app.inject({ method: 'GET', url: '/api/projects' });

    expect(health.json()).toMatchObject({ ok: true, mode: 'local', liveWrites: false });
    expect(capabilities.json().marketplace.find((item: { operation: string }) => item.operation === 'read_profile').status).toBe('unknown');
    expect(capabilities.json().marketplace.find((item: { operation: string }) => item.operation === 'read_projects').status).toBe('unknown');
    expect(capabilities.json().marketplace.find((item: { operation: string }) => item.operation === 'submit_bid').status).toBe('unknown');
    expect(capabilities.json().freelancerCredentials).toMatchObject({ accessTokenConfigured: false, verificationStatus: 'unverified', readProfile: false, readProjects: false });
    expect(capabilities.json().github).toMatchObject({ read: 'supported', verificationStatus: 'unknown', tokenConfigured: false });
    expect(settings.json().capabilities.freelancer).toMatchObject({ readProfile: 'unknown', readProjects: 'unknown', writes: 'unknown' });
    expect(capabilities.json().linkedin.clientConfigured).toBe(false);
    expect(projects.json()).toHaveLength(1);
    expect(projects.json()[0].source).toBe('fixture');
  });

  it('keeps a new workspace empty and disables drafting unless an adapter is explicitly provided', async () => {
    const emptyRepository = new WorkspaceRepository();
    const emptyApp = createApp({ repository: emptyRepository });
    await emptyApp.ready();
    const health = await emptyApp.inject({ method: 'GET', url: '/api/health' });
    const projects = await emptyApp.inject({ method: 'GET', url: '/api/projects' });
    const businessSync = await emptyApp.inject({ method: 'GET', url: '/api/business-sync' });
    const bidInsights = await emptyApp.inject({ method: 'GET', url: '/api/insights/bids' });
    await emptyApp.close();

    const disabledApp = createApp({ repository, draftingReason: 'Hermes belum diaktifkan.' });
    const draft = await disabledApp.inject({ method: 'POST', url: `/api/projects/${encodeURIComponent(testOpportunity.id)}/draft` });

    expect(health.json().ai).toBe('disabled');
    expect(projects.json()).toEqual([]);
    expect(businessSync.json()).toBeNull();
    expect(bidInsights.json()).toEqual({
      outcomes: { submitted: 0, won: 0, lost: 0, pending: 0, withConversation: 0, winRate: null },
      recent: [],
      skips: { total: 0, recent7d: 0, reasons: [] },
      lastCheck: { at: null, ok: null, error: null },
    });
    expect(draft.statusCode).toBe(503);
    expect(draft.json().error).toContain('Hermes belum diaktifkan');
    await disabledApp.close();
    emptyRepository.close();
  });

  it('reports Hermes drafting as active without enabling marketplace writes', async () => {
    const hermesApp = createApp({ drafting: new FixtureDraftingAdapter(), draftingMode: 'hermes' });
    const health = await hermesApp.inject({ method: 'GET', url: '/api/health' });
    const capabilities = await hermesApp.inject({ method: 'GET', url: '/api/capabilities' });

    expect(health.json().ai).toBe('hermes');
    expect(capabilities.json().hermes).toMatchObject({ draft: 'optional', active: true });
    expect(capabilities.json().marketplace.find((item: { operation: string }) => item.operation === 'submit_bid').status).toBe('unknown');
    await hermesApp.close();
  });

  it('reports credential presence without exposing credential values', async () => {
    const credentialApp = createApp({ credentialStatus: { freelancerAccessTokenConfigured: true, linkedinClientConfigured: true, linkedinAccessTokenConfigured: false, linkedinAccessTokenExpiresAt: null } });
    const response = await credentialApp.inject({ method: 'GET', url: '/api/capabilities' });

    expect(response.json().freelancerCredentials).toMatchObject({ accessTokenConfigured: true, verificationStatus: 'unverified' });
    expect(response.json().linkedin.clientConfigured).toBe(true);
    expect(JSON.stringify(response.json())).not.toContain('secret-value');
    await credentialApp.close();
  });

  it('keeps malformed LinkedIn expiry data unverified instead of calling it expired', async () => {
    const credentialApp = createApp({
      credentialStatus: { freelancerAccessTokenConfigured: false, linkedinClientConfigured: true, linkedinAccessTokenConfigured: true, linkedinAccessTokenExpiresAt: 'not-a-date' },
    });
    const capabilities = await credentialApp.inject({ method: 'GET', url: '/api/capabilities' });
    expect(capabilities.json().linkedin).toMatchObject({ authorized: false, verificationStatus: 'unverified', read: 'manual-only' });
    await credentialApp.close();
  });

  it('verifies Freelancer with read-only evidence and never returns marketplace writes as supported', async () => {
    const credentialApp = createApp({
      credentialStatus: { freelancerAccessTokenConfigured: true, linkedinClientConfigured: false, linkedinAccessTokenConfigured: false, linkedinAccessTokenExpiresAt: null },
      verifyFreelancer: async () => ({ connected: true, readProfile: true, readProjects: true, reason: 'verified' }),
    });
    const verification = await credentialApp.inject({ method: 'POST', url: '/api/freelancer/verify' });
    const capabilities = await credentialApp.inject({ method: 'GET', url: '/api/capabilities' });
    const rows = capabilities.json().marketplace as Array<{ operation: string; status: string }>;

    expect(verification.json()).toMatchObject({ connected: true, readProfile: true, readProjects: true });
    expect(capabilities.json().freelancerCredentials.verificationStatus).toBe('connected');
    expect(rows.find((item) => item.operation === 'read_profile')?.status).toBe('supported');
    expect(rows.find((item) => item.operation === 'read_projects')?.status).toBe('supported');
    expect(rows.filter((item) => ['submit_bid', 'edit_profile', 'send_message'].includes(item.operation)).every((item) => item.status !== 'supported')).toBe(true);
    await credentialApp.close();
  });

  it('records HTTP 200 sandbox checks for each write without marking production writes as supported', async () => {
    const verifySandboxWrite = vi.fn(async () => ({ statusCode: 200 }));
    const sandboxApp = createApp({ freelancerSandboxTokenConfigured: true, verifyFreelancerSandboxWrite: verifySandboxWrite });
    const cases = [
      { operation: 'submit_bid', projectId: 71, amount: 2, period: 1, milestonePercentage: 100, description: 'Sandbox bid test.' },
      { operation: 'edit_profile', jobIds: [17, 23] },
      { operation: 'send_message', threadId: 81, message: 'Sandbox message test.' },
    ] as const;

    for (const input of cases) {
      const response = await sandboxApp.inject({ method: 'POST', url: '/api/freelancer/sandbox-write-test', payload: input });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ operation: input.operation, statusCode: 200, environment: 'sandbox' });
    }
    const capabilities = await sandboxApp.inject({ method: 'GET', url: '/api/capabilities' });
    const writeRows = capabilities.json().marketplace.filter((item: { operation: string }) => ['submit_bid', 'edit_profile', 'send_message'].includes(item.operation));

    expect(verifySandboxWrite).toHaveBeenCalledTimes(3);
    expect(writeRows.every((item: { status: string }) => item.status === 'unknown')).toBe(true);
    expect(writeRows.every((item: { sandboxVerification?: { statusCode: number } }) => item.sandboxVerification?.statusCode === 200)).toBe(true);
    expect(capabilities.json().freelancerCredentials.sandboxWriteTestConfigured).toBe(true);
    await sandboxApp.close();
  });

  it('refreshes production write capability from automatic bid audit records', async () => {
    repository.appendAudit({
      type: 'marketplace.production.submit_bid', resourceId: 'freelancer:71', status: 'recorded',
      reason: 'Bid otomatis menghasilkan HTTP 200. ID hasil: 9001. Isi proposal tidak disimpan pada audit.',
      policyVersion: 2, payloadHash: 'a'.repeat(64),
    });

    const capabilities = await app.inject({ method: 'GET', url: '/api/capabilities' });
    const settings = await app.inject({ method: 'GET', url: '/api/settings' });
    const bid = capabilities.json().marketplace.find((item: { operation: string }) => item.operation === 'submit_bid');

    expect(bid).toMatchObject({ status: 'supported', productionVerification: { statusCode: 200, resultId: '9001' } });
    expect(settings.json().capabilities.freelancer).toMatchObject({ writes: 'partial', writeOperations: { submit_bid: 'supported', edit_profile: 'unknown', send_message: 'unknown' } });
  });

  it('requires the dedicated sandbox token and exposes provider failures without promoting the capability', async () => {
    const verifySandboxWrite = vi.fn(async () => { throw new FreelancerSandboxWriteError(403, 'denied'); });
    const noTokenApp = createApp({ verifyFreelancerSandboxWrite: verifySandboxWrite });
    const deniedConfig = await noTokenApp.inject({ method: 'POST', url: '/api/freelancer/sandbox-write-test', payload: { operation: 'send_message', threadId: 81, message: 'Check.' } });
    expect(deniedConfig.statusCode).toBe(409);
    expect(verifySandboxWrite).not.toHaveBeenCalled();
    await noTokenApp.close();

    const sandboxApp = createApp({ freelancerSandboxTokenConfigured: true, verifyFreelancerSandboxWrite: verifySandboxWrite });
    const failedCheck = await sandboxApp.inject({ method: 'POST', url: '/api/freelancer/sandbox-write-test', payload: { operation: 'send_message', threadId: 81, message: 'Check.' } });
    const capabilities = await sandboxApp.inject({ method: 'GET', url: '/api/capabilities' });
    const messageCapability = capabilities.json().marketplace.find((item: { operation: string }) => item.operation === 'send_message');

    expect(failedCheck.statusCode).toBe(502);
    expect(failedCheck.json()).toMatchObject({ providerStatusCode: 403 });
    expect(messageCapability).toMatchObject({ status: 'unknown', sandboxVerification: { statusCode: 403 } });
    await sandboxApp.close();
  });

  it('records production HTTP 200 only after an explicitly confirmed live operation', async () => {
    const runWrite = vi.fn(async (input: { operation: string }) => ({ statusCode: 200, resultId: input.operation === 'edit_profile' ? undefined : '9001', resultStatus: input.operation === 'edit_profile' ? 'success' : undefined }));
    const productionApp = createApp({
      credentialStatus: { freelancerAccessTokenConfigured: true, linkedinClientConfigured: false, linkedinAccessTokenConfigured: false, linkedinAccessTokenExpiresAt: null },
      runFreelancerProductionWrite: runWrite,
    });
    const cases = [
      { operation: 'submit_bid', projectId: 71, amount: 200, period: 5, milestonePercentage: 100, description: 'Reviewed live proposal.', confirmLive: true },
      { operation: 'edit_profile', jobIds: [17, 23], confirmLive: true },
      { operation: 'send_message', threadId: 81, message: 'Reviewed live message.', confirmLive: true },
    ] as const;

    for (const input of cases) {
      const response = await productionApp.inject({ method: 'POST', url: '/api/freelancer/production-write', payload: input });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ operation: input.operation, statusCode: 200, environment: 'production' });
    }
    const capabilities = await productionApp.inject({ method: 'GET', url: '/api/capabilities' });
    const writeRows = capabilities.json().marketplace.filter((item: { operation: string }) => ['submit_bid', 'edit_profile', 'send_message'].includes(item.operation));

    expect(runWrite).toHaveBeenCalledTimes(3);
    expect(writeRows.every((item: { status: string; productionVerification?: { statusCode: number } }) => item.status === 'supported' && item.productionVerification?.statusCode === 200)).toBe(true);
    expect(capabilities.json().freelancerCredentials.productionWriteConfigured).toBe(true);
    await productionApp.close();
  });

  it('requires a production token and explicit live confirmation, and preserves provider failures', async () => {
    const runWrite = vi.fn(async () => { throw new FreelancerWriteError(403, 'denied'); });
    const input = { operation: 'send_message', threadId: 81, message: 'Live message.' };
    const noTokenApp = createApp({ runFreelancerProductionWrite: runWrite });
    const deniedConfig = await noTokenApp.inject({ method: 'POST', url: '/api/freelancer/production-write', payload: { ...input, confirmLive: true } });
    expect(deniedConfig.statusCode).toBe(409);
    expect(runWrite).not.toHaveBeenCalled();
    await noTokenApp.close();

    const productionApp = createApp({
      credentialStatus: { freelancerAccessTokenConfigured: true, linkedinClientConfigured: false, linkedinAccessTokenConfigured: false, linkedinAccessTokenExpiresAt: null },
      runFreelancerProductionWrite: runWrite,
    });
    const unconfirmed = await productionApp.inject({ method: 'POST', url: '/api/freelancer/production-write', payload: input });
    expect(unconfirmed.statusCode).toBe(400);
    expect(runWrite).not.toHaveBeenCalled();
    const failed = await productionApp.inject({ method: 'POST', url: '/api/freelancer/production-write', payload: { ...input, confirmLive: true } });
    const capabilities = await productionApp.inject({ method: 'GET', url: '/api/capabilities' });
    const messageCapability = capabilities.json().marketplace.find((item: { operation: string }) => item.operation === 'send_message');

    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toMatchObject({ providerStatusCode: 403 });
    expect(messageCapability).toMatchObject({ status: 'unknown', productionVerification: { statusCode: 403 } });
    await productionApp.close();
  });

  it('restores the latest production write status from the local audit after a server restart', async () => {
    const durableRepository = new WorkspaceRepository();
    const credentialStatus = { freelancerAccessTokenConfigured: true, linkedinClientConfigured: false, linkedinAccessTokenConfigured: false, linkedinAccessTokenExpiresAt: null };
    const firstApp = createApp({
      repository: durableRepository,
      credentialStatus,
      runFreelancerProductionWrite: async () => ({ statusCode: 200, resultId: '9001' }),
    });
    await firstApp.ready();
    const submitted = await firstApp.inject({ method: 'POST', url: '/api/freelancer/production-write', payload: { operation: 'submit_bid', projectId: 71, amount: 200, period: 5, milestonePercentage: 100, description: 'Reviewed live proposal.', confirmLive: true } });
    expect(submitted.statusCode).toBe(200);
    await firstApp.close();

    const restartedApp = createApp({ repository: durableRepository, credentialStatus });
    const capabilities = await restartedApp.inject({ method: 'GET', url: '/api/capabilities' });
    const bidCapability = capabilities.json().marketplace.find((item: { operation: string }) => item.operation === 'submit_bid');
    expect(bidCapability).toMatchObject({ status: 'supported', productionVerification: { statusCode: 200, resultId: '9001' } });
    await restartedApp.close();
    durableRepository.close();
  });

  it('syncs only provider results and updates read capability after a successful API response', async () => {
    const project = { ...testOpportunity, id: 'freelancer:839101', source: 'freelancer' as const };
    const credentialApp = createApp({
      repository,
      credentialStatus: { freelancerAccessTokenConfigured: true, linkedinClientConfigured: false, linkedinAccessTokenConfigured: false, linkedinAccessTokenExpiresAt: null },
      readFreelancerProjects: vi.fn(async (query, limit) => {
        expect(query).toBe('TypeScript');
        expect(limit).toBe(25);
        return { projects: [project], skipped: 1 };
      }),
    });
    const synced = await credentialApp.inject({ method: 'POST', url: '/api/freelancer/projects/sync', payload: { query: 'TypeScript' } });
    const capabilities = await credentialApp.inject({ method: 'GET', url: '/api/capabilities' });
    const rows = capabilities.json().marketplace as Array<{ operation: string; status: string }>;

    expect(synced.statusCode).toBe(200);
    expect(synced.json()).toMatchObject({ imported: 1, skipped: 1 });
    expect(repository.getProject(project.id)?.source).toBe('freelancer');
    expect(rows.find((item) => item.operation === 'read_projects')?.status).toBe('supported');
    expect(rows.find((item) => item.operation === 'read_profile')?.status).toBe('unknown');
    expect(rows.filter((item) => ['submit_bid', 'edit_profile', 'send_message'].includes(item.operation)).every((item) => item.status === 'unknown')).toBe(true);
    await credentialApp.close();
  });

  it('returns provider authorization and rate-limit status codes without mislabeling them', async () => {
    const credentialApp = createApp({
      credentialStatus: { freelancerAccessTokenConfigured: true, linkedinClientConfigured: false, linkedinAccessTokenConfigured: false, linkedinAccessTokenExpiresAt: null },
      readFreelancerProjects: async () => { throw new FreelancerReadError('rate_limited', 'Freelancer membatasi permintaan.', 429); },
    });
    const response = await credentialApp.inject({ method: 'POST', url: '/api/freelancer/projects/sync', payload: { query: 'Typescript' } });
    expect(response.statusCode).toBe(429);
    expect(response.json().error).toContain('membatasi');
    await credentialApp.close();
  });

  it('starts LinkedIn consent only for a local application origin', async () => {
    const start = vi.fn(async (returnUrl: string) => ({ authorizationUrl: `https://www.linkedin.com/oauth/v2/authorization?redirect=${encodeURIComponent(returnUrl)}` }));
    const handleCallback = vi.fn(async () => ({ statusCode: 200, title: 'LinkedIn terhubung', message: 'Profil ringan terverifikasi.', returnUrl: 'http://localhost:5173/capabilities' }));
    const credentialApp = createApp({ linkedinOAuth: { redirectUri: 'http://127.0.0.1:3001/api/linkedin/callback', start, handleCallback, close: () => {} } });
    const response = await credentialApp.inject({ method: 'POST', url: '/api/linkedin/connect', headers: { origin: 'http://localhost:5173' } });
    const alternatePort = await credentialApp.inject({ method: 'POST', url: '/api/linkedin/connect', headers: { origin: 'http://127.0.0.1:5174' } });
    const denied = await credentialApp.inject({ method: 'POST', url: '/api/linkedin/connect', headers: { origin: 'https://attacker.example' } });
    const callback = await credentialApp.inject({ method: 'GET', url: '/api/linkedin/callback?state=opaque&code=temporary' });

    expect(response.statusCode).toBe(200);
    expect(start).toHaveBeenCalledWith('http://localhost:5173/capabilities');
    expect(alternatePort.statusCode).toBe(200);
    expect(start).toHaveBeenCalledWith('http://127.0.0.1:5174/capabilities');
    expect(denied.statusCode).toBe(403);
    expect(callback.statusCode).toBe(303);
    expect(callback.headers.location).toBe('http://localhost:5173/capabilities?linkedin=connected');
    expect(handleCallback).toHaveBeenCalledWith({ state: 'opaque', code: 'temporary' });
    await credentialApp.close();
  });

  it('rejects untrusted browser origins and malformed policy updates', async () => {
    const crossOrigin = await app.inject({ method: 'POST', url: '/api/policy/pause', headers: { origin: 'https://attacker.example' } });
    const sameOrigin = await app.inject({ method: 'GET', url: '/api/profile', headers: { origin: 'http://localhost' } });
    const invalidPolicy = await app.inject({ method: 'PUT', url: '/api/policy', payload: { maxPrice: -1 } });

    expect(crossOrigin.statusCode).toBe(403);
    expect(sameOrigin.statusCode).toBe(200);
    expect(invalidPolicy.statusCode).toBe(400);
  });

  it('requires an explicit one-time confirmation before activation', async () => {
    await app.inject({ method: 'PUT', url: '/api/profile', payload: {
      primaryField: 'Software Engineering', specializations: ['Backend Engineer'], language: 'id', currency: 'USD', timezone: 'Asia/Jakarta',
      minPrice: 100, maxPrice: 800, facts: [],
    } });
    await app.inject({ method: 'PUT', url: '/api/policy', payload: {
      allowedActions: ['bid.submit'], keywords: [], minimumConfidence: 0.5, minPrice: 100, maxPrice: 800,
      dailyBidLimit: 4, weeklyBidLimit: 12, timezone: 'Asia/Jakarta', activeHours: { start: 8, end: 19 }, noNegotiationTerms: [],
    } });
    const result = await app.inject({ method: 'POST', url: '/api/policy/activate', payload: { confirmSimulation: false } });

    expect(result.statusCode).toBe(400);
    expect(repository.getPolicy().state).toBe('draft');
  });

  it('creates and edits a proposal from project facts without claiming undocumented experience', async () => {
    const created = await app.inject({ method: 'POST', url: `/api/projects/${encodeURIComponent(testOpportunity.id)}/draft` });
    const draft = created.json();
    const edited = await app.inject({ method: 'PUT', url: `/api/drafts/${draft.id}`, payload: {
      proposal: `${draft.proposal}\n\nSaya siap membahas definisi selesai sebelum pekerjaan dimulai.`, proposedPrice: 400,
    } });

    expect(created.statusCode).toBe(201);
    expect(draft.proposal).toContain('belum menambahkan klaim pengalaman');
    expect(draft.evidence).toEqual([]);
    expect(edited.statusCode).toBe(200);
    expect(edited.json().proposedPrice).toBe(400);
  });

  it('records a policy-bounded simulation without changing marketplace or submitted state', async () => {
    const activated = await configureAndActivatePolicy();
    expect(activated.statusCode).toBe(200);
    await app.inject({ method: 'POST', url: `/api/projects/${encodeURIComponent(testOpportunity.id)}/draft` });
    const simulated = await app.inject({ method: 'POST', url: `/api/projects/${encodeURIComponent(testOpportunity.id)}/simulate-submit` });
    const response = simulated.json();

    expect(simulated.statusCode).toBe(200);
    expect(response).toMatchObject({ externalWrites: false, marketplaceStatus: 'unchanged', pipelineStatus: 'draft_ready', decision: { allowed: true, simulationOnly: true } });
    expect(response.event.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.listProjects().find((item) => item.id === testOpportunity.id)?.pipelineStatus).toBe('draft_ready');
  });

  it('pauses the kill switch immediately and records the blocked reason', async () => {
    await configureAndActivatePolicy();
    await app.inject({ method: 'POST', url: `/api/projects/${encodeURIComponent(testOpportunity.id)}/draft` });
    await app.inject({ method: 'POST', url: '/api/policy/pause' });
    const result = await app.inject({ method: 'POST', url: `/api/projects/${encodeURIComponent(testOpportunity.id)}/simulate-submit` });

    expect(result.json().decision).toMatchObject({ allowed: false, reasonCode: 'policy_paused' });
    expect(repository.listAudit(10).some((event) => event.type === 'bid.simulation_skipped')).toBe(true);
  });

  it('imports searchable local evidence, rejects credentials, and deletes the index', async () => {
    const imported = await app.inject({ method: 'POST', url: '/api/knowledge/import', payload: {
      provider: 'linkedin', label: 'Ekspor profil milik pengguna', referenceUrl: '', sourceRef: 'user export',
      files: [{ path: 'Profile.csv', content: 'Current role,Backend Engineer\nProject,Inventory API built with TypeScript and cursor pagination' }],
    } });
    const source = imported.json().source;
    const search = await app.inject({ method: 'POST', url: '/api/knowledge/search', payload: { query: 'cursor pagination', limit: 5 } });
    const rejected = await app.inject({ method: 'POST', url: '/api/knowledge/import', payload: {
      provider: 'manual', label: 'Credential example', referenceUrl: '', sourceRef: '',
      files: [{ path: 'notes.md', content: 'ghp_123456789012345678901234567890123456' }],
    } });
    const deleted = await app.inject({ method: 'DELETE', url: `/api/knowledge/sources/${source.id}` });

    expect(imported.statusCode).toBe(201);
    expect(search.json()[0]).toMatchObject({ label: 'Ekspor profil milik pengguna', path: 'Profile.csv' });
    expect(rejected.statusCode).toBe(422);
    expect(rejected.body).not.toContain('ghp_123456789012345678901234567890123456');
    expect(deleted.statusCode).toBe(200);
    expect(repository.knowledgeCoverage()).toEqual({ sources: 0, chunks: 0 });
  });

  it('keeps GitHub unknown until a repository sync succeeds, then records read-only evidence', async () => {
    const githubRepository = new WorkspaceRepository();
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/repos/owner/repo')) return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 });
      if (url.includes('/git/trees/main?recursive=1')) return new Response(JSON.stringify({ sha: 'tree-sha', tree: [{ path: 'README.md', type: 'blob', size: 45 }] }), { status: 200 });
      return new Response('A local workspace for documented project notes.', { status: 200 });
    });
    const githubApp = createApp({ repository: githubRepository, fetcher });
    await githubApp.ready();

    expect((await githubApp.inject({ method: 'GET', url: '/api/capabilities' })).json().github.verificationStatus).toBe('unknown');
    const synced = await githubApp.inject({ method: 'POST', url: '/api/knowledge/github/sync', payload: { repository: 'owner/repo' } });
    const capabilities = await githubApp.inject({ method: 'GET', url: '/api/capabilities' });

    expect(synced.statusCode).toBe(201);
    expect(synced.json()).toMatchObject({ filesSeen: 1, complete: true });
    expect(capabilities.json().github.verificationStatus).toBe('supported');
    expect(githubRepository.listKnowledgeSources()).toMatchObject([{ provider: 'github', label: 'owner/repo' }]);

    await githubApp.close();
    githubRepository.close();
  });
});

describe('business operations API', () => {
  it('reports an empty inbox without inventing threads when message sync is unavailable', async () => {
    const inbox = await app.inject({ method: 'GET', url: '/api/inbox' });
    expect(inbox.json()).toEqual({ sync: null, needsReply: [], followUps: [] });
    const insights = (await app.inject({ method: 'GET', url: '/api/insights/bids' })).json();
    expect(insights.outcomes).toEqual({ submitted: 0, won: 0, lost: 0, pending: 0, withConversation: 0, winRate: null });
  });

  it('lists bids without any client conversation after three days as follow-ups', async () => {
    repository.recordSubmittedBid({ projectId: testOpportunity.id, bidId: '9001', amount: 200, currency: 'USD', submittedAt: '2026-10-10T00:00:00.000Z' });
    const inbox = (await app.inject({ method: 'GET', url: '/api/inbox' })).json();
    expect(inbox.followUps).toEqual([expect.objectContaining({ projectId: testOpportunity.id, daysSinceBid: 4 })]);
  });

  it('tracks client projects, deadlines, and monthly income per currency', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/work/projects', payload: {
      title: 'Company profile', client: 'Toko Maju', source: 'direct', deadline: '2026-10-15', value: 5_000_000, currency: 'idr',
    } });
    expect(created.statusCode).toBe(201);
    const project = created.json();
    expect((await app.inject({ method: 'POST', url: '/api/work/projects', payload: { title: '', client: 'X', source: 'direct', deadline: '15-10-2026', value: null, currency: 'IDR' } })).statusCode).toBe(400);

    const payment = (await app.inject({ method: 'POST', url: '/api/work/payments', payload: { projectId: project.id, amount: 2_500_000, currency: 'IDR', status: 'expected', dueDate: null } })).json();
    await app.inject({ method: 'POST', url: '/api/work/payments', payload: { projectId: project.id, amount: 100, currency: 'USD', status: 'received', dueDate: null } });
    expect((await app.inject({ method: 'POST', url: `/api/work/payments/${payment.id}/received` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/work/payments/missing/received' })).statusCode).toBe(404);

    const work = (await app.inject({ method: 'GET', url: '/api/work' })).json();
    expect(work.projects[0]).toMatchObject({ title: 'Company profile', currency: 'IDR', daysToDeadline: 1 });
    expect(work.dueSoon).toBe(1);
    expect(work.income.month).toBe('2026-10');
    expect(work.income.received).toEqual(expect.arrayContaining([
      { currency: 'IDR', total: 2_500_000, bySource: { direct: 2_500_000 } },
      { currency: 'USD', total: 100, bySource: { direct: 100 } },
    ]));
    expect(work.income.expected).toEqual([]);

    const updated = await app.inject({ method: 'PUT', url: `/api/work/projects/${project.id}`, payload: { status: 'delivered' } });
    expect(updated.json()).toMatchObject({ status: 'delivered' });
    expect((await app.inject({ method: 'GET', url: '/api/work' })).json().dueSoon).toBe(0);
  });
});
