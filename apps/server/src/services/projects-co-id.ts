import { chooseProjectsCoIdBid, evaluatePolicy, projectsCoIdDraftPolicy, PROJECTS_CO_ID_DEFAULTS, scoreProject, type BidDraft, type ProjectOpportunity, type ProjectsCoIdSettings } from '@fvh/domain';
import { projectsCoIdSettingsSchema, proposalDraftOutputSchema } from '@fvh/contracts';
import { createId, type DraftingInput, type DraftingOutput } from '@fvh/application';
import type { WorkspaceRepository } from '@fvh/persistence';
import { validProjectsCoIdProposal, parseProjectsCoIdProject, projectsCoIdPath, PROJECTS_CO_ID_ORIGIN, PROJECTS_CO_ID_AUTO_REASON, type ProjectsCoIdListing, type ProjectsCoIdStatus } from '../models/projects-co-id-types.js';

export class ProjectsCoIdService {
  private current: ProjectsCoIdStatus = {
    mode: 'scan-only', state: 'stopped', busy: false,
    reason: 'Pemindaian projects.co.id read-only siap dijalankan; penawaran tidak dikirim aplikasi.',
    username: null, remaining: null, checkedAt: null, pageStatus: null, lastScanAt: null, lastResult: null,
    lastSearchTerms: [], searchTerms: [], autoAvailable: false, draftsInProgress: 0, projectCount: 0, readyDrafts: 0,
    blockedWrites: 0, draftUsage: { today: 0, week: 0, dailyLimit: 0, weeklyLimit: 0 },
  };
  constructor(private readonly repo: WorkspaceRepository, private readonly draftProposal?: ((input: DraftingInput) => Promise<DraftingOutput>) | undefined, private readonly fetcher: typeof fetch = fetch) {}
  get busy() { return this.current.busy; }
  get draftsInProgress() { return this.current.draftsInProgress; }
  liveState() { return this.current; }
  private async settings(): Promise<ProjectsCoIdSettings> { return projectsCoIdSettingsSchema.parse((await this.repo.getPolicy()).projectsCoId ?? PROJECTS_CO_ID_DEFAULTS); }
  private async readOnlyFetch(path: string, fetcher: typeof fetch = this.fetcher): Promise<{ status: number; html: string }> {
    const url = new URL(path, PROJECTS_CO_ID_ORIGIN);
    if (url.origin !== PROJECTS_CO_ID_ORIGIN || !url.pathname.startsWith('/public/')) throw new Error('URL projects.co.id tidak diizinkan.');
    const response = await fetcher(url, { method: 'GET', redirect: 'manual', headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(30_000) });
    if (response.status >= 300 && response.status < 400) throw new Error('projects.co.id mengarahkan ke URL lain; hasil tidak disimpan.');
    return { status: response.status, html: await response.text() };
  }
  private parseListings(html: string): ProjectsCoIdListing[] {
    const rows = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
    const strip = (value: string) => value.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<\/(?:p|div|li|br|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\r?\n[ \t]+/g, '\n').replace(/[ \t]+/g, ' ').trim();
    return rows.map(row => {
      const block = row[0] ?? '';
      const href = block.match(/href=["']([^"']+)["']/i)?.[1] ?? '';
      const text = strip(block + (html.slice((row.index ?? 0), (row.index ?? 0) + 5000)));
      const title = strip(row[1] ?? '');
      return { href: new URL(href, PROJECTS_CO_ID_ORIGIN).toString(), title, description: title, clientName: 'Tidak tersedia', skills: [], text };
    });
  }
  async scan(): Promise<ProjectsCoIdStatus> {
    if (this.current.busy) throw new Error('Pemindaian sedang berjalan.');
    const policy = await this.repo.getPolicy();
    const settings = await this.settings();
    if (policy.state === 'paused') throw new Error('Automasi dijeda melalui kill switch.');
    if (settings.mode === 'off') throw new Error('Pemindaian projects.co.id dinonaktifkan dalam Kebijakan.');
    this.current = { ...this.current, mode: settings.mode, state: 'scanning', busy: true, reason: 'Membaca listing projects.co.id tanpa request tulis.' };
    try {
      const imports: ProjectOpportunity[] = [];
      for (const page of [1, 2, 3]) {
        const result = await this.readOnlyFetch(`/public/browse_projects/listing?page=${page}`, this.fetcher);
        if (result.status !== 200) throw new Error(`projects.co.id merespons HTTP ${result.status}.`);
        const parsed = this.parseListings(result.html).map(item => parseProjectsCoIdProject(item, new Date())).filter((item): item is ProjectOpportunity => Boolean(item));
        if (!parsed.length) break;
        imports.push(...parsed);
        if (parsed.length < 10) break;
      }
      const unique = [...new Map(imports.map(project => [project.id, project])).values()];
      await this.repo.syncProjects(unique);
      const profile = await this.repo.getProfile();
      await this.repo.evaluateProjects(unique.map(project => ({ id: project.id, ...scoreProject(project, profile.specializations) })));
      const at = new Date().toISOString();
      await this.repo.appendAudit({ type: 'projects_co_id.scan_completed', resourceId: 'projects_co_id', status: 'recorded', reason: `${unique.length} peluang dibaca melalui GET read-only; tidak ada bid dikirim.`, policyVersion: policy.version, payloadHash: null });
      this.current = { ...this.current, state: 'ready', busy: false, checkedAt: at, lastScanAt: at, lastResult: { imported: unique.length, at }, reason: `${unique.length} peluang tersimpan. ${PROJECTS_CO_ID_AUTO_REASON}` };
      return this.status();
    } catch (error) {
      this.current = { ...this.current, state: 'error', busy: false, reason: error instanceof Error ? error.message : 'Pemindaian gagal.' };
      await this.repo.appendAudit({ type: 'projects_co_id.scan_failed', resourceId: 'projects_co_id', status: 'failed', reason: this.current.reason, policyVersion: policy.version, payloadHash: null });
      throw error;
    }
  }
  async status(): Promise<ProjectsCoIdStatus> {
    const policy = await this.repo.getPolicy(); const settings = await this.settings(); const [projects, usage] = await Promise.all([
      this.repo.listProjects(), this.repo.bidUsage(new Date(), policy.timezone, 'projects_co_id.draft_created'),
    ]);
    // Automatic drafting is removed; a stored `drafts` mode must not claim drafting is available.
    const mode = settings.mode === 'drafts' ? 'scan-only' : settings.mode;
    return this.current = { ...this.current, mode, projectCount: projects.filter(p => p.source === 'projects_co_id').length,
      readyDrafts: projects.filter(p => p.source === 'projects_co_id' && p.pipelineStatus === 'draft_ready').length,
      draftUsage: { ...usage, dailyLimit: settings.dailyBidLimit, weeklyLimit: settings.weeklyBidLimit },
      reason: settings.mode === 'off' ? 'Pemindaian projects.co.id dinonaktifkan dalam Kebijakan.' : 'Pemindaian projects.co.id read-only aktif; penawaran dikirim sendiri oleh pemilik di situs.' };
  }
  async restore() { await this.status(); }
  async setMode(mode: ProjectsCoIdSettings['mode']) {
    const previous = await this.repo.getPolicy(); const settings = await this.settings();
    if (mode === 'drafts') throw new Error('Mode drafts otomatis dinonaktifkan; gunakan scan-only untuk membaca listing.');
    const next = { ...previous, version: previous.version + 1, projectsCoId: { ...settings, mode } };
    if (!await this.repo.savePolicyIfVersion(next, previous.version)) throw new Error('Kebijakan berubah. Muat ulang sebelum menyimpan.');
    await this.repo.appendAudit({ type: 'projects_co_id.mode_changed', resourceId: 'projects_co_id', status: 'recorded', reason: `Mode ${mode} disimpan. ${PROJECTS_CO_ID_AUTO_REASON}`, policyVersion: next.version, payloadHash: null });
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
