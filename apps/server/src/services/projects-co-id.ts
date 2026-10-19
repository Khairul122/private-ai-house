import { chooseProjectsCoIdBid, evaluatePolicy, projectsCoIdDraftPolicy, projectsCoIdSearchTerms, PROJECTS_CO_ID_DEFAULTS, scoreProject, type BidDraft, type ProjectOpportunity, type ProjectsCoIdSettings } from '@fvh/domain';
import { projectsCoIdSettingsSchema, proposalDraftOutputSchema } from '@fvh/contracts';
import { createId, type DraftingInput, type DraftingOutput } from '@fvh/application';
import type { WorkspaceRepository } from '@fvh/persistence';
import { connectExistingChrome, type BrowserBidConnection } from './browser-bidding.js';
import { BrowserBidError } from '../models/browser-bid-types.js';
import { ProjectsCoIdPage } from '../lib/projects-co-id-page.js';
import { validProjectsCoIdProposal, projectsCoIdPath, PROJECTS_CO_ID_ORIGIN, PROJECTS_CO_ID_AUTO_REASON, type ProjectsCoIdStatus } from '../models/projects-co-id-types.js';

const BLOCKED_AUDIT_WINDOW_MS = 10 * 60_000;

export class ProjectsCoIdService {
  private connection: BrowserBidConnection | null = null;
  private driver: ProjectsCoIdPage | null = null;
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastAttempt = 0;
  private searchCursor = 0;
  private current: ProjectsCoIdStatus = { mode: 'scan-only', state: 'stopped', busy: false, reason: 'Hubungkan Chrome berprofil Anda untuk memindai.', username: null, remaining: null, checkedAt: null, pageStatus: null, lastScanAt: null, lastResult: null, lastSearchTerms: [], searchTerms: [], autoAvailable: false, draftsInProgress: 0, projectCount: 0, readyDrafts: 0, blockedWrites: 0, draftUsage: { today: 0, week: 0, dailyLimit: 4, weeklyLimit: 12 } };
  constructor(private repo: WorkspaceRepository, private connect = connectExistingChrome, private origin?: string, private draftProposal?: ((input: DraftingInput) => Promise<DraftingOutput>) | undefined) {}
  // The site's own background POSTs (analytics, beacons) hit the read-only gate every few seconds;
  // the live count is in status(), so Aktivitas gets one summary per window instead of a row per request.
  private blockedSinceAudit = 0;
  private blockedAuditAt = Number.NEGATIVE_INFINITY;
  private recordBlockedWrite(now = Date.now()) {
    this.blockedSinceAudit++;
    if (now - this.blockedAuditAt < BLOCKED_AUDIT_WINDOW_MS) return;
    const count = this.blockedSinceAudit;
    this.blockedSinceAudit = 0; this.blockedAuditAt = now;
    void this.repo.appendAudit({ type: 'projects_co_id.write_blocked', resourceId: 'projects_co_id', status: 'blocked', reason: `${count} request tulis pada tab worker dibatalkan oleh gate read-only sejak catatan terakhir.`, policyVersion: null, payloadHash: null }).catch(() => undefined);
  }
  get busy() { return this.current.busy; }
  get draftsInProgress() { return this.current.draftsInProgress; }
  private async settings(): Promise<ProjectsCoIdSettings> {
    return projectsCoIdSettingsSchema.parse((await this.repo.getPolicy()).projectsCoId ?? PROJECTS_CO_ID_DEFAULTS);
  }
  async status(): Promise<ProjectsCoIdStatus> {
    const policy = await this.repo.getPolicy();
    const settings = projectsCoIdSettingsSchema.parse(policy.projectsCoId ?? PROJECTS_CO_ID_DEFAULTS);
    const mode = settings.mode;
    const [projects, usage, profile] = await Promise.all([this.repo.listProjects(), this.repo.bidUsage(new Date(), policy.timezone, 'projects_co_id.draft_created'), this.repo.getProfile()]);
    this.current = { ...this.current, searchTerms: projectsCoIdSearchTerms(settings, profile.specializations), blockedWrites: this.driver?.blockedWrites ?? this.current.blockedWrites, projectCount: projects.filter(p => p.source === 'projects_co_id').length, readyDrafts: projects.filter(p => p.source === 'projects_co_id' && p.pipelineStatus === 'draft_ready').length, draftUsage: { ...usage, dailyLimit: settings.dailyBidLimit, weeklyLimit: settings.weeklyBidLimit } };
    if (policy.state === 'paused') return { ...this.current, mode, state: 'paused', reason: 'Automasi dijeda melalui kill switch.' };
    if (mode === 'off') return { ...this.current, mode, state: 'stopped', reason: 'Worker projects.co.id dinonaktifkan.' };
    if (this.current.state === 'ready' && Date.now() - Date.parse(this.current.checkedAt ?? '') > 90_000) return { ...this.current, mode, state: 'error', reason: 'Pemeriksaan akun sudah lama. Periksa kembali.' };
    return { ...this.current, mode };
  }
  async restore() {
    if (this.timer) return;
    this.current.lastScanAt = (await this.repo.listAuditForType('projects_co_id.scan_completed', 1))[0]?.createdAt ?? null;
    this.timer = setInterval(() => { void this.tick().catch(() => undefined); }, 60_000);
    this.timer.unref?.();
  }
  private async tick() {
    if (!this.driver || this.current.busy) return;
    if ((await this.repo.getPolicy()).state === 'paused' || (await this.settings()).mode === 'off') return;
    if (this.current.state === 'paused') { await this.check(); return; }
    if (this.current.state !== 'ready') return;
    if (Date.now() - this.lastAttempt >= 30 * 60_000) await this.scan();
    else await this.check();
  }
  async setMode(mode: ProjectsCoIdSettings['mode']) {
    if (this.current.busy) throw new Error('Tunggu pekerjaan worker selesai.');
    const previous = await this.repo.getPolicy();
    const settings = projectsCoIdSettingsSchema.parse(previous.projectsCoId ?? PROJECTS_CO_ID_DEFAULTS);
    const next = { ...previous, version: previous.version + 1, projectsCoId: { ...settings, mode } };
    projectsCoIdSettingsSchema.parse(next.projectsCoId);
    if (!await this.repo.savePolicyIfVersion(next, previous.version)) throw new Error('Kebijakan berubah. Muat ulang sebelum menyimpan.');
    await this.repo.appendAudit({ type: 'projects_co_id.mode_changed', resourceId: 'projects_co_id', status: 'recorded', reason: `Pemilik memilih ${mode}. ${PROJECTS_CO_ID_AUTO_REASON}`, policyVersion: next.version, payloadHash: null });
  }
  private async authorize(generation: number, username?: string) {
    if (generation !== this.generation) throw new BrowserBidError('stopped', 'Sambungan worker dilepas.');
    const policy = await this.repo.getPolicy();
    const settings = await this.settings();
    if (policy.state === 'paused') throw new BrowserBidError('paused', 'Automasi dijeda melalui kill switch.');
    if (settings.mode === 'off') throw new BrowserBidError('stopped', 'Worker projects.co.id dinonaktifkan.');
    if (username && settings.username.toLowerCase() !== username.toLowerCase()) throw new BrowserBidError('account_mismatch', 'Username kebijakan berubah. Periksa akun kembali.');
  }
  async open() {
    if (this.current.busy) throw new Error('Worker sedang bekerja.');
    if (this.connection) return this.check();
    const generation = ++this.generation;
    this.current = { ...this.current, state: 'opening', busy: true, reason: 'Meminta izin sambungan Chrome yang sedang berjalan.' };
    try {
      await this.authorize(generation);
      const connection = await this.connect();
      if (generation !== this.generation) { await connection.disconnect(); return; }
      this.connection = connection;
      connection.page.setDefaultTimeout(10_000);
      this.driver = new ProjectsCoIdPage(connection.page, this.origin, () => this.recordBlockedWrite());
      await this.driver.protect();
      connection.onDisconnect(() => { if (this.connection === connection) void this.close(); });
      await this.restore();
    } catch (error) { this.fail(generation, error); }
    finally { if (generation === this.generation) this.current.busy = false; }
    if (this.connection) await this.check();
  }
  private fail(generation: number, error?: unknown) {
    if (generation !== this.generation) return;
    const known = error instanceof BrowserBidError ? error : null;
    const state = known && ['paused', 'stopped', 'challenge', 'account_mismatch', 'login_required'].includes(known.code) ? known.code as 'paused' | 'stopped' | 'challenge' | 'account_mismatch' | 'login_required' : 'error';
    this.current = { ...this.current, state, username: null, remaining: null, checkedAt: null, pageStatus: null, reason: known?.message ?? 'Chrome atau halaman projects.co.id belum dapat diperiksa. Periksa izin debugging dan tab worker.' };
  }
  async check() {
    if (this.current.busy) throw new Error('Worker sedang bekerja.');
    const generation = this.generation;
    this.current = { ...this.current, state: 'checking', busy: true, reason: 'Memeriksa akun projects.co.id.' };
    try { await this.inspect(generation); }
    finally { if (generation === this.generation) this.current.busy = false; }
  }
  private async inspect(generation: number) {
    try {
      await this.authorize(generation);
      if (!this.driver) throw new BrowserBidError('stopped', 'Hubungkan Chrome terlebih dahulu.');
      const settings = await this.settings();
      const observed = await this.driver.inspect();
      await this.authorize(generation, settings.username);
      this.current = { ...this.current, ...observed };
      if (observed.challenge) { this.current.state = 'challenge'; this.current.reason = 'Verifikasi Cloudflare muncul. Buka projects.co.id di tab Chrome biasa (bukan tab worker, yang memblokir request tulis), selesaikan verifikasi dan login di sana, lalu Periksa akun.'; }
      else if (!observed.username && observed.pageStatus === 200) { this.current.state = 'login_required'; this.current.reason = 'Login manual di tab projects.co.id lain pada profil Chrome yang sama, lalu Periksa akun. Tab pemindaian memblokir request tulis.'; }
      else if (observed.pageStatus !== 200) { throw new BrowserBidError('http', 'Halaman akun tidak tersedia.'); }
      else if (observed.username?.toLowerCase() !== settings.username.toLowerCase()) { this.current.state = 'account_mismatch'; this.current.reason = 'Akun browser berbeda dari username di Kebijakan.'; }
      else { this.current.state = 'ready'; this.current.reason = 'Akun cocok; siap memindai dan menyiapkan draf lokal. Penawaran dikirim sendiri di situs.'; }
    } catch (error) { this.fail(generation, error); }
  }
  async scan() {
    if (this.current.busy) throw new Error('Worker sedang bekerja.');
    const generation = this.generation;
    this.current = { ...this.current, state: 'scanning', busy: true, reason: 'Membaca maksimum tiga halaman proyek, tanpa request tulis.' };
    try {
      await this.authorize(generation);
      if (!this.driver) throw new BrowserBidError('stopped', 'Hubungkan Chrome terlebih dahulu.');
      await this.inspect(generation);
      if (this.current.state !== 'ready') throw new BrowserBidError(this.current.state, this.current.reason);
      this.lastAttempt = Date.now();
      this.current.state = 'scanning'; this.current.reason = 'Membaca maksimum tiga halaman proyek, tanpa request tulis.';
      const settings = await this.settings();
      const profile = await this.repo.getProfile();
      const terms = projectsCoIdSearchTerms(settings, profile.specializations);
      // Three navigations per scan keep the site load unchanged; the cursor walks the remaining terms on later scans.
      const searches = terms.length <= 3 ? terms : [0, 1, 2].map(offset => terms[(this.searchCursor + offset) % terms.length]!);
      this.searchCursor = terms.length ? (this.searchCursor + searches.length) % terms.length : 0;
      const projects = await this.driver.listOpenProjects(settings.username, () => this.authorize(generation, settings.username), searches);
      await this.authorize(generation, settings.username);
      await this.repo.syncProjects(projects);
      await this.repo.evaluateProjects(projects.map(project => ({ id: project.id, ...scoreProject(project, profile.specializations) })));
      if (settings.mode === 'drafts') {
        const drafts = await this.repo.latestDrafts();
        for (const project of projects.map(p => ({ ...p, ...scoreProject(p, profile.specializations) })).sort((a, b) => b.score - a.score)) {
          await this.authorize(generation, settings.username);
          if ((await this.settings()).mode !== 'drafts') break;
          if (!drafts.has(project.id)) await this.makeDraft(project.id, true, generation);
        }
      }
      await this.repo.appendAudit({ type: 'projects_co_id.scan_completed', resourceId: 'projects_co_id', status: 'recorded', reason: `${projects.length} peluang dibaca${searches.length ? ` dari pencarian ${searches.join(', ')}` : ' dari daftar terbaru'}; tidak ada bid dikirim.`, policyVersion: (await this.repo.getPolicy()).version, payloadHash: null });
      if (generation !== this.generation) return;
      const at = new Date().toISOString();
      this.current = { ...this.current, state: 'ready', checkedAt: at, lastScanAt: at, lastResult: { imported: projects.length, at }, lastSearchTerms: searches, reason: `${projects.length} peluang tersimpan. ${PROJECTS_CO_ID_AUTO_REASON}` };
    } catch (error) {
      this.fail(generation, error);
      await this.repo.appendAudit({ type: 'projects_co_id.scan_failed', resourceId: 'projects_co_id', status: 'failed', reason: error instanceof BrowserBidError ? error.message : 'Pemindaian gagal; hasil belum dapat dipastikan.', policyVersion: null, payloadHash: null });
      throw new Error(this.current.reason, { cause: error });
    } finally { if (generation === this.generation) this.current.busy = false; }
  }
  async drafts() {
    const [drafts, history, skips, wins, projects] = await Promise.all([this.repo.latestDrafts(), this.repo.listAuditForType('projects_co_id.owner_marked_sent', 1000), this.repo.listAuditForType('projects_co_id.owner_skipped', 1000), this.repo.listAuditForType('projects_co_id.owner_marked_won', 1000), this.repo.listProjects()]);
    return projects.filter(p => p.source === 'projects_co_id').map(project => ({
      ...project, latestDraft: drafts.get(project.id) ?? null,
      url: PROJECTS_CO_ID_ORIGIN + projectsCoIdPath(project),
      ownerActionAt: [...wins, ...history, ...skips].find(e => e.resourceId === project.id)?.createdAt ?? null,
    })).sort((a, b) => b.score - a.score);
  }
  async createDraft(id: string) {
    if (this.current.busy) throw new Error('Worker sedang bekerja.');
    const generation = this.generation;
    this.current.busy = true;
    try {
      await this.inspect(generation);
      if (this.current.state !== 'ready') throw new Error(this.current.reason);
      const draft = await this.makeDraft(id, false, generation);
      if (!draft) throw new Error('Draf ditolak kebijakan, sudah tersedia, atau proyek sudah diproses. Lihat Aktivitas.');
      if (generation === this.generation) { this.current.state = 'ready'; this.current.reason = 'Draf lokal siap ditinjau dan disalin.'; }
      return draft;
    } catch (error) { if (generation === this.generation) { this.fail(generation, error); } throw error; }
    finally { if (generation === this.generation) { this.current.busy = false; this.current.draftsInProgress = 0; } }
  }
  private async makeDraft(id: string, automatic: boolean, generation: number): Promise<BidDraft | null> {
    await this.authorize(generation);
    let project = await this.repo.getProject(id);
    if (!project || project.source !== 'projects_co_id') throw new Error('Peluang projects.co.id tidak ditemukan.');
    const stored = (await this.repo.listProjects()).find(p => p.id === id)!;
    if (!['new', 'scored'].includes(stored.pipelineStatus) || await this.repo.getLatestDraft(id)) return null;
    const policy = await this.repo.getPolicy();
    const settings = await this.settings();
    if (automatic && settings.mode !== 'drafts') return null;
    const usage = await this.repo.bidUsage(new Date(), policy.timezone, 'projects_co_id.draft_created');
    const profile = await this.repo.getProfile();
    const eligible = (candidate: ProjectOpportunity) => {
      const bid = chooseProjectsCoIdBid(candidate, settings);
      return bid && evaluatePolicy({ policy: projectsCoIdDraftPolicy(policy), project: candidate, action: 'bid.submit', capability: 'unknown', executionMode: 'simulated', confidence: scoreProject(candidate, profile.specializations).score / 100, proposedPrice: bid.amount, dailyUsed: automatic ? usage.today : 0, weeklyUsed: automatic ? usage.week : 0, now: new Date() });
    };
    // Avoid detail requests and Hermes calls for candidates already blocked by policy or quota.
    let decision = eligible(project);
    if (decision?.allowed && this.driver) {
      project = await this.driver.readProject(project, settings.username, () => this.authorize(generation, settings.username));
      await this.repo.syncProjects([project]);
      await this.repo.evaluateProjects([{ id, ...scoreProject(project, profile.specializations) }]);
      decision = eligible(project);
    }
    if (!decision?.allowed) {
      await this.repo.appendAudit({ type: 'projects_co_id.draft_skipped', resourceId: id, status: 'blocked', reason: decision?.reason ?? 'Anggaran tidak memenuhi batas harga IDR.', policyVersion: policy.version, payloadHash: null });
      return null;
    }
    const bid = chooseProjectsCoIdBid(project, settings)!;
    await this.authorize(generation, settings.username);
    const score = scoreProject(project, profile.specializations).score;
    const template = `Saya tertarik membantu kebutuhan yang dijelaskan dalam brief proyek ini. Saya akan mengonfirmasi alur dan kriteria selesai, mengimplementasikan kebutuhan yang disepakati, lalu menguji dan menyerahkan hasil beserta panduan penggunaan. Harga Rp${bid.amount.toLocaleString('id-ID')} dengan estimasi ${bid.period} hari untuk lingkup yang disepakati. Apa prioritas utama dan akses yang tersedia untuk pekerjaan ini?`;
    let proposal = template;
    let evidence: BidDraft['evidence'] = [];
    let assumptions = ['Template dari brief; tidak menambahkan klaim pengalaman.'];
    let author: BidDraft['author'] = 'template';
    try {
      if (!this.draftProposal) throw new Error('Hermes tidak tersedia.');
      const knowledge = (await this.repo.searchKnowledge(`${project.title} ${project.skills.join(' ')}`, 4)).map(k => ({ label: k.path, source: k.url, content: k.content }));
      this.current.state = 'drafting'; this.current.draftsInProgress = 1; this.current.reason = 'Hermes sedang menulis proposal Bahasa Indonesia; biasanya 40–95 detik.';
      const output = proposalDraftOutputSchema.parse(await this.draftProposal({ project, profileFacts: profile.facts, score, profileRate: { min: settings.minPrice, max: settings.maxPrice }, evidence: knowledge, fixedBid: { amount: bid.amount, currency: 'IDR', durationDays: bid.period } }));
      if (output.proposedPrice !== bid.amount || output.durationDays !== bid.period || !validProjectsCoIdProposal(output.proposal, bid.amount, bid.period)) throw new Error('Proposal tidak memenuhi guard harga/durasi/batas panjang.');
      proposal = output.proposal; evidence = output.evidence; assumptions = output.assumptions; author = 'hermes';
    } catch {
      await this.repo.appendAudit({ type: 'autopilot.draft_fallback', resourceId: id, status: 'recorded', reason: 'Hermes tidak tersedia atau proposal tidak memenuhi guard IDR/durasi; template Bahasa Indonesia digunakan.', policyVersion: policy.version, payloadHash: null });
    } finally { if (generation === this.generation) this.current.draftsInProgress = 0; }
    await this.authorize(generation, settings.username);
    const draft: BidDraft = { id: createId('draft'), projectId: id, proposal, proposedPrice: bid.amount, durationDays: bid.period, currency: 'IDR', confidence: score / 100, evidence, assumptions, status: 'draft_ready', createdAt: new Date().toISOString(), author };
    const saved = await this.repo.createProjectsCoIdDraft(draft, policy.version, automatic);
    if (generation === this.generation) this.current.state = 'scanning';
    return saved;
  }
  async ownerAction(id: string, action: 'mark-sent' | 'skip' | 'won') { await this.repo.markProjectsCoIdProject(id, action); }
  async close() {
    this.generation++;
    if (this.timer) clearInterval(this.timer); this.timer = undefined;
    const connection = this.connection; this.connection = null; this.driver = null;
    this.current = { ...this.current, state: 'stopped', busy: false, draftsInProgress: 0, username: null, remaining: null, checkedAt: null, pageStatus: null, reason: 'Worker dilepas. Chrome dan tab pemilik tetap terbuka.' };
    await connection?.disconnect().catch(() => undefined);
  }
}
