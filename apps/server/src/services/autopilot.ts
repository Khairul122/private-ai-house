import { evaluatePolicy, policySchedule, scoreProject, selectSearchTerms } from '@fvh/domain';
import type { AutonomyPolicy, BidDraft, ProjectOpportunity } from '@fvh/domain';
import type { FreelancerProfile, FreelancerWriteResult } from '@fvh/adapter-freelancer';
import { createId, hashPayload, type AiDraftingPort } from '@fvh/application';
import type { WorkspaceRepository, ServiceProfile } from '@fvh/persistence';
import type { BrowserBidInput } from '../models/browser-bid-types.js';

type AutopilotDependencies = {
  repository: WorkspaceRepository;
  readProfile: () => Promise<FreelancerProfile>;
  readProjects: (query: string, limit: number) => Promise<{ projects: ProjectOpportunity[]; skipped: number }>;
  /** Active projects in the given Freelancer job IDs updated after `fromTime` (epoch seconds). */
  readProjectsByJobs?: (jobIds: number[], fromTime: number, limit: number) => Promise<{ projects: ProjectOpportunity[]; skipped: number }>;
  syncProfileJobs?: (jobIds: number[]) => Promise<FreelancerWriteResult>;
  submitBid: (input: { operation: 'submit_bid'; projectId: number; amount: number; period: number; milestonePercentage: number; description: string }) => Promise<FreelancerWriteResult>;
  guardedSubmitBid?: (input: BrowserBidInput, authorize: () => Promise<void>) => Promise<FreelancerWriteResult>;
  bidTransportReady?: () => { ready: boolean; reason: string };
  /** Hermes drafting; when absent or failing, the built-in template writes the proposal. */
  draftProposal?: AiDraftingPort['draftBid'];
  publicPortfolio?: (evidence:Parameters<AiDraftingPort['draftBid']>[0]['evidence'])=>Promise<Array<{label:string;url:string}>>;
  now?: () => Date;
  intervalMs?: number;
};

export type AutopilotStatus = {
  state: 'starting' | 'running' | 'paused' | 'blocked' | 'error';
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastMessage: string;
  lastImported: number;
  lastSubmitted: number;
  specializations: string[];
  cycleInProgress: boolean;
  draftsInProgress: number;
  intervalMinutes: number;
  searchTerms: string[];
  /** Profile jobs searched by ID this cycle (one request covers all of them). */
  searchJobs: string[];
  summary: { considered: number; eligible: number; reasons: Record<string, number> } | null;
  waitingReason: string | null;
  marketplaceNotice: { at: string; quotaExhausted: boolean; reason: string; retryAt: string | null } | null;
};

const dayMs = 24 * 60 * 60 * 1_000;
/** Keyword searches per cycle; terms rotate so every term is still searched over consecutive cycles. */
const KEYWORD_SEARCHES_PER_CYCLE = 2;
const MAX_BACKOFF = 8;

function rateLimited(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 429;
}

function matchedProfileJobs(profile: FreelancerProfile): Array<{ id: number; name: string }> {
  const description = profile.description?.toLocaleLowerCase() ?? '';
  if (!description) return [];
  return profile.jobs.filter((job) => job.name.length > 2 && description.includes(job.name.toLocaleLowerCase())).slice(0, 12);
}

function seedLocalProfile(remote: FreelancerProfile, jobs: Array<{ id: number; name: string }>, current: ServiceProfile): ServiceProfile {
  const facts = remote.description
    ? [{ label: 'Ringkasan publik Freelancer', value: remote.description.slice(0, 500), source: remote.profileUrl ?? 'Profil Freelancer akun sendiri' }]
    : [];
  if (remote.hourlyRate !== null) facts.push({ label: 'Tarif per jam di profil Freelancer', value: `${remote.currency ?? current.currency} ${remote.hourlyRate}`, source: remote.profileUrl ?? 'Profil Freelancer akun sendiri' });
  return {
    ...current,
    primaryField: current.primaryField || jobs[0]?.name || 'Freelancer',
    specializations: jobs.map((job) => job.name),
    currency: remote.currency ?? current.currency,
    minPrice: current.minPrice > 0 ? current.minPrice : 100,
    maxPrice: current.maxPrice >= current.minPrice && current.maxPrice > 0 ? current.maxPrice : 800,
    facts,
  };
}

function seedPolicy(policy: AutonomyPolicy, profile: ServiceProfile, now: Date, ownerEdited: boolean): AutonomyPolicy {
  const expiry = Date.parse(policy.expiresAt);
  // Once the owner saved the policy, restarts must not overwrite their limits with profile defaults.
  const limits = ownerEdited
    ? { keywords: policy.keywords, minPrice: policy.minPrice, maxPrice: policy.maxPrice, activeHours: policy.activeHours }
    : { keywords: [], minPrice: profile.minPrice, maxPrice: profile.maxPrice, activeHours: { start: 0, end: 24 } };
  return {
    ...policy,
    version: policy.version + 1,
    state: 'active',
    expiresAt: Number.isFinite(expiry) && expiry > now.getTime() ? policy.expiresAt : new Date(now.getTime() + 30 * dayMs).toISOString(),
    allowedActions: ['bid.submit'],
    primaryField: profile.primaryField,
    specializations: profile.specializations,
    ...limits,
    simulationOnly: false,
    allowUnknownDeadline: ownerEdited ? policy.allowUnknownDeadline ?? false : true,
  };
}

export function localDateKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function mondayKey(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function proposalFor(project: ProjectOpportunity, specialties: string[], price: number, durationDays: number, portfolio:Array<{label:string;url:string}>=[]): string {
  const country = project.clientCountry?.trim().toLocaleLowerCase() ?? '';
  const isIndonesianClient = country === 'id' || country === 'idn' || country.includes('indonesia');
  const matched = project.skills.filter((skill) => specialties.some((specialty) => specialty.toLocaleLowerCase() === skill.toLocaleLowerCase()));
  const skills=matched.slice(0,3).join(', ');
  const clientName = project.clientName && !['Klien Freelancer', 'Tidak tersedia'].includes(project.clientName) ? project.clientName : undefined;

  if (isIndonesianClient) {
    return [
      clientName ? `Halo ${clientName},` : 'Halo,',
      `Untuk “${project.title}”, saya mengusulkan implementasi bertahap agar hasilnya bisa Anda tinjau sebelum serah terima.${skills?` Keahlian profil yang sesuai: ${skills}.`:''}`,
      'Rencana pengerjaan:\n1. Konfirmasi alur utama, akses, dan kriteria penerimaan.\n2. Implementasikan ruang lingkup yang disepakati, lalu periksa alur utama dan penanganan kesalahan.\n3. Serahkan kode, petunjuk menjalankan, dan ringkasan hasil pemeriksaan.',
      ...(portfolio.length?[`Contoh kode publik yang relevan untuk ditinjau:\n${portfolio.map(p=>`${p.label}: ${p.url}`).join('\n')}`]:[]),
      `Penawaran ${project.currency} ${price} dengan estimasi ${durationDays} hari untuk cakupan yang disepakati. Alur atau hasil mana yang paling penting untuk Anda prioritaskan?`,
    ].join('\n\n').slice(0, 4_000);
  }

  return [
    clientName ? `Hello ${clientName},` : 'Hello,',
    `For “${project.title}”, I propose a staged implementation so you can review the result before handover.${skills?` Relevant skills from my profile: ${skills}.`:''}`,
    'My plan:\n1. Confirm the main workflow, required access, and acceptance criteria.\n2. Implement the agreed scope, then check the main paths and error handling.\n3. Deliver the code, setup instructions, and a summary of the checks performed.',
    ...(portfolio.length?[`Relevant public code for your review:\n${portfolio.map(p=>`${p.label}: ${p.url}`).join('\n')}`]:[]),
    `My bid is ${project.currency} ${price}, with an estimated delivery time of ${durationDays} days for the agreed scope. Which workflow or outcome should I prioritize for you?`,
  ].join('\n\n').slice(0, 4_000);
}

/** Currency amounts written in the text; any amount other than the policy price makes the Hermes text unusable. */
function mentionedAmounts(text: string): number[] {
  return [...text.matchAll(/(?:\$|USD|US\$|IDR|Rp|EUR|€)\s?(\d[\d.,]*)/gi)].map((match) => Number(match[1]!.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')));
}

function chooseBid(project: ProjectOpportunity, policy: AutonomyPolicy): { amount: number; period: number } | null {
  if (project.projectType !== 'fixed' || project.currency !== 'USD' || project.budgetMax <= 0) return null;
  const amount = Math.max(policy.minPrice, project.budgetMin > 0 ? project.budgetMin : policy.minPrice);
  if (amount > Math.min(policy.maxPrice, project.budgetMax)) return null;
  if (project.deadlineDays !== null && project.deadlineDays < 1) return null;
  return { amount: Math.round(amount * 100) / 100, period: project.deadlineDays === null ? 14 : Math.max(1, Math.min(project.deadlineDays, 14)) };
}

export class FreelancerAutopilot {
  private readonly now: () => Date;
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private searchCycle = 0;
  private starting = false;
  private stopping = false;
  private busy = false;
  private drafting = 0;
  /** Interval multiplier after HTTP 429 on a search; reset by a successful cycle. */
  private backoff = 1;
  private profileJobs: Array<{ id: number; name: string }> = [];
  private lastJobSearchAt: number | null = null;
  private status: AutopilotStatus = {
    state: 'starting', lastRunAt: null, nextRunAt: null, lastMessage: 'Membaca profil Freelancer untuk menyiapkan operasi otomatis.',
    lastImported: 0, lastSubmitted: 0, specializations: [], cycleInProgress: false, draftsInProgress: 0,
    intervalMinutes: 15, searchTerms: [], searchJobs: [], summary: null, waitingReason: null, marketplaceNotice: null,
  };

  private scheduleRetry(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.timer) clearInterval(this.timer);
      this.timer = undefined;
      void this.start();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  constructor(private readonly dependencies: AutopilotDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.intervalMs = dependencies.intervalMs ?? 15 * 60 * 1_000;
  }

  /** In-memory state only, cheap enough for the live change feed to sample; getStatus() also reads the database. */
  liveState() { return { status: this.status, busy: this.busy, drafting: this.drafting }; }

  async getStatus(): Promise<AutopilotStatus> {
    const policy = await this.dependencies.repository.getPolicy();
    const lastBid = (await this.dependencies.repository.listAuditForType('marketplace.production.submit_bid', 2)).find((event) => event.status === 'failed' || event.status === 'recorded');
    const quotaExhausted = lastBid?.status === 'failed' && lastBid.reason.includes('BID_LIMIT_EXCEEDED');
    const marketplaceNotice = lastBid?.status === 'failed' ? { at: lastBid.createdAt, quotaExhausted, reason: quotaExhausted ? 'Freelancer menolak bid terakhir karena kuota bid akun habis. Batas lokal tidak menambah kuota akun.' : lastBid.reason, retryAt: quotaExhausted ? new Date(Date.parse(lastBid.createdAt) + 60 * 60_000).toISOString() : null } : null;
    const expired = !Number.isFinite(Date.parse(policy.expiresAt)) || Date.parse(policy.expiresAt) <= this.now().getTime();
    const state = policy.state === 'paused' ? 'paused' : policy.state !== 'active' || policy.simulationOnly || expired || !policy.allowedActions.includes('bid.submit') ? 'blocked' : this.status.state;
    let waitingReason = policy.state === 'paused' ? 'Automasi dijeda oleh pemilik.' : expired ? 'Masa berlaku kebijakan berakhir.' : policy.state !== 'active' ? 'Kebijakan belum aktif.' : policy.simulationOnly ? 'Kebijakan hanya mengizinkan simulasi.' : !policy.allowedActions.includes('bid.submit') ? 'Izin bid otomatis belum dipilih.' : null;
    if (!waitingReason) {
      try { if (!policySchedule(policy, this.now()).active) waitingReason = 'Menunggu jadwal operasi yang Anda pilih.'; }
      catch { waitingReason = 'Zona waktu kebijakan tidak valid.'; }
    }
    return { ...this.status, state, waitingReason, marketplaceNotice, intervalMinutes: (this.dependencies.intervalMs === undefined ? policy.scanIntervalMinutes ?? 15 : this.intervalMs / 60_000) * this.backoff, cycleInProgress: this.busy, draftsInProgress: this.drafting, specializations: [...this.status.specializations] };
  }

  async start(): Promise<void> {
    if (this.timer || this.starting) return;
    this.starting = true;
    this.stopping = false;
    try {
      const remote = await this.dependencies.readProfile();
      if (this.stopping) return;
      this.profileJobs = remote.jobs;
      if (remote.jobIds.length > 0 && this.dependencies.syncProfileJobs && !(await this.dependencies.repository.hasAudit('marketplace.production.edit_profile', 'freelancer-profile-sync'))) {
        try {
          const current = await this.dependencies.readProfile();
          const sameJobs = current.jobIds.length === remote.jobIds.length && current.jobIds.every((id, index) => id === remote.jobIds[index]);
          const claim = sameJobs && await this.dependencies.repository.claimAudit({
            type: 'marketplace.production.edit_profile', resourceId: 'freelancer-profile-sync',
            policyVersion: (await this.dependencies.repository.getPolicy()).version, payloadHash: hashPayload(remote.jobIds),
            reason: 'Sinkronisasi idempotent daftar job profil sedang berlangsung.',
          });
          if (claim) {
            const result = await this.dependencies.syncProfileJobs([...remote.jobIds]);
            const success = result.statusCode === 200;
            await this.dependencies.repository.appendAudit({
              type: 'marketplace.production.edit_profile', resourceId: 'freelancer-profile-sync', status: success ? 'recorded' : 'failed',
              reason: `Sinkronisasi idempotent daftar job profil menghasilkan HTTP ${result.statusCode}; daftar yang sama dengan profil saat dibaca dikirim ulang.${result.resultId ? ` ID hasil: ${result.resultId}.` : ''}`,
              policyVersion: (await this.dependencies.repository.getPolicy()).version, payloadHash: hashPayload(remote.jobIds),
            });
          }
        } catch (error) {
          const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : null;
          await this.dependencies.repository.appendAudit({
            type: 'marketplace.production.edit_profile', resourceId: 'freelancer-profile-sync', status: 'failed',
            reason: statusCode === null ? 'Sinkronisasi idempotent profil tidak menerima hasil yang dapat dipastikan.' : `Sinkronisasi idempotent profil menghasilkan HTTP ${statusCode}.`,
            policyVersion: (await this.dependencies.repository.getPolicy()).version, payloadHash: hashPayload(remote.jobIds),
          });
        }
      }
      const jobs = matchedProfileJobs(remote);
      if (!jobs.length) {
        this.status = { ...this.status, state: 'blocked', lastRunAt: this.now().toISOString(), lastMessage: 'Profil Freelancer belum memiliki keahlian yang tercantum pada ringkasan publik; bid otomatis tetap berhenti.', specializations: [] };
        this.scheduleRetry();
        return;
      }
      const repository = this.dependencies.repository;
      const currentProfile = await repository.getProfile();
      // Seed from Freelancer only once; afterwards the owner's saved profile wins over the remote one.
      const profile = currentProfile.specializations.length ? currentProfile : seedLocalProfile(remote, jobs, currentProfile);
      if (profile !== currentProfile) await repository.saveProfile(profile);
      const currentPolicy = await repository.getPolicy();
      if (currentPolicy.state === 'paused') {
        this.status = { ...this.status, state: 'paused', lastMessage: 'Automasi dijeda melalui kill switch.' };
        return;
      }
      if (currentPolicy.state !== 'active') {
        if (await repository.hasAudit('policy.updated', 'policy') || await repository.hasAudit('policy.reactivation_required', 'policy')) {
          this.status = { ...this.status, state: 'blocked', lastMessage: 'Kebijakan draf menunggu aktivasi pemilik di kartu Kebijakan.', specializations: profile.specializations };
          return;
        }
        const policy = seedPolicy(currentPolicy, profile, this.now(), false);
        await repository.savePolicy(policy);
        await repository.appendAudit({ type: 'autopilot.policy_bootstrapped', resourceId: 'policy', status: 'recorded', reason: 'Kebijakan bid otomatis dibentuk dari ringkasan dan keahlian profil Freelancer; batas harga, kuota, zona waktu, serta jam mengikuti nilai lokal yang tersimpan.', policyVersion: policy.version, payloadHash: hashPayload({ specializations: policy.specializations, minPrice: policy.minPrice, maxPrice: policy.maxPrice, dailyBidLimit: policy.dailyBidLimit, weeklyBidLimit: policy.weeklyBidLimit }) });
      } else if (currentPolicy.simulationOnly || !currentPolicy.allowedActions.includes('bid.submit')) {
        this.status = { ...this.status, state: 'blocked', lastMessage: 'Kebijakan tersimpan belum mengizinkan bid otomatis live; tidak ada penawaran yang dikirim.', specializations: jobs.map((job) => job.name) };
        return;
      }
      this.status = { ...this.status, state: 'running', lastMessage: 'Autopilot aktif; pemindaian mengikuti interval kebijakan.', specializations: profile.specializations };
      await this.runCycle();
      if (this.stopping) return;
      this.timer = setInterval(() => {
        if (!this.status.nextRunAt || this.now().getTime() >= Date.parse(this.status.nextRunAt)) void this.runCycle().catch(() => {
          this.status = { ...this.status, state: 'error', lastMessage: 'Penyimpanan sementara tidak dapat dibaca. Penjadwal tetap aktif dan akan mencoba lagi.', nextRunAt: new Date(this.now().getTime() + (this.dependencies.intervalMs ?? this.status.intervalMinutes * 60_000)).toISOString() };
        });
      }, Math.min(this.intervalMs, 30_000));
      this.timer.unref?.();
    } catch {
      this.status = { ...this.status, state: 'error', lastRunAt: this.now().toISOString(), lastMessage: 'Autopilot tidak dapat membaca profil Freelancer. Periksa koneksi dan token yang tersimpan.' };
      if (!this.stopping) this.scheduleRetry();
    } finally {
      this.starting = false;
    }
  }

  private async writeProposal(project: ProjectOpportunity, policy: AutonomyPolicy, bid: { amount: number; period: number }, score: number) {
    const { draftProposal, repository } = this.dependencies;
    const evidence=(await repository.searchKnowledge(`${project.title} ${project.skills.join(' ')}`,4)).map(item=>({label:item.path,source:item.url,content:item.content}));
    const publicPortfolio=await this.dependencies.publicPortfolio?.(evidence).catch(()=>[]) ?? [];
    const template = {
      proposal: proposalFor(project, policy.specializations, bid.amount, bid.period,publicPortfolio),
      evidence: [{ label: 'Ringkasan publik Freelancer', source: 'Profil Freelancer akun sendiri' },...publicPortfolio.map(p=>({label:p.label,source:p.url}))],
      assumptions: ['Proposal memakai template bawaan dari ringkasan proyek dan keahlian profil Freelancer; klaim pengalaman tambahan tidak dibuat.'],
    };
    if (!draftProposal) return template;
    const fallback = async (reason: string) => {
      await repository.appendAudit({ type: 'autopilot.draft_fallback', resourceId: project.id, status: 'recorded', reason: `Proposal Hermes tidak dipakai: ${reason} Template bawaan digunakan.`, policyVersion: policy.version, payloadHash: null });
      return template;
    };
    const profile = await repository.getProfile();
    this.drafting += 1;
    try {
      const output = await draftProposal({
        project, profileFacts: profile.facts, score,
        evidence,publicPortfolio,
        profileRate: { min: profile.minPrice, max: profile.maxPrice },
        fixedBid: { amount: bid.amount, currency: project.currency, durationDays: bid.period },
      });
      if (output.proposedPrice !== bid.amount || output.durationDays !== bid.period) return fallback(`harga/durasi usulan (${output.proposedPrice}, ${output.durationDays} hari) berbeda dari kebijakan.`);
      if (mentionedAmounts(output.proposal).some((amount) => amount !== bid.amount)) return fallback('teks menyebut nominal harga yang berbeda dari bid.');
      return {
        proposal: output.proposal,
        evidence: output.evidence.length ? output.evidence : template.evidence,
        assumptions: ['Proposal ditulis Hermes dari fakta profil dan bukti Knowledge Hub; harga dan durasi ditetapkan kebijakan.', ...output.assumptions].slice(0, 20),
      };
    } catch (error) {
      return fallback(error instanceof Error ? error.message : 'Hermes gagal.');
    } finally {
      this.drafting -= 1;
    }
  }

  stop(): void {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async runCycle(): Promise<void> {
    if (this.busy || this.stopping) return;
    const repository = this.dependencies.repository;
    const policy = await repository.getPolicy();
    if (policy.state !== 'active' || policy.simulationOnly || !policy.allowedActions.includes('bid.submit')) {
      this.status = { ...this.status, state: policy.state === 'paused' ? 'paused' : 'blocked', lastRunAt: this.now().toISOString(), lastMessage: 'Kebijakan tidak mengizinkan bid live; pemindaian tidak mengirim tindakan.' };
      return;
    }
    this.busy = true;
    this.status = { ...this.status, state: 'running' };
    const runAt = this.now();
    let imported = 0;
    let submitted = 0;
    let eligible = 0;
    const reasons: Record<string, number> = {};
    const count = (reason: string) => { reasons[reason] = (reasons[reason] ?? 0) + 1; };
    try {
      const unique = new Map<string, ProjectOpportunity>();
      const add = (found: ProjectOpportunity[], keyword?: string) => {
        for (const project of found) {
          const searchable = `${project.title}\n${project.description}`.toLocaleLowerCase();
          const searchEvidence = keyword && !project.skills.length && searchable.includes(keyword.toLocaleLowerCase()) ? [keyword] : [];
          const existing = unique.get(project.id);
          unique.set(project.id, { ...project, skills: [...new Set([...(existing?.skills ?? []), ...project.skills, ...searchEvidence])] });
        }
      };
      const searchTerms = selectSearchTerms(policy.specializations, policy.keywords, this.searchCycle++, KEYWORD_SEARCHES_PER_CYCLE);
      const wanted = new Set([...policy.specializations, ...policy.keywords].map((term) => term.trim().toLocaleLowerCase()));
      const jobs = this.dependencies.readProjectsByJobs ? this.profileJobs.filter((job) => wanted.has(job.name.toLocaleLowerCase())).slice(0, 50) : [];
      this.status = { ...this.status, searchTerms, searchJobs: jobs.map((job) => job.name) };
      if (jobs.length && this.dependencies.readProjectsByJobs) {
        // Overlap the previous job search by 2 minutes; the first one looks back one hour.
        const fromTime = Math.floor((this.lastJobSearchAt ?? runAt.getTime() - 60 * 60_000) / 1_000) - 120;
        add((await this.dependencies.readProjectsByJobs(jobs.map((job) => job.id), fromTime, 50)).projects);
        this.lastJobSearchAt = runAt.getTime();
      }
      for (const keyword of searchTerms) add((await this.dependencies.readProjects(keyword, 20)).projects, keyword);
      const sync = await repository.syncFreelancerProjects([...unique.values()]);
      imported = sync.upserted;
      const usage = await repository.bidUsage(runAt, policy.timezone);
      let dailyUsed = usage.today;
      let weeklyUsed = usage.week;
      const history = await repository.autopilotDecisions(policy.version);
      const lastBid = (await repository.listAuditForType('marketplace.production.submit_bid', 2)).find((event) => event.status === 'failed' || event.status === 'recorded');
      const quotaCooldown = lastBid?.status === 'failed' && lastBid.reason.includes('BID_LIMIT_EXCEEDED') && this.now().getTime() < Date.parse(lastBid.createdAt) + 60 * 60_000;
      const attempted = new Set(history.filter((item) => item.attempted).map((item) => item.resourceId));
      const skipped = new Map(history.filter((item) => !item.attempted).map((item) => [item.resourceId, item.reason]));
      const drafts = await repository.latestDrafts();
      const projects = (await repository.listProjects())
        .filter((project) => project.source === 'freelancer' && project.status === 'open')
        .map((project) => ({ ...project, ...scoreProject(project, policy.specializations) }))
        .sort((a, b) => b.score - a.score);

      const considered = projects.length;
      for (const project of projects) {
        if (this.stopping) break;
        const activePolicy = await repository.getPolicy();
        if (activePolicy.state !== 'active' || activePolicy.simulationOnly || !activePolicy.allowedActions.includes('bid.submit')) break;
        if (attempted.has(project.id)) { count('Sudah pernah dikirim atau hasilnya perlu rekonsiliasi'); continue; }
        if (drafts.has(project.id)) { count('Memiliki draf lokal; tidak dikirim otomatis'); continue; }
        const bid = chooseBid(project, activePolicy);
        if (!bid) { count(project.projectType !== 'fixed' ? 'Tipe proyek bukan harga tetap' : project.currency !== 'USD' ? 'Mata uang bukan USD' : 'Anggaran atau tenggat di luar batas bid'); continue; }
        const confidence = project.score / 100;
        const decision = evaluatePolicy({ policy: activePolicy, project, action: 'bid.submit', confidence, proposedPrice: bid.amount, dailyUsed, weeklyUsed, now: this.now(), capability: 'supported', executionMode: 'external' });
        if (!decision.allowed) {
          count(decision.reason);
          if (activePolicy.version !== policy.version || skipped.get(project.id) !== decision.reason) await repository.appendAudit({ type: 'autopilot.bid_skipped', resourceId: project.id, status: 'blocked', reason: decision.reason, policyVersion: activePolicy.version, payloadHash: null });
          continue;
        }
        eligible += 1;
        if (quotaCooldown) { count('Menunggu kuota akun Freelancer; jeda satu jam sejak penolakan API terakhir'); continue; }
        const transport = this.dependencies.bidTransportReady?.();
        if (transport && !transport.ready) { count(transport.reason); continue; }
        const written = await this.writeProposal(project, activePolicy, bid, project.score);
        const proposal = written.proposal;
        if (this.stopping) break;
        // Recheck after drafting: the owner may change the policy while Hermes runs.
        const latest = await repository.getPolicy();
        const latestUsage = await repository.bidUsage(this.now(), latest.timezone);
        const latestDecision = evaluatePolicy({ policy: latest, project, action: 'bid.submit', confidence: scoreProject(project, latest.specializations).score / 100, proposedPrice: bid.amount, dailyUsed: latestUsage.today, weeklyUsed: latestUsage.week, now: this.now(), capability: 'supported', executionMode: 'external' });
        if (latest.simulationOnly || !latestDecision.allowed || latest.version !== activePolicy.version) { count('Kebijakan berubah saat proposal ditulis; diperiksa lagi pada siklus berikutnya'); continue; }
        const payloadHash = hashPayload({ projectId: project.id, amount: bid.amount, period: bid.period, description: proposal });
        const claimed = await repository.claimAudit({
          type: 'marketplace.production.submit_bid', resourceId: project.id, policyVersion: activePolicy.version,
          payloadHash, reason: 'Bid live sedang dikirim oleh autopilot.',
        });
        if (!claimed) { count('Proyek sudah dikunci oleh percobaan pengiriman lain'); continue; }
        const draft: BidDraft = {
          id: createId('draft'), projectId: project.id, proposal, proposedPrice: bid.amount, currency: project.currency,
          durationDays: bid.period, confidence, evidence: written.evidence, assumptions: written.assumptions, status: 'draft_ready', createdAt: runAt.toISOString(),
        };
        await repository.createDraft(draft);
        await repository.setPipelineStatus(project.id, 'policy_check');
        try {
          const input: BrowserBidInput = { operation: 'submit_bid', projectId: Number(project.id.replace(/^freelancer:/, '')), amount: bid.amount, period: bid.period, milestonePercentage: 100, description: proposal };
          const authorize = async () => {
            const current = await repository.getPolicy();
            const usage = await repository.bidUsage(this.now(), current.timezone);
            const decision = evaluatePolicy({ policy: current, project, action: 'bid.submit', confidence: scoreProject(project, current.specializations).score / 100, proposedPrice: bid.amount, dailyUsed: usage.today, weeklyUsed: usage.week, now: this.now(), capability: 'supported', executionMode: 'external' });
            if (this.stopping || current.simulationOnly || current.version !== activePolicy.version || !decision.allowed) throw new Error('Kebijakan atau status automasi berubah sebelum submit; bid dibatalkan.');
          };
          const result = this.dependencies.guardedSubmitBid ? await this.dependencies.guardedSubmitBid(input, authorize) : await this.dependencies.submitBid(input);
          const success = result.statusCode === 200;
          await repository.appendAudit({ type: 'marketplace.production.submit_bid', resourceId: project.id, status: success ? 'recorded' : 'failed', reason: `Bid otomatis melalui ${'transport' in result && result.transport==='browser'?'browser':'API'} menghasilkan HTTP ${result.statusCode}.${result.resultId ? ` ID hasil: ${result.resultId}.` : ''} Isi proposal tidak disimpan pada audit.`, policyVersion: activePolicy.version, payloadHash });
          if (success) {
            if (result.resultId?.trim()) {
              await repository.setPipelineStatus(project.id, 'submitted');
              await repository.recordSubmittedBid({ projectId: project.id, bidId: result.resultId, amount: bid.amount, currency: project.currency, submittedAt: runAt.toISOString() });
              await repository.appendAudit({ type: 'business.bid_submitted', resourceId: project.id, status: 'recorded', reason: `Bid Freelancer terkonfirmasi dan dicatat pada operasi bisnis lokal. ID hasil: ${result.resultId}.`, policyVersion: policy.version, payloadHash: null, createdAt: runAt.toISOString() });
            }
            submitted += 1;
            dailyUsed += 1;
            weeklyUsed += 1;
          } else {
            count(`Bid ditolak Freelancer: HTTP ${result.statusCode}`);
            await repository.setPipelineStatus(project.id, 'error');
          }
        } catch (error) {
          const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : null;
          await repository.appendAudit({ type: 'marketplace.production.submit_bid', resourceId: project.id, status: 'failed', reason: statusCode === null ? 'Bid otomatis tidak menerima respons yang dapat dipastikan; proyek dikunci agar tidak dikirim ulang otomatis.' : `Bid otomatis menghasilkan HTTP ${statusCode}. ${error instanceof Error ? error.message.slice(0, 260) : ''}`.trim(), policyVersion: policy.version, payloadHash });
          await repository.setPipelineStatus(project.id, 'reconciliation_required');
          const quotaExceeded = error instanceof Error && error.message.includes('BID_LIMIT_EXCEEDED');
          count(quotaExceeded ? 'Kuota bid akun Freelancer habis (dikonfirmasi API)' : 'Pengiriman bid gagal atau hasilnya belum dapat dipastikan');
          if (quotaExceeded) break;
        }
      }
      await repository.appendAudit({ type: 'autopilot.cycle', resourceId: 'freelancer', status: 'recorded', reason: `Pemindaian otomatis mengimpor ${imported} proyek dan mengirim ${submitted} bid; payload proyek tidak disimpan pada audit.`, policyVersion: policy.version, payloadHash: null });
      this.status = {
        ...this.status, state: 'running', lastRunAt: runAt.toISOString(), summary: { considered, eligible, reasons },
        lastMessage: `${imported} proyek diperiksa; ${submitted} bid terkirim sesuai kebijakan.`, lastImported: imported, lastSubmitted: submitted,
      };
      this.backoff = 1;
    } catch (error) {
      if (rateLimited(error)) this.backoff = Math.min(MAX_BACKOFF, this.backoff * 2);
      const lastMessage = rateLimited(error)
        ? `Freelancer membatasi permintaan (HTTP 429); interval pemindaian diperpanjang ${this.backoff}× sampai pemindaian berhasil.`
        : 'Siklus otomatis gagal. Tidak ada proyek yang akan dikirim ulang bila hasil sebelumnya tidak pasti.';
      this.status = { ...this.status, state: 'error', lastRunAt: runAt.toISOString(), nextRunAt: new Date(runAt.getTime() + this.intervalMs).toISOString(), lastMessage, lastImported: imported, lastSubmitted: submitted };
    } finally {
      this.busy = false;
      const interval = (this.dependencies.intervalMs ?? (policy.scanIntervalMinutes ?? 15) * 60_000) * this.backoff;
      this.status = { ...this.status, intervalMinutes: interval / 60_000, nextRunAt: new Date(this.now().getTime() + interval).toISOString() };
    }
  }
}
