import { chooseProjectsCoIdBid, evaluatePolicy, projectsCoIdDraftPolicy, PROJECTS_CO_ID_DEFAULTS, scoreProject, type BidDraft, type ProjectsCoIdSettings } from '@fvh/domain';
import { projectsCoIdSettingsSchema, proposalDraftOutputSchema } from '@fvh/contracts';
import { createId, type DraftingInput, type DraftingOutput } from '@fvh/application';
import type { WorkspaceRepository } from '@fvh/persistence';
import { validProjectsCoIdProposal, projectsCoIdPath, PROJECTS_CO_ID_ORIGIN, PROJECTS_CO_ID_AUTO_REASON, type ProjectsCoIdStatus } from '../models/projects-co-id-types.js';

export class ProjectsCoIdService {
  private current: ProjectsCoIdStatus = {
    mode: 'off', state: 'stopped', busy: false,
    reason: 'Pemindaian projects.co.id dinonaktifkan; hanya proyek tersimpan, draf lokal, dan aksi pemilik tersedia.',
    username: null, remaining: null, checkedAt: null, pageStatus: null, lastScanAt: null, lastResult: null,
    lastSearchTerms: [], searchTerms: [], autoAvailable: false, draftsInProgress: 0, projectCount: 0, readyDrafts: 0,
    blockedWrites: 0, draftUsage: { today: 0, week: 0, dailyLimit: 0, weeklyLimit: 0 },
  };
  constructor(private readonly repo: WorkspaceRepository, private readonly draftProposal?: ((input: DraftingInput) => Promise<DraftingOutput>) | undefined) {}
  get busy() { return false; }
  get draftsInProgress() { return this.current.draftsInProgress; }
  liveState() { return this.current; }
  private async settings(): Promise<ProjectsCoIdSettings> { return projectsCoIdSettingsSchema.parse((await this.repo.getPolicy()).projectsCoId ?? PROJECTS_CO_ID_DEFAULTS); }
  async status(): Promise<ProjectsCoIdStatus> {
    const policy = await this.repo.getPolicy(); const settings = await this.settings(); const [projects, usage] = await Promise.all([
      this.repo.listProjects(), this.repo.bidUsage(new Date(), policy.timezone, 'projects_co_id.draft_created'),
    ]);
    return this.current = { ...this.current, mode: settings.mode, projectCount: projects.filter(p => p.source === 'projects_co_id').length,
      readyDrafts: projects.filter(p => p.source === 'projects_co_id' && p.pipelineStatus === 'draft_ready').length,
      draftUsage: { ...usage, dailyLimit: settings.dailyBidLimit, weeklyLimit: settings.weeklyBidLimit },
      reason: 'Pemindaian projects.co.id dinonaktifkan; hanya proyek tersimpan, draf lokal, dan aksi pemilik tersedia.' };
  }
  async restore() { await this.status(); }
  async setMode(mode: ProjectsCoIdSettings['mode']) {
    const previous = await this.repo.getPolicy(); const settings = await this.settings();
    const next = { ...previous, version: previous.version + 1, projectsCoId: { ...settings, mode: 'off' as const } };
    if (!await this.repo.savePolicyIfVersion(next, previous.version)) throw new Error('Kebijakan berubah. Muat ulang sebelum menyimpan.');
    await this.repo.appendAudit({ type: 'projects_co_id.mode_changed', resourceId: 'projects_co_id', status: 'recorded', reason: `Mode ${mode} tidak tersedia karena pemindaian browser dihapus. ${PROJECTS_CO_ID_AUTO_REASON}`, policyVersion: next.version, payloadHash: null });
  }
  async drafts() {
    const [drafts, history, skips, wins, projects] = await Promise.all([this.repo.latestDrafts(), this.repo.listAuditForType('projects_co_id.owner_marked_sent', 1000), this.repo.listAuditForType('projects_co_id.owner_skipped', 1000), this.repo.listAuditForType('projects_co_id.owner_marked_won', 1000), this.repo.listProjects()]);
    return projects.filter(p => p.source === 'projects_co_id').map(project => ({ ...project, latestDraft: drafts.get(project.id) ?? null, url: PROJECTS_CO_ID_ORIGIN + projectsCoIdPath(project), ownerActionAt: [...wins, ...history, ...skips].find(e => e.resourceId === project.id)?.createdAt ?? null })).sort((a, b) => b.score - a.score);
  }
  async createDraft(id: string) {
    const project = await this.repo.getProject(id); if (!project || project.source !== 'projects_co_id') throw new Error('Peluang projects.co.id tidak ditemukan.');
    if (project.status !== 'open' || await this.repo.getLatestDraft(id)) throw new Error('Draf sudah tersedia atau proyek sudah diproses.');
    const policy = await this.repo.getPolicy(); const settings = await this.settings(); const profile = await this.repo.getProfile();
    const bid = chooseProjectsCoIdBid(project, settings); const decision = bid && evaluatePolicy({ policy: projectsCoIdDraftPolicy(policy), project, action: 'bid.submit', capability: 'unknown', executionMode: 'simulated', confidence: scoreProject(project, profile.specializations).score / 100, proposedPrice: bid.amount, dailyUsed: 0, weeklyUsed: 0, now: new Date() });
    if (!bid || !decision?.allowed) throw new Error('Draf ditolak kebijakan atau anggaran.');
    const score = scoreProject(project, profile.specializations).score; const template = `Saya tertarik membantu kebutuhan yang dijelaskan dalam brief proyek ini. Saya akan mengonfirmasi alur dan kriteria selesai, mengimplementasikan kebutuhan yang disepakati, lalu menguji dan menyerahkan hasil beserta panduan penggunaan. Harga Rp${bid.amount.toLocaleString('id-ID')} dengan estimasi ${bid.period} hari untuk lingkup yang disepakati.`;
    let proposal = template; let evidence: BidDraft['evidence'] = []; let assumptions = ['Template dari brief; tidak menambahkan klaim pengalaman.']; let author: BidDraft['author'] = 'template';
    try {
      if (!this.draftProposal) throw new Error('Hermes tidak tersedia.');
      const knowledge = (await this.repo.searchKnowledge(`${project.title} ${project.skills.join(' ')}`, 4)).map(k => ({ label: k.path, source: k.url, content: k.content }));
      this.current.draftsInProgress = 1;
      const output = proposalDraftOutputSchema.parse(await this.draftProposal({ project, profileFacts: profile.facts, score, profileRate: { min: settings.minPrice, max: settings.maxPrice }, evidence: knowledge, fixedBid: { amount: bid.amount, currency: 'IDR', durationDays: bid.period } }));
      if (output.proposedPrice !== bid.amount || output.durationDays !== bid.period || !validProjectsCoIdProposal(output.proposal, bid.amount, bid.period)) throw new Error('Proposal guard gagal.');
      proposal = output.proposal; evidence = output.evidence; assumptions = output.assumptions; author = 'hermes';
    } catch { await this.repo.appendAudit({ type: 'autopilot.draft_fallback', resourceId: id, status: 'recorded', reason: 'Hermes tidak tersedia atau proposal tidak memenuhi guard; template digunakan.', policyVersion: policy.version, payloadHash: null }); }
    this.current.draftsInProgress = 0;
    return this.repo.createProjectsCoIdDraft({ id: createId('draft'), projectId: id, proposal, proposedPrice: bid.amount, durationDays: bid.period, currency: 'IDR', confidence: score / 100, evidence, assumptions, status: 'draft_ready', createdAt: new Date().toISOString(), author }, policy.version, false);
  }
  async ownerAction(id: string, action: 'mark-sent' | 'skip' | 'won') { await this.repo.markProjectsCoIdProject(id, action); }
  async close() { return undefined; }
}
