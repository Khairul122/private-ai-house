import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FixtureDraftingAdapter } from '@fvh/application';
import { FreelancerReadError, FreelancerSandboxWriteError } from '@fvh/adapter-freelancer';
import { WorkspaceRepository } from '@fvh/persistence';
import { createApp } from './app.js';
import { insertTestOpportunity, testOpportunity } from './test-fixtures.js';

const fixedNow = new Date('2026-10-14T04:00:00.000Z');
let repository: WorkspaceRepository;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  repository = await WorkspaceRepository.open();
  insertTestOpportunity(repository);
  app = await createApp({ repository, clock: () => new Date(fixedNow), drafting: new FixtureDraftingAdapter(), draftingMode: 'fixture' });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  await repository.close();
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
  return app.inject({ method: 'POST', url: '/api/policy/activate', payload: { mode: 'live', confirmLive: true } });
}

describe('local API', () => {
  it('saves flexible policy options, preserves pause, and rejects stale edits or invalid schedules', async () => {
    const saved = await repository.getPolicy();
    await repository.savePolicy({ ...saved, state: 'paused', simulationOnly: false });
    const input = { ...saved, allowedActions: ['bid.submit'], keywords: ['React', ' react ', 'C#'], minimumConfidence: 0.2, activeHours: { start: 22, end: 6 }, activeDays: [1, 2], scanIntervalMinutes: 5, maxRiskScore: 0.8, requireSpecializationMatch: false, allowUnknownDeadline: true, validityDays: 90, expectedVersion: saved.version };
    const updated = await app.inject({ method: 'PUT', url: '/api/policy', payload: input });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ state: 'paused', simulationOnly: false, keywords: ['react', 'C#'], scanIntervalMinutes: 5, activeDays: [1, 2], expiresAt: '2027-01-12T04:00:00.000Z' });
    expect(updated.json()).not.toHaveProperty('expectedVersion');
    expect((await app.inject({ method: 'PUT', url: '/api/policy', payload: input })).statusCode).toBe(409);
    expect((await app.inject({ method: 'PUT', url: '/api/policy', payload: { ...input, timezone: 'Bad/Zone' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/policy', payload: { ...input, activeDays: [] } })).statusCode).toBe(400);
    const presets = (await app.inject({ method: 'GET', url: '/api/policy/presets' })).json();
    expect(presets.keywords).toContain('React');
    expect(presets.keywords.length).toBeGreaterThan(150);
  });

  it('counts real bid usage by the policy day and week without counting failures', async () => {
    for (const [status, at] of [['recorded', '2026-10-14T01:00:00Z'], ['recorded', '2026-10-12T01:00:00Z'], ['recorded', '2026-10-11T01:00:00Z'], ['failed', '2026-10-14T02:00:00Z']] as const) await repository.appendAudit({ type: 'marketplace.production.submit_bid', resourceId: at + status, status, createdAt: at, reason: 'test', policyVersion: 1, payloadHash: null });
    expect(await repository.bidUsage(fixedNow, 'Asia/Jakarta')).toEqual({ today: 1, week: 2 });
    const activity = (await app.inject({ method: 'GET', url: '/api/activity?type=marketplace.production.submit_bid&limit=3' })).json() as Array<{ type: string }>;
    expect(activity).toHaveLength(3);
    expect(activity.every((event) => event.type === 'marketplace.production.submit_bid')).toBe(true);
  });

  it('exposes the saved proposal and reports async LinkedIn sync completion', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/projects/${testOpportunity.id}/draft` })).json()).toEqual({ draft: null });
    await app.close();
    app = await createApp({ repository, syncLinkedIn: async () => ({ sourceId: 'linkedin:test', chunks: 3 }) });
    const started = await app.inject({ method: 'POST', url: '/api/knowledge/sync', payload: { provider: 'linkedin' } });
    expect(started.statusCode).toBe(202);
    await vi.waitFor(async () => { expect((await app.inject({ method: 'GET', url: '/api/knowledge/sync-status' })).json().job).toMatchObject({ state: 'completed', completed: 1, chunks: 3 }); });
    expect(started.json().job.provider).toBe('linkedin');
  });
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
    const emptyRepository = await WorkspaceRepository.open();
    const emptyApp = await createApp({ repository: emptyRepository });
    await emptyApp.ready();
    const health = await emptyApp.inject({ method: 'GET', url: '/api/health' });
    const projects = await emptyApp.inject({ method: 'GET', url: '/api/projects' });
    const businessSync = await emptyApp.inject({ method: 'GET', url: '/api/business-sync' });
    const bidInsights = await emptyApp.inject({ method: 'GET', url: '/api/insights/bids' });
    await emptyApp.close();

    const disabledApp = await createApp({ repository, draftingReason: 'Hermes belum diaktifkan.' });
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
    await emptyRepository.close();
  });

  it('reports Hermes drafting as active without enabling marketplace writes', async () => {
    const hermesApp = await createApp({ drafting: new FixtureDraftingAdapter(), draftingMode: 'hermes' });
    const health = await hermesApp.inject({ method: 'GET', url: '/api/health' });
    const capabilities = await hermesApp.inject({ method: 'GET', url: '/api/capabilities' });

    expect(health.json().ai).toBe('hermes');
    expect(capabilities.json().hermes).toMatchObject({ draft: 'optional', active: true });
    expect(capabilities.json().marketplace.find((item: { operation: string }) => item.operation === 'submit_bid').status).toBe('unknown');
    await hermesApp.close();
  });

  it('reports credential presence without exposing credential values', async () => {
    const credentialApp = await createApp({ credentialStatus: { freelancerAccessTokenConfigured: true, linkedinClientConfigured: true, linkedinAccessTokenConfigured: false, linkedinAccessTokenExpiresAt: null } });
    const response = await credentialApp.inject({ method: 'GET', url: '/api/capabilities' });

    expect(response.json().freelancerCredentials).toMatchObject({ accessTokenConfigured: true, verificationStatus: 'unverified' });
    expect(response.json().linkedin.clientConfigured).toBe(true);
    expect(JSON.stringify(response.json())).not.toContain('secret-value');
    await credentialApp.close();
  });

  it('keeps malformed LinkedIn expiry data unverified instead of calling it expired', async () => {
    const credentialApp = await createApp({
      credentialStatus: { freelancerAccessTokenConfigured: false, linkedinClientConfigured: true, linkedinAccessTokenConfigured: true, linkedinAccessTokenExpiresAt: 'not-a-date' },
    });
    const capabilities = await credentialApp.inject({ method: 'GET', url: '/api/capabilities' });
    expect(capabilities.json().linkedin).toMatchObject({ authorized: false, verificationStatus: 'unverified', read: 'manual-only' });
    await credentialApp.close();
  });

  it('verifies Freelancer with read-only evidence and never returns marketplace writes as supported', async () => {
    const credentialApp = await createApp({
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
    const sandboxApp = await createApp({ freelancerSandboxTokenConfigured: true, verifyFreelancerSandboxWrite: verifySandboxWrite });
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
    await repository.appendAudit({
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

  it('keeps an older production HTTP 200 behind newer quota failures and a busy audit log', async () => {
    await repository.appendAudit({ type: 'marketplace.production.submit_bid', resourceId: 'freelancer:71', status: 'recorded', createdAt: '2026-10-13T01:00:00.000Z', reason: 'Bid otomatis melalui API menghasilkan HTTP 200. ID hasil: 9001. Isi proposal tidak disimpan pada audit.', policyVersion: 2, payloadHash: null });
    await repository.appendAudit({ type: 'marketplace.production.edit_profile', resourceId: 'freelancer-profile-sync', status: 'recorded', createdAt: '2026-10-12T01:00:00.000Z', reason: 'Sinkronisasi idempotent daftar job profil menghasilkan HTTP 200; daftar yang sama dengan profil saat dibaca dikirim ulang.', policyVersion: 2, payloadHash: null });
    await repository.sql.query(`INSERT INTO audit_events (id, type, resource_id, status, reason, created_at)
      SELECT 'skip-' || n, 'autopilot.bid_skipped', 'p' || n, 'blocked', 'daily_limit_reached', '2026-10-13T02:00:00.' || lpad(n::text, 3, '0') || 'Z' FROM generate_series(1, 1100) AS n`);
    await repository.appendAudit({ type: 'marketplace.production.submit_bid', resourceId: 'freelancer:72', status: 'allowed', createdAt: '2026-10-14T03:00:00.000Z', reason: 'Bid live sedang dikirim oleh autopilot.', policyVersion: 2, payloadHash: null });
    await repository.appendAudit({ type: 'marketplace.production.submit_bid', resourceId: 'freelancer:72', status: 'failed', createdAt: '2026-10-14T03:00:01.000Z', reason: 'Bid otomatis menghasilkan HTTP 400. production Freelancer mengembalikan HTTP 400: ProjectExceptionCodes.BID_LIMIT_EXCEEDED: You have used all of your bids.', policyVersion: 2, payloadHash: null });

    const marketplace = (await app.inject({ method: 'GET', url: '/api/capabilities' })).json().marketplace as Array<{ operation: string; status: string; evidence: string }>;
    const bid = marketplace.find((item) => item.operation === 'submit_bid');

    expect(bid).toMatchObject({ status: 'supported', productionVerification: { statusCode: 200, resultId: '9001', lastFailure: { statusCode: 400, errorCode: 'BID_LIMIT_EXCEEDED' } } });
    expect(bid?.evidence).toContain('kuota bid akun habis');
    expect(marketplace.find((item) => item.operation === 'edit_profile')?.status).toBe('supported');
    expect(marketplace.find((item) => item.operation === 'send_message')?.status).toBe('unknown');
  });

  it('requires the dedicated sandbox token and exposes provider failures without promoting the capability', async () => {
    const verifySandboxWrite = vi.fn(async () => { throw new FreelancerSandboxWriteError(403, 'denied'); });
    const noTokenApp = await createApp({ verifyFreelancerSandboxWrite: verifySandboxWrite });
    const deniedConfig = await noTokenApp.inject({ method: 'POST', url: '/api/freelancer/sandbox-write-test', payload: { operation: 'send_message', threadId: 81, message: 'Check.' } });
    expect(deniedConfig.statusCode).toBe(409);
    expect(verifySandboxWrite).not.toHaveBeenCalled();
    await noTokenApp.close();

    const sandboxApp = await createApp({ freelancerSandboxTokenConfigured: true, verifyFreelancerSandboxWrite: verifySandboxWrite });
    const failedCheck = await sandboxApp.inject({ method: 'POST', url: '/api/freelancer/sandbox-write-test', payload: { operation: 'send_message', threadId: 81, message: 'Check.' } });
    const capabilities = await sandboxApp.inject({ method: 'GET', url: '/api/capabilities' });
    const messageCapability = capabilities.json().marketplace.find((item: { operation: string }) => item.operation === 'send_message');

    expect(failedCheck.statusCode).toBe(502);
    expect(failedCheck.json()).toMatchObject({ providerStatusCode: 403 });
    expect(messageCapability).toMatchObject({ status: 'unknown', sandboxVerification: { statusCode: 403 } });
    await sandboxApp.close();
  });

  it('removes generic production writes', async () => {
    const productionApp = await createApp({ credentialStatus: { freelancerAccessTokenConfigured: true, linkedinClientConfigured: false, linkedinAccessTokenConfigured: false, linkedinAccessTokenExpiresAt: null } });
    const response = await productionApp.inject({ method: 'POST', url: '/api/freelancer/production-write', payload: { operation: 'send_message', threadId: 81, message: 'Blocked.', confirmLive: true } });
    expect(response.statusCode).toBe(404);
    await productionApp.close();
  });

  it('syncs only provider results and updates read capability after a successful API response', async () => {
    const project = { ...testOpportunity, id: 'freelancer:839101', source: 'freelancer' as const };
    const credentialApp = await createApp({
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
    expect((await repository.getProject(project.id))?.source).toBe('freelancer');
    expect(rows.find((item) => item.operation === 'read_projects')?.status).toBe('supported');
    expect(rows.find((item) => item.operation === 'read_profile')?.status).toBe('unknown');
    expect(rows.filter((item) => ['submit_bid', 'edit_profile', 'send_message'].includes(item.operation)).every((item) => item.status === 'unknown')).toBe(true);
    await credentialApp.close();
  });

  it('returns provider authorization and rate-limit status codes without mislabeling them', async () => {
    const credentialApp = await createApp({
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
    const credentialApp = await createApp({ linkedinOAuth: { redirectUri: 'http://127.0.0.1:3001/api/linkedin/callback', start, handleCallback, close: () => {} } });
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

  it('summarizes past activity per local day for the agenda', async () => {
    await repository.appendAudit({ type: 'marketplace.production.submit_bid', resourceId: 'freelancer:1', status: 'recorded', reason: 'Bid otomatis menghasilkan HTTP 200.', policyVersion: 1, payloadHash: null });
    await repository.appendAudit({ type: 'autopilot.bid_skipped', resourceId: 'freelancer:2', status: 'blocked', reason: 'Dilewati.', policyVersion: 1, payloadHash: null });
    const summary = (await app.inject({ method: 'GET', url: '/api/agenda/activity?days=2' })).json() as { days: Record<string, Record<string, number>> };
    const today = Object.values(summary.days).reduce((total, day) => ({ bidSent: total.bidSent + (day.bidSent ?? 0), skipped: total.skipped + (day.skipped ?? 0) }), { bidSent: 0, skipped: 0 });
    expect(today).toEqual({ bidSent: 1, skipped: 1 });
    const day = Object.keys(summary.days)[0] as string;
    const detail = (await app.inject({ method: 'GET', url: '/api/agenda/activity?date=' + day })).json() as { events: Array<{ type: string }> };
    expect(detail.events.map((event) => event.type)).toEqual(['marketplace.production.submit_bid']);
    expect((await app.inject({ method: 'GET', url: '/api/agenda/activity?date=bukan-tanggal' })).statusCode).toBe(400);
  });

  it('rejects untrusted browser origins and malformed policy updates', async () => {
    const crossOrigin = await app.inject({ method: 'POST', url: '/api/policy/pause', headers: { origin: 'https://attacker.example' } });
    const sameOrigin = await app.inject({ method: 'GET', url: '/api/profile', headers: { origin: 'http://localhost' } });
    await repository.savePolicy({ ...(await repository.getPolicy()), state: 'active', simulationOnly: false });
    const liveEdit = await app.inject({ method: 'PUT', url: '/api/policy', payload: { allowedActions: ['bid.submit'], keywords: [], minimumConfidence: 0.5, minPrice: 100, maxPrice: 800, dailyBidLimit: 7, weeklyBidLimit: 12, timezone: 'Asia/Jakarta', activeHours: { start: 0, end: 24 }, noNegotiationTerms: [] } });
    expect(liveEdit.json()).toMatchObject({ state: 'active', simulationOnly: false, dailyBidLimit: 7 });
    await repository.savePolicy({ ...(await repository.getPolicy()), state: 'draft', simulationOnly: true });
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
    const result = await app.inject({ method: 'POST', url: '/api/policy/activate', payload: { mode: 'live', confirmLive: false } });

    expect(result.statusCode).toBe(400);
    expect((await repository.getPolicy()).state).toBe('draft');
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

  it('has no simulation mode: activation is live only and fails closed without autopilot or Freelancer credentials', async () => {
    const activated = await configureAndActivatePolicy();
    const legacy = await app.inject({ method: 'POST', url: '/api/policy/activate', payload: { confirmSimulation: true } });
    const simulate = await app.inject({ method: 'POST', url: `/api/projects/${encodeURIComponent(testOpportunity.id)}/simulate-submit` });

    expect(activated.statusCode).toBe(409);
    expect(legacy.statusCode).toBe(400);
    expect(simulate.statusCode).toBe(404);
    expect((await repository.getPolicy()).state).toBe('draft');
  });

  it('pauses the kill switch immediately and records it in the audit', async () => {
    await repository.savePolicy({ ...(await repository.getPolicy()), state: 'active', simulationOnly: false });
    const paused = await app.inject({ method: 'POST', url: '/api/policy/pause' });

    expect(paused.json().state).toBe('paused');
    expect((await repository.listAudit(10)).some((event) => event.type === 'policy.paused')).toBe(true);
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
    expect(await repository.knowledgeCoverage()).toEqual({ sources: 0, chunks: 0 });
  });

  it('keeps GitHub unknown until a repository sync succeeds, then records read-only evidence', async () => {
    const githubRepository = await WorkspaceRepository.open();
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('/repos/owner/repo')) return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 });
      if (url.includes('/git/trees/main?recursive=1')) return new Response(JSON.stringify({ sha: 'tree-sha', tree: [{ path: 'README.md', type: 'blob', size: 45 }] }), { status: 200 });
      return new Response('A local workspace for documented project notes.', { status: 200 });
    });
    const githubApp = await createApp({ repository: githubRepository, fetcher });
    await githubApp.ready();

    expect((await githubApp.inject({ method: 'GET', url: '/api/capabilities' })).json().github.verificationStatus).toBe('unknown');
    const synced = await githubApp.inject({ method: 'POST', url: '/api/knowledge/github/sync', payload: { repository: 'owner/repo' } });
    const capabilities = await githubApp.inject({ method: 'GET', url: '/api/capabilities' });

    expect(synced.statusCode).toBe(201);
    expect(synced.json()).toMatchObject({ filesSeen: 1, complete: true });
    expect(capabilities.json().github.verificationStatus).toBe('supported');
    expect(await githubRepository.listKnowledgeSources()).toMatchObject([{ provider: 'github', label: 'owner/repo' }]);

    await githubApp.close();
    await githubRepository.close();
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
    await repository.recordSubmittedBid({ projectId: testOpportunity.id, bidId: '9001', amount: 200, currency: 'USD', submittedAt: '2026-10-10T00:00:00.000Z' });
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

describe('GitHub knowledge sync', () => {
  it('indexes every owned repository and replaces the previous index on re-sync', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/user/repos')) return json([{ full_name: 'me/portfolio', fork: false, archived: false }, { full_name: 'me/forked', fork: true, archived: false }]);
      if (url.endsWith('/repos/me/portfolio')) return json({ default_branch: 'main' });
      if (url.includes('/git/trees/')) return json({ sha: 'tree-1', truncated: false, tree: [{ path: 'README.md', type: 'blob', size: 40 }] });
      return new Response('# Portfolio\n\nLaravel and Flutter delivery notes.', { status: 200 });
    });
    const githubApp = await createApp({ repository, githubToken: 'token-value-1234567890', fetcher: fetcher as typeof fetch });

    const first = (await githubApp.inject({ method: 'POST', url: '/api/knowledge/github/sync-all' })).json();
    await githubApp.inject({ method: 'POST', url: '/api/knowledge/github/sync-all' });

    expect(first).toMatchObject({ synced: 1, repositories: [{ repository: 'me/portfolio', error: null }] });
    expect((await repository.listKnowledgeSources()).filter((source) => source.label === 'me/portfolio')).toHaveLength(1);
    expect((await (await createApp({ repository })).inject({ method: 'POST', url: '/api/knowledge/github/sync-all' })).statusCode).toBe(400);
    await githubApp.close();
  });
});
