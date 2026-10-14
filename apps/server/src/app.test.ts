import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceRepository } from '@fvh/persistence';
import { createApp } from './app.js';

const fixedNow = new Date('2026-10-14T04:00:00.000Z');
let repository: WorkspaceRepository;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  repository = new WorkspaceRepository();
  app = createApp({ repository, clock: () => new Date(fixedNow) });
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
  it('serves health, capabilities, and clearly labeled fixture opportunities', async () => {
    const health = await app.inject({ method: 'GET', url: '/api/health' });
    const capabilities = await app.inject({ method: 'GET', url: '/api/capabilities' });
    const projects = await app.inject({ method: 'GET', url: '/api/projects' });

    expect(health.json()).toMatchObject({ ok: true, mode: 'local', liveWrites: false });
    expect(capabilities.json().marketplace.every((item: { status: string }) => item.status === 'unknown')).toBe(true);
    expect(capabilities.json().freelancerCredentials).toEqual({ accessTokenConfigured: false });
    expect(capabilities.json().linkedin.clientConfigured).toBe(false);
    expect(projects.json()).toHaveLength(4);
    expect(projects.json()[0].source).toBe('fixture');
  });

  it('reports credential presence without exposing credential values', async () => {
    const credentialApp = createApp({ credentialStatus: { freelancerAccessTokenConfigured: true, linkedinClientConfigured: true } });
    const response = await credentialApp.inject({ method: 'GET', url: '/api/capabilities' });

    expect(response.json().freelancerCredentials).toEqual({ accessTokenConfigured: true });
    expect(response.json().linkedin.clientConfigured).toBe(true);
    expect(JSON.stringify(response.json())).not.toContain('secret-value');
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
    const created = await app.inject({ method: 'POST', url: '/api/projects/demo-project-01/draft' });
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
    await app.inject({ method: 'POST', url: '/api/projects/demo-project-01/draft' });
    const simulated = await app.inject({ method: 'POST', url: '/api/projects/demo-project-01/simulate-submit' });
    const response = simulated.json();

    expect(simulated.statusCode).toBe(200);
    expect(response).toMatchObject({ externalWrites: false, marketplaceStatus: 'unchanged', pipelineStatus: 'draft_ready', decision: { allowed: true, simulationOnly: true } });
    expect(response.event.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.listProjects().find((item) => item.id === 'demo-project-01')?.pipelineStatus).toBe('draft_ready');
  });

  it('pauses the kill switch immediately and records the blocked reason', async () => {
    await configureAndActivatePolicy();
    await app.inject({ method: 'POST', url: '/api/projects/demo-project-01/draft' });
    await app.inject({ method: 'POST', url: '/api/policy/pause' });
    const result = await app.inject({ method: 'POST', url: '/api/projects/demo-project-01/simulate-submit' });

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
});
