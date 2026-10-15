import { evaluatePolicy, scoreProject } from '@fvh/domain';
import type { AutonomyPolicy, BidDraft, ProjectOpportunity } from '@fvh/domain';
import type { FreelancerProfile, FreelancerWriteResult } from '@fvh/adapter-freelancer';
import { createId, hashPayload } from '@fvh/application';
import type { WorkspaceRepository, ServiceProfile } from '@fvh/persistence';

type AutopilotDependencies = {
  repository: WorkspaceRepository;
  readProfile: () => Promise<FreelancerProfile>;
  readProjects: (query: string, limit: number) => Promise<{ projects: ProjectOpportunity[]; skipped: number }>;
  syncProfileJobs?: (jobIds: number[]) => Promise<FreelancerWriteResult>;
  submitBid: (input: { operation: 'submit_bid'; projectId: number; amount: number; period: number; milestonePercentage: number; description: string }) => Promise<FreelancerWriteResult>;
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
};

const dayMs = 24 * 60 * 60 * 1_000;

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

function seedPolicy(policy: AutonomyPolicy, profile: ServiceProfile, now: Date): AutonomyPolicy {
  const expiry = Date.parse(policy.expiresAt);
  return {
    ...policy,
    version: policy.version + 1,
    state: 'active',
    expiresAt: Number.isFinite(expiry) && expiry > now.getTime() ? policy.expiresAt : new Date(now.getTime() + 30 * dayMs).toISOString(),
    allowedActions: ['bid.submit'],
    primaryField: profile.primaryField,
    specializations: profile.specializations,
    keywords: [],
    minPrice: profile.minPrice,
    maxPrice: profile.maxPrice,
    simulationOnly: false,
    allowUnknownDeadline: true,
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

function proposalFor(project: ProjectOpportunity, specialties: string[], price: number, durationDays: number): string {
  const country = project.clientCountry?.trim().toLocaleLowerCase() ?? '';
  const isIndonesianClient = country === 'id' || country === 'idn' || country.includes('indonesia');
  const matched = project.skills.filter((skill) => specialties.some((specialty) => specialty.toLocaleLowerCase() === skill.toLocaleLowerCase()));
  const scope = project.description.replace(/\s+/g, ' ').trim().slice(0, 420);
  const clientName = project.clientName && project.clientName !== 'Klien Freelancer' ? project.clientName : undefined;

  if (isIndonesianClient) {
    return [
      clientName ? `Halo ${clientName},` : 'Halo,',
      `Saya tertarik mengerjakan “${project.title}”.${matched.length ? ` Keahlian profil saya yang relevan: ${matched.join(', ')}.` : ''}`,
      scope ? `Dari brief, saya memahami ruang lingkupnya sebagai berikut: ${scope}` : 'Saya akan mengikuti ruang lingkup yang tercantum dan mengonfirmasi kriteria hasil sebelum mulai.',
      `Penawaran saya ${project.currency} ${price} dengan estimasi ${durationDays} hari. Jika ada tenggat khusus, saya akan mengonfirmasi jadwal, akses yang diperlukan, dan kriteria penerimaan sebelum pekerjaan dimulai.`,
    ].join('\n\n').slice(0, 4_000);
  }

  return [
    clientName ? `Hello ${clientName},` : 'Hello,',
    `I would be glad to work on “${project.title}”.${matched.length ? ` Relevant skills from my profile include ${matched.join(', ')}.` : ''}`,
    scope ? `Based on your brief, I understand the scope to be: ${scope}` : 'I will follow the scope in your brief and confirm the acceptance criteria before starting.',
    `My bid is ${project.currency} ${price}, with an estimated delivery time of ${durationDays} days. If you have a specific deadline, I will confirm the schedule, required access, and acceptance criteria before work begins.`,
  ].join('\n\n').slice(0, 4_000);
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
  private busy = false;
  private status: AutopilotStatus = {
    state: 'starting', lastRunAt: null, nextRunAt: null, lastMessage: 'Membaca profil Freelancer untuk menyiapkan operasi otomatis.',
    lastImported: 0, lastSubmitted: 0, specializations: [], cycleInProgress: false,
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

  getStatus(): AutopilotStatus {
    const policy = this.dependencies.repository.getPolicy();
    const state = policy.state === 'paused' ? 'paused' : policy.state !== 'active' || policy.simulationOnly ? 'blocked' : this.status.state;
    return { ...this.status, state, cycleInProgress: this.busy, specializations: [...this.status.specializations] };
  }

  async start(): Promise<void> {
    if (this.timer) return;
    try {
      const remote = await this.dependencies.readProfile();
      if (remote.jobIds.length > 0 && this.dependencies.syncProfileJobs && !this.dependencies.repository.hasAudit('marketplace.production.edit_profile', 'freelancer-profile-sync')) {
        try {
          const current = await this.dependencies.readProfile();
          const sameJobs = current.jobIds.length === remote.jobIds.length && current.jobIds.every((id, index) => id === remote.jobIds[index]);
          const claim = sameJobs && this.dependencies.repository.claimAudit({
            type: 'marketplace.production.edit_profile', resourceId: 'freelancer-profile-sync',
            policyVersion: this.dependencies.repository.getPolicy().version, payloadHash: hashPayload(remote.jobIds),
            reason: 'Sinkronisasi idempotent daftar job profil sedang berlangsung.',
          });
          if (claim) {
            const result = await this.dependencies.syncProfileJobs([...remote.jobIds]);
            const success = result.statusCode === 200;
            this.dependencies.repository.appendAudit({
              type: 'marketplace.production.edit_profile', resourceId: 'freelancer-profile-sync', status: success ? 'recorded' : 'failed',
              reason: `Sinkronisasi idempotent daftar job profil menghasilkan HTTP ${result.statusCode}; daftar yang sama dengan profil saat dibaca dikirim ulang.${result.resultId ? ` ID hasil: ${result.resultId}.` : ''}`,
              policyVersion: this.dependencies.repository.getPolicy().version, payloadHash: hashPayload(remote.jobIds),
            });
          }
        } catch (error) {
          const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : null;
          this.dependencies.repository.appendAudit({
            type: 'marketplace.production.edit_profile', resourceId: 'freelancer-profile-sync', status: 'failed',
            reason: statusCode === null ? 'Sinkronisasi idempotent profil tidak menerima hasil yang dapat dipastikan.' : `Sinkronisasi idempotent profil menghasilkan HTTP ${statusCode}.`,
            policyVersion: this.dependencies.repository.getPolicy().version, payloadHash: hashPayload(remote.jobIds),
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
      const currentProfile = repository.getProfile();
      const profile = seedLocalProfile(remote, jobs, currentProfile);
      repository.saveProfile(profile);
      const currentPolicy = repository.getPolicy();
      if (currentPolicy.state === 'paused') {
        this.status = { ...this.status, state: 'paused', lastMessage: 'Automasi dijeda melalui kill switch.' };
        return;
      }
      if (currentPolicy.state !== 'active') {
        const policy = seedPolicy(currentPolicy, profile, this.now());
        repository.savePolicy(policy);
        repository.appendAudit({ type: 'autopilot.policy_bootstrapped', resourceId: 'policy', status: 'recorded', reason: 'Kebijakan bid otomatis dibentuk dari ringkasan dan keahlian profil Freelancer; batas harga, kuota, zona waktu, serta jam mengikuti nilai lokal yang tersimpan.', policyVersion: policy.version, payloadHash: hashPayload({ specializations: policy.specializations, minPrice: policy.minPrice, maxPrice: policy.maxPrice, dailyBidLimit: policy.dailyBidLimit, weeklyBidLimit: policy.weeklyBidLimit }) });
      } else if (currentPolicy.simulationOnly || !currentPolicy.allowedActions.includes('bid.submit')) {
        this.status = { ...this.status, state: 'blocked', lastMessage: 'Kebijakan tersimpan belum mengizinkan bid otomatis live; tidak ada penawaran yang dikirim.', specializations: jobs.map((job) => job.name) };
        return;
      } else if (repository.hasAudit('autopilot.policy_bootstrapped', 'policy') && currentPolicy.allowUnknownDeadline !== true) {
        repository.savePolicy({ ...currentPolicy, allowUnknownDeadline: true });
      }
      this.status = { ...this.status, state: 'running', lastMessage: 'Autopilot aktif. Pemindaian Freelancer berjalan otomatis tiap 15 menit.', specializations: jobs.map((job) => job.name) };
      await this.runCycle();
      this.timer = setInterval(() => { void this.runCycle(); }, this.intervalMs);
      this.timer.unref?.();
    } catch {
      this.status = { ...this.status, state: 'error', lastRunAt: this.now().toISOString(), lastMessage: 'Autopilot tidak dapat membaca profil Freelancer. Periksa koneksi dan token yang tersimpan.' };
      this.scheduleRetry();
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async runCycle(): Promise<void> {
    if (this.busy) return;
    const repository = this.dependencies.repository;
    const policy = repository.getPolicy();
    if (policy.state !== 'active' || policy.simulationOnly || !policy.allowedActions.includes('bid.submit')) {
      this.status = { ...this.status, state: policy.state === 'paused' ? 'paused' : 'blocked', lastRunAt: this.now().toISOString(), lastMessage: 'Kebijakan tidak mengizinkan bid live; pemindaian tidak mengirim tindakan.' };
      return;
    }
    this.busy = true;
    const runAt = this.now();
    let imported = 0;
    let submitted = 0;
    try {
      const unique = new Map<string, ProjectOpportunity>();
      for (const keyword of policy.specializations.slice(0, 8)) {
        const result = await this.dependencies.readProjects(keyword, 20);
        for (const project of result.projects) {
          const searchable = `${project.title}\n${project.description}`.toLocaleLowerCase();
          const searchEvidence = !project.skills.length && searchable.includes(keyword.toLocaleLowerCase()) ? [keyword] : [];
          const existing = unique.get(project.id);
          unique.set(project.id, { ...project, skills: [...new Set([...(existing?.skills ?? []), ...project.skills, ...searchEvidence])] });
        }
      }
      const sync = repository.syncFreelancerProjects([...unique.values()]);
      imported = sync.upserted;
      const audits = repository.listAudit(5_000);
      const successfulBids = audits.filter((event) => event.type === 'marketplace.production.submit_bid' && event.status === 'recorded');
      const today = localDateKey(runAt, policy.timezone);
      const thisWeek = mondayKey(today);
      let dailyUsed = successfulBids.filter((event) => localDateKey(new Date(event.createdAt), policy.timezone) === today).length;
      let weeklyUsed = successfulBids.filter((event) => mondayKey(localDateKey(new Date(event.createdAt), policy.timezone)) === thisWeek).length;
      const projects = repository.listProjects()
        .filter((project) => project.source === 'freelancer' && project.status === 'open')
        .map((project) => ({ ...project, ...scoreProject(project, policy.specializations) }))
        .sort((a, b) => b.score - a.score);

      for (const project of projects) {
        const activePolicy = repository.getPolicy();
        if (activePolicy.state !== 'active' || activePolicy.simulationOnly || !activePolicy.allowedActions.includes('bid.submit')) break;
        if (dailyUsed >= policy.dailyBidLimit || weeklyUsed >= policy.weeklyBidLimit) break;
        if (repository.hasAudit('marketplace.production.submit_bid', project.id)) continue;
        if (repository.hasAuditForPolicy('autopilot.bid_skipped', project.id, activePolicy.version)) continue;
        if (repository.getLatestDraft(project.id)) continue;
        const bid = chooseBid(project, policy);
        if (!bid) continue;
        const confidence = project.score / 100;
        const decision = evaluatePolicy({ policy: activePolicy, project, action: 'bid.submit', confidence, proposedPrice: bid.amount, dailyUsed, weeklyUsed, now: this.now(), capability: 'supported', executionMode: 'external' });
        if (!decision.allowed) {
          repository.appendAudit({ type: 'autopilot.bid_skipped', resourceId: project.id, status: 'blocked', reason: decision.reason, policyVersion: policy.version, payloadHash: null });
          continue;
        }
        if (repository.getPolicy().state !== 'active' || repository.getPolicy().simulationOnly) break;
        const proposal = proposalFor(project, activePolicy.specializations, bid.amount, bid.period);
        const payloadHash = hashPayload({ projectId: project.id, amount: bid.amount, period: bid.period, description: proposal });
        const claimed = repository.claimAudit({
          type: 'marketplace.production.submit_bid', resourceId: project.id, policyVersion: activePolicy.version,
          payloadHash, reason: 'Bid live sedang dikirim oleh autopilot.',
        });
        if (!claimed) continue;
        const draft: BidDraft = {
          id: createId('draft'), projectId: project.id, proposal, proposedPrice: bid.amount, currency: project.currency,
          durationDays: bid.period, confidence, evidence: [{ label: 'Ringkasan publik Freelancer', source: 'Profil Freelancer akun sendiri' }],
          assumptions: ['Proposal memakai ringkasan proyek dan keahlian yang tercantum pada profil Freelancer; klaim pengalaman tambahan tidak dibuat.'], status: 'draft_ready', createdAt: runAt.toISOString(),
        };
        repository.createDraft(draft);
        repository.setPipelineStatus(project.id, 'policy_check');
        try {
          const result = await this.dependencies.submitBid({ operation: 'submit_bid', projectId: Number(project.id.replace(/^freelancer:/, '')), amount: bid.amount, period: bid.period, milestonePercentage: 100, description: proposal });
          const success = result.statusCode === 200;
          repository.appendAudit({ type: 'marketplace.production.submit_bid', resourceId: project.id, status: success ? 'recorded' : 'failed', reason: `Bid otomatis menghasilkan HTTP ${result.statusCode}.${result.resultId ? ` ID hasil: ${result.resultId}.` : ''} Isi proposal tidak disimpan pada audit.`, policyVersion: policy.version, payloadHash });
          if (success) {
            if (result.resultId?.trim()) {
              repository.setPipelineStatus(project.id, 'submitted');
              repository.recordSubmittedBid({ projectId: project.id, bidId: result.resultId, amount: bid.amount, currency: project.currency, submittedAt: runAt.toISOString() });
              repository.appendAudit({ type: 'business.bid_submitted', resourceId: project.id, status: 'recorded', reason: `Bid Freelancer terkonfirmasi dan dicatat pada operasi bisnis lokal. ID hasil: ${result.resultId}.`, policyVersion: policy.version, payloadHash: null, createdAt: runAt.toISOString() });
            }
            submitted += 1;
            dailyUsed += 1;
            weeklyUsed += 1;
          } else {
            repository.setPipelineStatus(project.id, 'error');
          }
        } catch (error) {
          const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : null;
          repository.appendAudit({ type: 'marketplace.production.submit_bid', resourceId: project.id, status: 'failed', reason: statusCode === null ? 'Bid otomatis tidak menerima respons yang dapat dipastikan; proyek dikunci agar tidak dikirim ulang otomatis.' : `Bid otomatis menghasilkan HTTP ${statusCode}.`, policyVersion: policy.version, payloadHash });
          repository.setPipelineStatus(project.id, 'reconciliation_required');
        }
      }
      repository.appendAudit({ type: 'autopilot.cycle', resourceId: 'freelancer', status: 'recorded', reason: `Pemindaian otomatis mengimpor ${imported} proyek dan mengirim ${submitted} bid; payload proyek tidak disimpan pada audit.`, policyVersion: policy.version, payloadHash: null });
      this.status = {
        ...this.status, state: 'running', lastRunAt: runAt.toISOString(), nextRunAt: new Date(runAt.getTime() + this.intervalMs).toISOString(),
        lastMessage: `${imported} proyek diperiksa; ${submitted} bid terkirim sesuai kebijakan.`, lastImported: imported, lastSubmitted: submitted,
      };
    } catch {
      this.status = { ...this.status, state: 'error', lastRunAt: runAt.toISOString(), nextRunAt: new Date(runAt.getTime() + this.intervalMs).toISOString(), lastMessage: 'Siklus otomatis gagal. Tidak ada proyek yang akan dikirim ulang bila hasil sebelumnya tidak pasti.', lastImported: imported, lastSubmitted: submitted };
    } finally {
      this.busy = false;
    }
  }
}
