import { FreelancerPartialReadError, lastFreelancerRateLimit, type FreelancerBidStatus, type FreelancerLatestMessage, type FreelancerRateLimit } from '@fvh/adapter-freelancer';
import { bidOutcome } from '@fvh/domain';
import type { WorkspaceRepository } from '@fvh/persistence';

export type SyncStep = 'outcomes' | 'messages' | null;
type RunStatus = { lastRunAt: string | null; ok: boolean | null; error: string | null };
type BackoffJob = 'outcomes' | 'messages';
export type BusinessSyncStatus = {
  step: SyncStep;
  outcomes: RunStatus & { checked: number };
  messages: RunStatus & { threads: number; selfId: string | null; mode: 'incremental' | 'full' | null; lastFullAt: string | null };
  /** Interval multiplier per job after HTTP 429 (1 = normal, max 8). */
  backoff: Record<BackoffJob, number>;
  /** Last RateLimit-* header numbers seen on any Freelancer read. */
  rateLimit: FreelancerRateLimit | null;
};
export type ThreadReadOptions = { fromUpdatedTime?: number; known: ReadonlyMap<number, number> };

type Dependencies = {
  repository: WorkspaceRepository;
  captureMessages?: (messages: FreelancerLatestMessage[], selfId: string) => Promise<void>;
  readOwnBids: (ids: string[]) => Promise<FreelancerBidStatus[]>;
  readSelfId?: () => Promise<string>;
  readThreads?: (selfId: string, options: ThreadReadOptions) => Promise<FreelancerLatestMessage[]>;
  readRateLimit?: () => FreelancerRateLimit | null;
  now?: () => Date;
  /** Base intervals: outcomes 5 min, incremental messages 1 min, full message sweep 30 min. */
  intervals?: Partial<{ outcomes: number; messages: number; sweep: number }>;
};

const MAX_BACKOFF = 8;
/** Incremental reads overlap the previous successful read so clock skew cannot drop a thread. */
const OVERLAP_SECONDS = 120;

function safeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message.replace(/\b(?:token|bearer|authorization)\b[^\s]*/gi, '[redacted]').slice(0, 200) : fallback;
}

function rateLimited(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 429;
}

/** Read-only background sync of bid outcomes and client messages; runs regardless of the bidding policy. */
export class BusinessSync {
  private readonly now: () => Date;
  private readonly intervals: { outcomes: number; messages: number; sweep: number };
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private due = { outcomes: 0, messages: 0, sweep: 0 };
  private backoff: Record<BackoffJob, number> = { outcomes: 1, messages: 1 };
  /** Thread id -> time_updated already stored, so unchanged threads are neither re-read nor rewritten. */
  private readonly known = new Map<number, number>();
  private lastMessagesSuccess: number | null = null;
  private status: Omit<BusinessSyncStatus, 'backoff' | 'rateLimit'> = {
    step: null,
    outcomes: { lastRunAt: null, ok: null, error: null, checked: 0 },
    messages: { lastRunAt: null, ok: null, error: null, threads: 0, selfId: null, mode: null, lastFullAt: null },
  };

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.intervals = { outcomes: 5 * 60_000, messages: 60_000, sweep: 30 * 60_000, ...dependencies.intervals };
  }

  getStatus(): BusinessSyncStatus {
    return {
      step: this.status.step, outcomes: { ...this.status.outcomes }, messages: { ...this.status.messages },
      backoff: { ...this.backoff }, rateLimit: (this.dependencies.readRateLimit ?? lastFreelancerRateLimit)(),
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, Math.min(this.intervals.messages, this.intervals.outcomes));
    this.timer.unref();
    void this.tick();
  }

  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }

  /** Runs every job that is due; a full sweep replaces the incremental read when both are due. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = this.now().getTime();
      if (now >= this.due.outcomes) await this.syncOutcomes();
      if (now >= this.due.sweep || this.lastMessagesSuccess === null) {
        if (now >= this.due.messages) await this.syncMessages('full');
      } else if (now >= this.due.messages) await this.syncMessages('incremental');
    } finally {
      this.running = false;
    }
  }

  private reschedule(job: BackoffJob, startedAt: number, error: unknown): void {
    this.backoff[job] = !error ? 1 : rateLimited(error) ? Math.min(MAX_BACKOFF, this.backoff[job] * 2) : this.backoff[job];
    this.due[job] = startedAt + this.intervals[job] * this.backoff[job];
  }

  async syncOutcomes(): Promise<void> {
    const { repository } = this.dependencies;
    this.status.step = 'outcomes';
    const startedAt = this.now();
    const lastRunAt = startedAt.toISOString();
    let failure: unknown = null;
    try {
      const pending = (await repository.listBidOutcomes()).filter((row) => row.outcome === 'pending');
      const byId = new Map(pending.map((row) => [row.bidId, row]));
      const bids = pending.length ? await this.dependencies.readOwnBids(pending.map((row) => row.bidId)) : [];
      let checked = 0;
      for (const bid of bids) {
        const previous = byId.get(bid.bidId);
        if (!previous) continue;
        const outcome = bidOutcome(bid.awardStatus, bid.retracted);
        await repository.updateBidOutcome(previous.projectId, { awardStatus: bid.awardStatus, outcome, checkedAt: this.now().toISOString() });
        checked += 1;
        if (outcome === 'pending') continue;
        await repository.setPipelineStatus(previous.projectId, outcome);
        await repository.appendAudit({ type: 'bid.outcome_changed', resourceId: previous.projectId, status: 'recorded', reason: `Status bid di Freelancer: ${bid.awardStatus ?? (bid.retracted ? 'retracted' : 'tidak diketahui')}.`, policyVersion: null, payloadHash: null });
        if (outcome === 'won') {
          const project = await repository.getProject(previous.projectId);
          const created = await repository.createClientProject({
            title: project?.title ?? 'Proyek Freelancer', client: project?.clientName ?? 'Tidak tersedia', source: 'freelancer',
            externalProjectId: previous.projectId, status: 'active', deadline: null, value: previous.amount,
            currency: previous.currency ?? project?.currency ?? 'USD',
          });
          if (created) await repository.appendAudit({ type: 'work.project_created', resourceId: created.id, status: 'recorded', reason: 'Proyek aktif dibuat dari bid yang menang.', policyVersion: null, payloadHash: null });
        }
      }
      this.status.outcomes = { lastRunAt, ok: true, error: null, checked };
    } catch (error) {
      failure = error;
      this.status.outcomes = { lastRunAt, ok: false, error: safeError(error, 'Gagal sinkronisasi hasil bid.'), checked: 0 };
    } finally {
      this.reschedule('outcomes', startedAt.getTime(), failure);
      this.status.step = null;
    }
  }

  async syncMessages(mode: 'incremental' | 'full' = 'full'): Promise<void> {
    const { readSelfId, readThreads, repository } = this.dependencies;
    if (!readSelfId || !readThreads) return;
    this.status.step = 'messages';
    const startedAt = this.now();
    const lastRunAt = startedAt.toISOString();
    let selfId = this.status.messages.selfId;
    let messages: FreelancerLatestMessage[] = [];
    let failure: unknown = null;
    try {
      selfId ??= await readSelfId();
      const fromUpdatedTime = mode === 'incremental' && this.lastMessagesSuccess !== null ? Math.floor(this.lastMessagesSuccess / 1_000) - OVERLAP_SECONDS : undefined;
      messages = await readThreads(selfId, { known: this.known, ...(fromUpdatedTime !== undefined ? { fromUpdatedTime } : {}) });
    } catch (error) {
      failure = error;
      // A 429 midway keeps the threads already read.
      if (error instanceof FreelancerPartialReadError) messages = error.partial;
    }
    const changed = messages.filter((message) => message.threadUpdated === undefined || this.known.get(message.threadId) !== message.threadUpdated);
    try {
      if (changed.length) await repository.upsertClientThreads(changed.map((message) => ({
        threadId: String(message.threadId), projectId: message.projectId, lastSenderId: message.senderId,
        lastMessageAt: message.createdAt, preview: message.message.slice(0, 200), syncedAt: lastRunAt,
      })));
      if (selfId && messages.length) await this.dependencies.captureMessages?.(messages, selfId);
      for (const message of changed) if (message.threadUpdated !== undefined) this.known.set(message.threadId, message.threadUpdated);
    } catch (error) {
      failure ??= error;
    }
    if (!failure) {
      this.lastMessagesSuccess = startedAt.getTime();
      if (mode === 'full') this.due.sweep = startedAt.getTime() + this.intervals.sweep;
    }
    this.reschedule('messages', startedAt.getTime(), failure);
    const previous = this.status.messages;
    this.status.messages = failure
      ? { ...previous, selfId, mode, lastRunAt, ok: false, error: `${safeError(failure, 'Gagal sinkronisasi pesan.')}${changed.length ? ` (${changed.length} thread tersimpan sebelum berhenti)` : ''}` }
      : { lastRunAt, ok: true, error: null, threads: changed.length, selfId, mode, lastFullAt: mode === 'full' ? lastRunAt : previous.lastFullAt };
    this.status.step = null;
  }
}
