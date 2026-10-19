import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Page } from 'playwright-core';
import { WorkspaceRepository } from '@fvh/persistence';
import { PROJECTS_CO_ID_DEFAULTS, type ProjectOpportunity } from '@fvh/domain';
import type { DraftingInput } from '@fvh/application';
const driver = vi.hoisted(() => ({ inspect: vi.fn(), listOpenProjects: vi.fn(), readProject: vi.fn(), protect: vi.fn() }));
vi.mock('./projects-co-id-page.js', () => ({ ProjectsCoIdPage: class { inspect = driver.inspect; listOpenProjects = driver.listOpenProjects; readProject = driver.readProject; protect = driver.protect; blockedWrites = 0; } }));
import { ProjectsCoIdService } from './projects-co-id.js';
import { validProjectsCoIdProposal } from './projects-co-id-types.js';

const project = (id = '55601d'): ProjectOpportunity => ({
  id: `projects_co_id:${id}`, sourceSlug: 'aplikasi-online', title: 'Aplikasi TypeScript', description: 'Membuat aplikasi TypeScript dengan pengujian dan dokumentasi sesuai alur yang disepakati. '.repeat(5),
  source: 'projects_co_id', projectType: 'fixed', clientName: 'owner-fixture', budgetMin: 500_000, budgetMax: 1_000_000, currency: 'IDR', skills: ['TypeScript'], deadlineDays: 14, briefQuality: 0.9, riskScore: 0.1, status: 'open', createdAt: new Date().toISOString(),
});
const output = (input: DraftingInput) => ({ proposal: 'Saya akan membangun alur aplikasi TypeScript, menguji kebutuhan utama dan menyerahkan dokumentasi penggunaan.', proposedPrice: input.fixedBid!.amount, durationDays: input.fixedBid!.durationDays, confidence: 0.9, evidence: [], assumptions: [] });

describe('projects.co.id draft worker', () => {
  let repo: WorkspaceRepository;
  let service: ProjectsCoIdService;
  const draft = vi.fn(async (input: DraftingInput) => output(input));
  beforeEach(async () => {
    vi.clearAllMocks();
    repo = await WorkspaceRepository.open();
    const policy = await repo.getPolicy();
    await repo.savePolicy({ ...policy, state: 'active', allowedActions: ['bid.submit'], expiresAt: '2099-01-01T00:00:00Z', specializations: ['TypeScript'], keywords: [], minimumConfidence: 0.5, activeHours: { start: 0, end: 24 }, projectsCoId: { ...PROJECTS_CO_ID_DEFAULTS, mode: 'drafts' } });
    const profile = await repo.getProfile(); await repo.saveProfile({ ...profile, specializations: ['TypeScript'] });
    driver.inspect.mockResolvedValue({ username: 'KhairulHuda06', remaining: null, pageStatus: 200, checkedAt: new Date().toISOString(), challenge: false });
    driver.listOpenProjects.mockResolvedValue([project()]); driver.readProject.mockImplementation(async p => p); driver.protect.mockResolvedValue(undefined);
    draft.mockImplementation(async input => output(input));
    service = new ProjectsCoIdService(repo, async () => ({ page: { setDefaultTimeout: vi.fn() } as unknown as Page, disconnect: async () => undefined, onDisconnect: () => undefined }), undefined, draft);
  });
  afterEach(async () => { await service.close(); await repo.close(); });

  it('requires the actual matching account and stops on a challenge', async () => {
    for (const [changes, state] of [[{ username: null }, 'login_required'], [{ username: 'other' }, 'account_mismatch'], [{ challenge: true }, 'challenge']] as const) {
      driver.inspect.mockResolvedValue({ username: 'KhairulHuda06', remaining: null, pageStatus: 200, checkedAt: new Date().toISOString(), challenge: false, ...changes });
      await service.open(); expect((await service.status()).state).toBe(state);
      await expect(service.scan()).rejects.toThrow();
    }
    expect(driver.listOpenProjects).not.toHaveBeenCalled(); expect(draft).not.toHaveBeenCalled();
  });
  it('creates one IDR draft, keeps Freelancer quota untouched, and never redrafts', async () => {
    await service.open(); await service.scan(); await service.scan();
    expect(draft).toHaveBeenCalledOnce();
    expect((await repo.getLatestDraft(project().id))).toMatchObject({ proposedPrice: 500_000, durationDays: 14, currency: 'IDR' });
    expect((await repo.listProjects())[0]?.pipelineStatus).toBe('draft_ready');
    expect(await repo.bidUsage(new Date(), 'Asia/Jakarta')).toEqual({ today: 0, week: 0 });
    expect((await service.status()).draftUsage.today).toBe(1);
    expect(await repo.listBidOutcomes()).toEqual([]);
  });
  it('uses the Indonesian template for a wrong nominal, duration, or Hermes error', async () => {
    await service.open();
    for (const [index, proposal] of ['Harga Rp1,5 juta dan estimasi pengerjaan untuk lingkup aplikasi sesuai kesepakatan.', 'Estimasi 5 hari untuk aplikasi TypeScript sesuai kebutuhan dan kriteria selesai.', null].entries()) {
      const p = { ...project(`55601${index}`), title: 'Aplikasi anggaran Rp1,5 juta selama 5 hari' }; driver.listOpenProjects.mockResolvedValue([p]);
      if (proposal === null) draft.mockRejectedValue(new Error('Fixture timeout')); else draft.mockImplementation(async input => ({ ...output(input), proposal }));
      await service.scan(); const saved = await repo.getLatestDraft(p.id); expect(saved?.proposal).toContain('Harga Rp500.000');
      expect(validProjectsCoIdProposal(saved!.proposal, 500_000, 14)).toBe(true);
    }
    expect((await repo.listAuditForType('autopilot.draft_fallback')).length).toBe(3);
  });
  it('enforces quota before detail/Hermes and pauses without scanning', async () => {
    const policy = await repo.getPolicy();
    await repo.savePolicy({ ...policy, projectsCoId: { ...PROJECTS_CO_ID_DEFAULTS, mode: 'drafts', dailyBidLimit: 1 } });
    await repo.appendAudit({ type: 'projects_co_id.draft_created', resourceId: 'earlier', status: 'recorded', reason: 'Fixture', policyVersion: policy.version, payloadHash: null });
    await service.open(); await service.scan(); expect(draft).not.toHaveBeenCalled(); expect(driver.readProject).not.toHaveBeenCalled();
    driver.listOpenProjects.mockClear(); await repo.savePolicy({ ...await repo.getPolicy(), state: 'paused' });
    await expect(service.scan()).rejects.toThrow(/dijeda/); expect(driver.listOpenProjects).not.toHaveBeenCalled();
  });
  it('discards a draft if the owner pauses while Hermes is running', async () => {
    draft.mockImplementation(async input => { await repo.savePolicy({ ...await repo.getPolicy(), state: 'paused' }); return output(input); });
    await service.open(); await expect(service.scan()).rejects.toThrow(/dijeda/);
    expect(await repo.getLatestDraft(project().id)).toBeUndefined();
  });
  it('scan-only stores opportunities without drafts; manual drafts do not consume automatic quota', async () => {
    await service.setMode('scan-only'); expect((await repo.getPolicy()).state).toBe('active');
    await service.open(); await service.scan(); expect(draft).not.toHaveBeenCalled();
    await service.createDraft(project().id); expect((await service.status()).draftUsage.today).toBe(0);
  });
  it('records owner marking once without adding any Freelancer bid result', async () => {
    await service.open(); await service.scan();
    await service.ownerAction(project().id, 'mark-sent'); await service.ownerAction(project().id, 'mark-sent');
    expect((await repo.listAuditForType('projects_co_id.owner_marked_sent')).length).toBe(1);
    expect((await service.drafts())[0]).toMatchObject({ pipelineStatus: 'submitted', url: 'https://projects.co.id/public/browse_projects/view/55601d/aplikasi-online' });
    expect(await repo.listBidOutcomes()).toEqual([]);
  });
  it('commits quota, draft and pipeline atomically across competing projects', async () => {
    const policy = await repo.getPolicy();
    await repo.savePolicy({ ...policy, projectsCoId: { ...PROJECTS_CO_ID_DEFAULTS, mode: 'drafts', dailyBidLimit: 1 } });
    const projects = [project('556010'), project('556011')]; await repo.syncProjects(projects);
    const results = await Promise.allSettled(projects.map((p, i) => repo.createProjectsCoIdDraft({ id: `race-${i}`, projectId: p.id, proposal: 'Saya akan membangun alur aplikasi sesuai kebutuhan, menguji dan menyerahkan dokumentasi.', proposedPrice: 500_000, durationDays: 14, confidence: 0.9, currency: 'IDR', status: 'draft_ready', evidence: [], assumptions: [], createdAt: new Date().toISOString() }, policy.version, true)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await repo.latestDrafts()).size).toBe(1);
    expect((await repo.listProjects()).filter(p => p.pipelineStatus === 'draft_ready')).toHaveLength(1);
    expect(await repo.bidUsage(new Date(), 'Asia/Jakarta', 'projects_co_id.draft_created')).toEqual({ today: 1, week: 1 });
  });
  it('rotates three searches per scan through all configured terms and records who wrote the draft', async () => {
    await repo.savePolicy({ ...await repo.getPolicy(), projectsCoId: { ...PROJECTS_CO_ID_DEFAULTS, mode: 'drafts', fields: ['ai'], useProfileSkills: false } });
    await service.open(); await service.scan();
    expect(driver.listOpenProjects.mock.calls[0]![2]).toEqual(['AI', 'Machine Learning', 'Chatbot']);
    expect((await service.status()).lastSearchTerms).toEqual(['AI', 'Machine Learning', 'Chatbot']);
    await service.check(); await service.scan();
    expect(driver.listOpenProjects.mock.calls[1]![2]).toEqual(['OpenAI', 'LLM', 'AI']);
    expect((await repo.getLatestDraft(project().id))?.author).toBe('hermes');
    draft.mockRejectedValueOnce(new Error('timeout')); driver.listOpenProjects.mockResolvedValue([project('556012')]);
    await service.check(); await service.scan();
    expect((await repo.getLatestDraft(project('556012').id))?.author).toBe('template');
  });
  it('marks won only after sent, and creates one active IDR project from the draft', async () => {
    await service.open(); await service.scan();
    await expect(service.ownerAction(project().id, 'won')).rejects.toThrow(/terkirim/);
    await service.ownerAction(project().id, 'mark-sent'); await service.ownerAction(project().id, 'won'); await service.ownerAction(project().id, 'won');
    expect(await repo.listClientProjects()).toEqual([expect.objectContaining({ source: 'projects_co_id', externalProjectId: project().id, value: 500_000, currency: 'IDR', status: 'active' })]);
    expect((await service.drafts())[0]?.pipelineStatus).toBe('won');
    await expect(service.ownerAction(project().id, 'mark-sent')).rejects.toThrow();
  });
});
