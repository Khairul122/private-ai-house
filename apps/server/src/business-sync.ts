import type { FreelancerBidStatus } from '@fvh/adapter-freelancer';
import { bidOutcome } from '@fvh/domain';
import type { WorkspaceRepository } from '@fvh/persistence';

export type SyncStep = 'outcomes' | 'messages' | null;
export type BusinessSyncStatus = {
  step: SyncStep;
  outcomes: { lastRunAt: string | null; ok: boolean | null; error: string | null; checked: number };
};

type Dependencies = { repository: WorkspaceRepository; readOwnBids: (ids: string[]) => Promise<FreelancerBidStatus[]>; now?: () => Date; intervalMs?: number };

export class BusinessSync {
  private readonly now: () => Date;
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private status: BusinessSyncStatus = { step: null, outcomes: { lastRunAt: null, ok: null, error: null, checked: 0 } };

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.intervalMs = dependencies.intervalMs ?? 600_000;
  }

  getStatus(): BusinessSyncStatus { return { ...this.status, outcomes: { ...this.status.outcomes } }; }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.syncOutcomes(); }, this.intervalMs);
    this.timer.unref();
    void this.syncOutcomes();
  }

  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }

  async syncOutcomes(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const lastRunAt = this.now().toISOString();
    this.status = { step: 'outcomes', outcomes: { ...this.status.outcomes, lastRunAt, ok: null, error: null, checked: 0 } };
    try {
      const pending = this.dependencies.repository.listBidOutcomes().filter((row) => row.outcome === 'pending');
      if (!pending.length) {
        this.status = { step: null, outcomes: { ...this.status.outcomes, ok: true, checked: 0 } };
        return;
      }
      const byId = new Map(pending.map((row) => [row.bidId, row]));
      const bids = await this.dependencies.readOwnBids(pending.map((row) => row.bidId));
      let checked = 0;
      for (const bid of bids) {
        const previous = byId.get(bid.bidId);
        if (!previous) continue;
        const outcome = bidOutcome(bid.awardStatus, bid.retracted);
        this.dependencies.repository.updateBidOutcome(previous.projectId, { awardStatus: bid.awardStatus, outcome, checkedAt: this.now().toISOString() });
        checked += 1;
        if (outcome !== 'pending') {
          this.dependencies.repository.setPipelineStatus(previous.projectId, outcome);
          this.dependencies.repository.appendAudit({ type: 'bid.outcome_changed', resourceId: previous.projectId, status: 'recorded', reason: `Status bid di Freelancer: ${bid.awardStatus ?? (bid.retracted ? 'retracted' : 'tidak diketahui')}.`, policyVersion: null, payloadHash: null });
        }
      }
      this.status = { step: null, outcomes: { ...this.status.outcomes, ok: true, error: null, checked } };
    } catch (error) {
      const message = error instanceof Error ? error.message.replace(/\b(?:token|bearer|authorization)\b[^\s]*/gi, '[redacted]').slice(0, 200) : 'Gagal sinkronisasi hasil bid.';
      this.status = { step: null, outcomes: { ...this.status.outcomes, ok: false, error: message, checked: 0 } };
    } finally {
      this.running = false;
    }
  }
}
