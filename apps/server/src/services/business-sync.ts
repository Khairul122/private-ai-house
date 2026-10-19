import type { FreelancerBidStatus, FreelancerLatestMessage } from '@fvh/adapter-freelancer';
import { bidOutcome } from '@fvh/domain';
import type { WorkspaceRepository } from '@fvh/persistence';

export type SyncStep = 'outcomes' | 'messages' | null;
type RunStatus = { lastRunAt: string | null; ok: boolean | null; error: string | null };
export type BusinessSyncStatus = {
  step: SyncStep;
  outcomes: RunStatus & { checked: number };
  messages: RunStatus & { threads: number; selfId: string | null };
};

type Dependencies = {
  repository: WorkspaceRepository;
  readOwnBids: (ids: string[]) => Promise<FreelancerBidStatus[]>;
  readSelfId?: () => Promise<string>;
  readThreads?: (selfId: string) => Promise<FreelancerLatestMessage[]>;
  now?: () => Date;
  intervalMs?: number;
};

function safeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message.replace(/\b(?:token|bearer|authorization)\b[^\s]*/gi, '[redacted]').slice(0, 200) : fallback;
}

/** Read-only background sync of bid outcomes and client messages; runs regardless of the bidding policy. */
export class BusinessSync {
  private readonly now: () => Date;
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private status: BusinessSyncStatus = {
    step: null,
    outcomes: { lastRunAt: null, ok: null, error: null, checked: 0 },
    messages: { lastRunAt: null, ok: null, error: null, threads: 0, selfId: null },
  };

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.intervalMs = dependencies.intervalMs ?? 600_000;
  }

  getStatus(): BusinessSyncStatus {
    return { step: this.status.step, outcomes: { ...this.status.outcomes }, messages: { ...this.status.messages } };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.runAll(); }, this.intervalMs);
    this.timer.unref();
    void this.runAll();
  }

  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }

  async runAll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.syncOutcomes();
      await this.syncMessages();
    } finally {
      this.running = false;
    }
  }

  async syncOutcomes(): Promise<void> {
    const { repository } = this.dependencies;
    this.status.step = 'outcomes';
    const lastRunAt = this.now().toISOString();
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
            title: project?.title ?? 'Proyek Freelancer', client: project?.clientName ?? 'Klien Freelancer', source: 'freelancer',
            externalProjectId: previous.projectId, status: 'active', deadline: null, value: previous.amount,
            currency: previous.currency ?? project?.currency ?? 'USD',
          });
          if (created) await repository.appendAudit({ type: 'work.project_created', resourceId: created.id, status: 'recorded', reason: 'Proyek aktif dibuat dari bid yang menang.', policyVersion: null, payloadHash: null });
        }
      }
      this.status.outcomes = { lastRunAt, ok: true, error: null, checked };
    } catch (error) {
      this.status.outcomes = { lastRunAt, ok: false, error: safeError(error, 'Gagal sinkronisasi hasil bid.'), checked: 0 };
    } finally {
      this.status.step = null;
    }
  }

  async syncMessages(): Promise<void> {
    const { readSelfId, readThreads, repository } = this.dependencies;
    if (!readSelfId || !readThreads) return;
    this.status.step = 'messages';
    const lastRunAt = this.now().toISOString();
    try {
      const selfId = this.status.messages.selfId ?? await readSelfId();
      const messages = await readThreads(selfId);
      await repository.upsertClientThreads(messages.map((message) => ({
        threadId: String(message.threadId), projectId: message.projectId, lastSenderId: message.senderId,
        lastMessageAt: message.createdAt, preview: message.message.slice(0, 200), syncedAt: lastRunAt,
      })));
      this.status.messages = { lastRunAt, ok: true, error: null, threads: messages.length, selfId };
    } catch (error) {
      this.status.messages = { ...this.status.messages, lastRunAt, ok: false, error: safeError(error, 'Gagal sinkronisasi pesan.') };
    } finally {
      this.status.step = null;
    }
  }
}
