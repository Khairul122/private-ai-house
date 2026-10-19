import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Page } from 'playwright-core';
import { WorkspaceRepository } from '@fvh/persistence';
import { PROJECTS_CO_ID_DEFAULTS, type ProjectOpportunity } from '@fvh/domain';
import type { DraftingInput } from '@fvh/application';
const driver = vi.hoisted(() => ({ inspect: vi.fn(), listOpenProjects: vi.fn(), readProject: vi.fn(), protect: vi.fn(), onBlockedWrite: undefined as (() => void) | undefined }));
vi.mock('../lib/projects-co-id-page.js', () => ({ ProjectsCoIdPage: class { constructor(_page: unknown, _origin: unknown, onBlockedWrite?: () => void) { driver.onBlockedWrite = onBlockedWrite; } inspect = driver.inspect; listOpenProjects = driver.listOpenProjects; readProject = driver.readProject; protect = driver.protect; blockedWrites = 0; } }));
import { PageBudget, ProjectsCoIdService } from './projects-co-id.js';
import { ProjectsCoIdTelegram } from '../lib/projects-co-id-telegram.js';
import { validProjectsCoIdProposal } from '../models/projects-co-id-types.js';

const project = (id = '55601d'): ProjectOpportunity => ({
  id: `projects_co_id:${id}`, sourceSlug: 'aplikasi-online', title: 'Aplikasi TypeScript', description: 'Membuat aplikasi TypeScript dengan pengujian dan dokumentasi sesuai alur yang disepakati. '.repeat(5),
  source: 'projects_co_id', projectType: 'fixed', clientName: 'owner-fixture', budgetMin: 500_000, budgetMax: 1_000_000, currency: 'IDR', skills: ['TypeScript'], deadlineDays: 14, briefQuality: 0.9, riskScore: 0.1, status: 'open', createdAt: new Date().toISOString(),
});
const output = (input: DraftingInput) => ({ proposal: 'Saya akan membangun alur aplikasi TypeScript, menguji kebutuhan utama dan menyerahkan dokumentasi penggunaan.', proposedPrice: input.fixedBid!.amount, durationDays: input.fixedBid!.durationDays, confidence: 0.9, evidence: [], assumptions: [] });

describe('projects.co.id draft worker', () => {
  let repo: WorkspaceRepository;
  let service: ProjectsCoIdService;
  const draft = vi.fn(async (input: DraftingInput) => output(input));
  let clock = Date.now();
  let channel = '';
  const fetcher = vi.fn(async () => new Response(channel, { status: 200, headers: { 'content-type': 'text/html' } }));
  const connect = async () => ({ page: { setDefaultTimeout: vi.fn() } as unknown as Page, disconnect: async () => undefined, onDisconnect: () => undefined });
  // Tests below that are not about the page budget scan repeatedly; they get a large budget.
  const make = (pages = new PageBudget(1000)) => new ProjectsCoIdService(repo, connect, undefined, draft, new ProjectsCoIdTelegram(fetcher as unknown as typeof fetch, () => clock), pages);
  beforeEach(async () => {
    vi.clearAllMocks();
    repo = await WorkspaceRepository.open();
    const policy = await repo.getPolicy();
    await repo.savePolicy({ ...policy, state: 'active', allowedActions: ['bid.submit'], expiresAt: '2099-01-01T00:00:00Z', specializations: ['TypeScript'], keywords: [], minimumConfidence: 0.5, activeHours: { start: 0, end: 24 }, projectsCoId: { ...PROJECTS_CO_ID_DEFAULTS, mode: 'drafts' } });
    const profile = await repo.getProfile(); await repo.saveProfile({ ...profile, specializations: ['TypeScript'] });
    driver.inspect.mockResolvedValue({ username: 'KhairulHuda06', remaining: null, pageStatus: 200, checkedAt: new Date().toISOString(), challenge: false });
    driver.listOpenProjects.mockResolvedValue([project()]); driver.readProject.mockImplementation(async p => p); driver.protect.mockResolvedValue(undefined);
    draft.mockImplementation(async input => output(input));
    service = make();
  });
  afterEach(async () => { await service.close(); await repo.close(); });

  it('summarises blocked background writes in Aktivitas instead of one row per request', async () => {
    await service.open();
    for (let i = 0; i < 50; i++) driver.onBlockedWrite!();
    await vi.waitFor(async () => expect((await repo.listAudit(100)).filter(e => e.type === 'projects_co_id.write_blocked')).toHaveLength(1));
    expect((await repo.listAudit(100)).find(e => e.type === 'projects_co_id.write_blocked')?.reason).toMatch(/^1 request tulis/);
  });
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
  it('shares one 3-per-30-minute page budget between listing scans and detail reads; deferred drafts wait in the queue', async () => {
    const pages = new PageBudget(3, 30 * 60_000, () => clock);
    await service.close(); service = make(pages);
    await repo.savePolicy({ ...await repo.getPolicy(), projectsCoId: { ...PROJECTS_CO_ID_DEFAULTS, mode: 'drafts', fields: ['ai'], useProfileSkills: false } });
    const loads: number[] = [];
    driver.listOpenProjects.mockImplementation(async (_user: string, _authorize: unknown, searches: string[]) => { loads.push(...searches.map(() => clock)); return [project()]; });
    driver.readProject.mockImplementation(async (p: ProjectOpportunity) => { loads.push(clock); return project(p.id.slice(-6)); });
    await service.open(); await service.scan();
    expect(loads).toHaveLength(3); expect(driver.readProject).not.toHaveBeenCalled(); expect(draft).not.toHaveBeenCalled();
    expect(await service.status()).toMatchObject({ pageBudget: { used: 3, limit: 3, nextFreeAt: new Date(clock + 30 * 60_000).toISOString() }, telegram: { queued: 1 } });
    await expect(service.scan()).rejects.toThrow(/Batas 3 halaman/);
    await expect(service.createDraft(project().id)).rejects.toThrow(/Batas 3 halaman/);
    await service.readQueued(); expect(driver.readProject).not.toHaveBeenCalled();
    clock += 30 * 60_000 + 1;
    await service.readQueued();
    expect(driver.readProject).toHaveBeenCalledOnce(); expect(draft).toHaveBeenCalledOnce();
    expect((await repo.getLatestDraft(project().id))?.author).toBe('hermes');
    expect((await service.status()).telegram?.queued).toBe(0);
    for (const at of loads) expect(loads.filter(t => t > at - 30 * 60_000 && t <= at).length).toBeLessThanOrEqual(3);
  });
  it('reads new Telegram IDs through detail pages newest first and stops detail loads on kill switch or mode off', async () => {
    await service.close(); service = make(new PageBudget(3, 30 * 60_000, () => clock));
    const post = (id: string, n: number, title = `Aplikasi TypeScript ${id}`) => `<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="lowongankerjafreelance/${n}"><div class="tgme_widget_message_text js-message_text" dir="auto"><a href="https://projects.co.id/public/browse_projects/view/${id}/aplikasi-online" target="_blank"><b>${title}</b></a><br/><br/><b>Budget:</b> Rp 500,000 - 1,000,000</div><time datetime="2026-10-20T01:0${n}:00+00:00" class="time">08:0${n}</time></div></div>`;
    channel = post('a00001', 1) + post('a00002', 2) + post('b00003', 3, 'Desain logo kopi') + post('a00004', 4) + '<a href="https://evil.test/public/browse_projects/view/c00005/aplikasi-online">Aplikasi TypeScript</a>';
    const settings = { ...PROJECTS_CO_ID_DEFAULTS, mode: 'drafts' as const };
    await repo.syncProjects([project('a00001')]);
    driver.readProject.mockImplementation(async (p: ProjectOpportunity) => project(p.id.slice(-6)));
    await service.open(); await service.pollTelegram(); await service.pollTelegram();
    expect(fetcher).toHaveBeenCalledOnce();
    expect((await service.status()).telegram).toMatchObject({ ok: true, error: null, queued: 2 });
    const active = await repo.getPolicy();
    await repo.savePolicy({ ...active, state: 'paused' }); await expect(service.readQueued()).rejects.toThrow(/dijeda/);
    await repo.savePolicy({ ...active, projectsCoId: { ...settings, mode: 'off' } }); await expect(service.readQueued()).rejects.toThrow(/dinonaktifkan/);
    expect(driver.readProject).not.toHaveBeenCalled(); expect((await service.status()).pageBudget?.used).toBe(0);
    await repo.savePolicy({ ...active, projectsCoId: settings });
    await service.readQueued();
    expect(driver.readProject.mock.calls.map(call => (call[0] as ProjectOpportunity).id)).toEqual(['projects_co_id:a00004', 'projects_co_id:a00002']);
    expect(driver.listOpenProjects).not.toHaveBeenCalled(); expect(draft).toHaveBeenCalledTimes(2);
    expect(await service.status()).toMatchObject({ telegram: { queued: 0 }, pageBudget: { used: 2 } });
    expect((await repo.listProjects()).map(p => p.id).sort()).toEqual(['projects_co_id:a00001', 'projects_co_id:a00002', 'projects_co_id:a00004']);
  });
});
