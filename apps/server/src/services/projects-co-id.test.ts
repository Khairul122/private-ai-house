import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceRepository } from '@fvh/persistence';
import { projectsCoIdSettingsSchema } from '@fvh/contracts';
import { PROJECTS_CO_ID_DEFAULTS, projectsCoIdDraftPolicy, projectsCoIdFieldsOf, projectsCoIdSearchTerms, projectsCoIdSettings, scoreProject, type AutonomyPolicy } from '@fvh/domain';
import { chooseProjectsCoIdBid, mentionedRupiahAmounts, parseProjectsCoIdProject, projectsCoIdPath, validProjectsCoIdProposal, readRupiahBudget } from '../models/projects-co-id-types.js';
import { ProjectsCoIdService } from './projects-co-id.js';
import { createApp } from '../app.js';

const now = new Date('2026-10-19T09:00:00Z');
const listing = {
  href: 'https://projects.co.id/public/browse_projects/view/55601d/aplikasi-online', title: 'Aplikasi online',
  description: 'Membangun aplikasi web dan integrasi database sesuai dokumentasi proyek.', clientName: 'owner-fixture', skills: ['Web Design'],
  text: 'Published Budget: Rp 500,000 - 1,000,000\nPublished Date: 19/10/2026 13:34:26 WIB\nSelect Deadline: 18/11/2026 13:34:26 WIB\nFinish Days: 7\nProject Status: Published',
};
const project = () => parseProjectsCoIdProject(listing, now)!;

describe('projects.co.id read-only integration', () => {
  it('chooses only fixed IDR within the owner range and detects Rupiah multipliers', () => {
    expect(chooseProjectsCoIdBid(project(), PROJECTS_CO_ID_DEFAULTS)).toEqual({ amount: 500_000, period: 14 });
    expect(chooseProjectsCoIdBid({ ...project(), currency: 'USD' }, PROJECTS_CO_ID_DEFAULTS)).toBeNull();
    expect(chooseProjectsCoIdBid(project(), { ...PROJECTS_CO_ID_DEFAULTS, maxPrice: 400_000 })).toBeNull();
    expect(mentionedRupiahAmounts('Rp 1.500.000; Rp1,5 juta; 1.5jt; IDR 1500000')).toEqual([1_500_000, 1_500_000, 1_500_000, 1_500_000]);
    expect(validProjectsCoIdProposal('Saya akan menguji aplikasi dengan biaya Rp500 ribu dalam 14 hari sesuai lingkup.', 500_000, 14)).toBe(true);
    for (const text of ['Harga Rp1,5 juta untuk aplikasi dengan estimasi pengerjaan 14 hari.', 'Harga USD 500 untuk aplikasi dengan estimasi pengerjaan 14 hari.', 'Harga Rp500.000 untuk aplikasi dengan estimasi pengerjaan 5 hari.', 'a'.repeat(1201)]) expect(validProjectsCoIdProposal(text, 500_000, 14)).toBe(false);
    expect(() => projectsCoIdPath({ id: project().id, sourceSlug: '../../evil' })).toThrow();
  });

  let repo: WorkspaceRepository | undefined;
  let service: ProjectsCoIdService | undefined;
  afterEach(async () => { await service?.close(); await repo?.close(); });

  it('parses observed hexadecimal ids, WIB deadlines and both Rupiah separators without guessing missing facts', () => {
    expect(readRupiahBudget('Rp 1.500.000 - Rp 3.000.000')).toEqual([1_500_000, 3_000_000]);
    expect(readRupiahBudget('Rp 500,000 - 1,000,000')).toEqual([500_000, 1_000_000]);
    expect(readRupiahBudget('Rp 1,5 - 2 juta')).toBeNull();
    expect(readRupiahBudget('Rp 3.000.000 - 1.000.000')).toBeNull();
    expect(project()).toMatchObject({ id: 'projects_co_id:55601d', currency: 'IDR', budgetMin: 500_000, budgetMax: 1_000_000, deadlineDays: 29, source: 'projects_co_id', status: 'open' });
    expect(scoreProject(project(), ['Web Design']).score).toBeGreaterThan(0);
    expect(parseProjectsCoIdProject({ ...listing, href: 'https://evil.test/public/browse_projects/view/55601d/x' }, now)).toBeNull();
    expect(parseProjectsCoIdProject({ ...listing, text: listing.text.replace('Published Budget:', 'Budget:') }, now)).toBeNull();
    expect(parseProjectsCoIdProject({ ...listing, text: listing.text.replace(/Select Deadline:[^\n]+/, 'Select Deadline: unknown') }, now)?.deadlineDays).toBeNull();
  });

  it('builds search terms from fields, own keywords and profile skills, and fills settings saved before these options', () => {
    const settings = { ...PROJECTS_CO_ID_DEFAULTS, fields: ['ai'], keywords: ['laravel', 'Scraping'], useProfileSkills: true };
    expect(projectsCoIdSearchTerms(settings, ['Laravel', 'Python'])).toEqual(['AI', 'Machine Learning', 'Chatbot', 'OpenAI', 'LLM', 'laravel', 'Scraping', 'Python']);
    expect(projectsCoIdSearchTerms({ ...settings, fields: [], keywords: [], useProfileSkills: false }, ['Laravel'])).toEqual([]);
    const legacy = { username: 'KhairulHuda06', minPrice: 1, maxPrice: 2, dailyBidLimit: 1, weeklyBidLimit: 1, mode: 'drafts' } as AutonomyPolicy['projectsCoId'];
    expect(projectsCoIdSettings({ projectsCoId: legacy })).toMatchObject({ fields: [], keywords: [], useProfileSkills: true, minimumScore: 50, minPrice: 1 });
    expect(projectsCoIdSettingsSchema.parse(legacy)).toMatchObject({ fields: [], useProfileSkills: true, minimumScore: 50 });
    expect(projectsCoIdDraftPolicy({ minimumConfidence: 0.9, projectsCoId: { ...PROJECTS_CO_ID_DEFAULTS, minimumScore: 30 } } as AutonomyPolicy).minimumConfidence).toBe(0.3);
  });

  it('classifies fields by whole terms, so "AI" does not match words like "detail"', () => {
    expect(projectsCoIdFieldsOf({ title: 'Chatbot WhatsApp dengan OpenAI', description: 'Integrasi API', skills: ['Python'] })).toEqual(['ai', 'backend', 'data']);
    expect(projectsCoIdFieldsOf({ title: 'Perbaiki detail email', description: 'tidak ada rincian', skills: [] })).toEqual([]);
  });

  it('validates settings and keeps automatic submission unavailable', () => {
    expect(projectsCoIdSettingsSchema.safeParse(PROJECTS_CO_ID_DEFAULTS).success).toBe(true);
    for (const changes of [{ mode: 'auto' }, { fields: ['crypto'] }, { keywords: ['a&b=c'] }, { minimumScore: 101 }, { minPrice: -1 }, { maxPrice: 10 }, { dailyBidLimit: 1.5 }, { username: '' }, { url: 'https://evil.test' }]) {
      expect(projectsCoIdSettingsSchema.safeParse({ ...PROJECTS_CO_ID_DEFAULTS, ...changes }).success).toBe(false);
    }
  });

  it('stores separate platform ids, preserves pipeline on rescan, and persists policy settings with optimistic locking', async () => {
    repo = await WorkspaceRepository.open();
    await repo.syncProjects([project()]);
    await repo.setPipelineStatus(project().id, 'scored');
    await repo.setPipelineStatus(project().id, 'reconciliation_required');
    await repo.syncProjects([{ ...project(), title: 'Updated title' }]);
    expect((await repo.listProjects())[0]).toMatchObject({ title: 'Updated title', pipelineStatus: 'reconciliation_required' });
    expect(await repo.sql.query('SELECT platform, external_id FROM projects')).toEqual([{ platform: 'projects_co_id', external_id: '55601d' }]);
    const policy = await repo.getPolicy();
    const next = { ...policy, version: policy.version + 1, projectsCoId: { ...PROJECTS_CO_ID_DEFAULTS, minPrice: 200_000 } };
    expect(await repo.savePolicyIfVersion(next, policy.version)).toBe(true);
    expect((await repo.getPolicy()).projectsCoId?.minPrice).toBe(200_000);
    expect(await repo.savePolicyIfVersion(next, policy.version)).toBe(false);
  });

  it('counts recorded quotas separately in the policy timezone', async () => {
    repo = await WorkspaceRepository.open();
    for (const [type, status] of [['marketplace.production.submit_bid', 'recorded'], ['projects_co_id.draft_created', 'recorded'], ['projects_co_id.draft_created', 'failed']] as const) {
      await repo.appendAudit({ type, status, resourceId: 'fixture', reason: 'Fixture', policyVersion: null, payloadHash: null, createdAt: now.toISOString() });
    }
    expect(await repo.bidUsage(now, 'Asia/Jakarta')).toEqual({ today: 1, week: 1 });
    expect(await repo.bidUsage(now, 'Asia/Jakarta', 'projects_co_id.draft_created')).toEqual({ today: 1, week: 1 });
    expect(await repo.listBidOutcomes()).toEqual([]);
    for (const createdAt of ['2026-10-18T16:30:00Z', '2026-10-18T17:15:00Z']) await repo.appendAudit({ type: 'projects_co_id.draft_created', resourceId: createdAt, status: 'recorded', reason: 'Fixture boundary', policyVersion: null, payloadHash: null, createdAt });
    const boundary = new Date('2026-10-18T17:30:00Z');
    expect(await repo.bidUsage(boundary, 'Asia/Jakarta', 'projects_co_id.draft_created')).toEqual({ today: 1, week: 1 });
    expect(await repo.bidUsage(boundary, 'UTC', 'projects_co_id.draft_created')).toEqual({ today: 2, week: 2 });
  });

  it('protects control routes and rejects auto/free payloads while policy settings round-trip through the API', async () => {
    repo = await WorkspaceRepository.open();
    await repo.savePolicy({ ...await repo.getPolicy(), state: 'active', simulationOnly: false });
    service = new ProjectsCoIdService(repo, async () => { throw new Error('Not connected'); });
    const app = await createApp({ repository: repo, projectsCoId: service });
    try {
      const origin = { origin: 'http://127.0.0.1:5174' };
      const status = await app.inject({ method: 'GET', url: '/api/projects-co-id' });
      expect(status.headers['cache-control']).toBe('no-store');
      expect(status.json()).toMatchObject({ state: 'stopped', readyDrafts: 0 });
      expect((await app.inject({ method: 'POST', url: '/api/projects-co-id/scan', headers: origin })).statusCode).toBe(410);
      expect((await app.inject({ method: 'PUT', url: '/api/projects-co-id/mode', headers: origin, payload: { mode: 'auto' } })).statusCode).toBe(410);
      expect((await app.inject({ method: 'POST', url: '/api/projects-co-id/open', headers: origin, payload: { url: 'https://evil.test' } })).statusCode).toBe(410);
      expect((await app.inject({ method: 'POST', url: '/api/projects-co-id/submit', headers: origin })).statusCode).toBe(404);
      const policy = await repo.getPolicy();
      const saved = await app.inject({ method: 'PUT', url: '/api/policy', headers: origin, payload: { ...policy, projectsCoId: PROJECTS_CO_ID_DEFAULTS, expectedVersion: policy.version } });
      expect(saved.statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/policy' })).json().projectsCoId).toEqual(PROJECTS_CO_ID_DEFAULTS);
      expect((await repo.getPolicy()).state).toBe('active');
      expect((await app.inject({ method: 'GET', url: '/api/capabilities' })).json().projectsCoId.autoAvailable).toBe(false);
    } finally { await app.close(); }
  });

  it('protects owner confirmations and preserves policy price on every draft edit route', async () => {
    repo = await WorkspaceRepository.open();
    await repo.syncProjects([project()]);
    await repo.createDraft({ id: 'draft-test', projectId: project().id, proposal: 'Saya akan membuat aplikasi, menguji alurnya dan memberikan dokumentasi penggunaan.', proposedPrice: 500_000, durationDays: 14, currency: 'IDR', confidence: 0.9, evidence: [], assumptions: [], status: 'draft_ready', createdAt: now.toISOString() });
    service = new ProjectsCoIdService(repo);
    const app = await createApp({ repository: repo, projectsCoId: service });
    try {
      const headers = { origin: 'http://127.0.0.1:5174' };
      const url = `/api/projects-co-id/projects/${encodeURIComponent(project().id)}/mark-sent`;
      expect((await app.inject({ method: 'POST', url, headers, payload: {} })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url, payload: { confirm: true } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url, headers: { origin: 'https://evil.test' }, payload: { confirm: true } })).statusCode).toBe(403);
      const edit = { proposal: 'Saya akan menguji aplikasi dan menyerahkan dokumentasi serta alur yang disepakati.', proposedPrice: 600_000 };
      expect((await app.inject({ method: 'PUT', url: '/api/drafts/draft-test', headers, payload: edit })).statusCode).toBe(400);
      expect((await app.inject({ method: 'PUT', url: '/api/drafts/draft-test', headers, payload: { ...edit, proposedPrice: 500_000 } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url, headers, payload: { confirm: true } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: '/api/projects-co-id/drafts' })).json()[0]).toMatchObject({ pipelineStatus: 'submitted', ownerActionAt: expect.any(String) });
      expect((await app.inject({ method: 'GET', url: '/api/dashboard' })).json().counts.submittedBids).toBe(0);
      expect(await repo.listBidOutcomes()).toEqual([]);
    } finally { await app.close(); }
  });
});
