import { buildDailyPriority, daysFromWibDay, wibDay } from '@fvh/domain';
import type { DailyPriority, DailyPriorityFacts, DailySourceState } from '@fvh/domain';
import type { WorkspaceRepository } from '@fvh/persistence';
import type { BusinessSync } from './business-sync.js';

export type DailyPriorityDependencies = {
  repository: WorkspaceRepository;
  now?: () => Date;
  businessSync?: BusinessSync | undefined;
};

const FOLLOW_UP_DAYS = 3;

type Collected<T> = { rows: T[]; source: DailySourceState };

/**
 * Builds the owner's daily list from stored records only. The summary is stored per Asia/Jakarta day;
 * a later call on the same day reuses it until the owner asks for an explicit refresh.
 */
export class DailyPriorityService {
  private readonly now: () => Date;
  private readonly repository: WorkspaceRepository;
  private readonly businessSync: BusinessSync | undefined;

  constructor(dependencies: DailyPriorityDependencies) {
    this.repository = dependencies.repository;
    this.now = dependencies.now ?? (() => new Date());
    this.businessSync = dependencies.businessSync;
  }

  async current(options: { regenerate?: boolean } = {}): Promise<DailyPriority> {
    const now = this.now();
    const day = wibDay(now);
    if (!options.regenerate) {
      const stored = await this.repository.getDailyPriority(day);
      if (stored) return stored;
    }
    const summary = await this.build(day, now);
    return this.repository.saveDailyPriority(summary);
  }

  private async collect<T>(name: string, read: () => Promise<T[]>): Promise<Collected<T>> {
    try {
      const rows = await read();
      return { rows, source: { name, status: 'ok', lastRunAt: this.now().toISOString(), note: null } };
    } catch (error) {
      return {
        rows: [],
        source: {
          name, status: 'failed', lastRunAt: null,
          note: error instanceof Error ? error.message.slice(0, 200) : 'Sumber gagal dibaca.',
        },
      };
    }
  }

  private async build(day: string, now: Date): Promise<DailyPriority> {
    const [threads, outcomes, payments, projects, missions] = await Promise.all([
      this.collect('Pesan klien', () => this.repository.listClientThreads()),
      this.collect('Tindak lanjut bid', () => this.repository.listBidOutcomes()),
      this.collect('Pembayaran', () => this.repository.listPayments()),
      this.collect('Proyek aktif', () => this.repository.listClientProjects()),
      this.collect('Antrean mission', () => this.repository.listMissions()),
    ]);

    const sync = this.businessSync?.getStatus().messages ?? null;
    const selfId = sync?.selfId ?? null;
    const syncSource: DailySourceState = sync === null
      ? { name: 'Sinkronisasi pesan', status: 'unknown', lastRunAt: null, note: 'BusinessSync tidak tersedia di server ini.' }
      : {
          name: 'Sinkronisasi pesan',
          status: sync.ok === false ? 'failed' : selfId === null ? 'unknown' : sync.lastRunAt ? 'ok' : 'unknown',
          lastRunAt: sync.lastRunAt,
          note: sync.ok === false ? sync.error ?? 'Sinkronisasi pesan gagal.' : selfId === null ? 'ID akun belum tersimpan.' : null,
        };

    const projectTitles = new Map(projects.rows.map((project) => [project.id, project.title]));
    const conversations = new Set(threads.rows.flatMap((thread) => (thread.projectId ? [`freelancer:${thread.projectId}`] : [])));
    const nowMs = now.getTime();

    const facts: DailyPriorityFacts = {
      // Owner identity is required to tell an inbound message from our own reply; without it, no waiting-message claims.
      messages: selfId === null ? [] : threads.rows
        .filter((thread) => thread.lastSenderId !== selfId)
        .map((thread) => ({
          threadId: thread.threadId,
          projectTitle: thread.projectId ? (projectTitles.get(`freelancer:${thread.projectId}`) ?? null) : null,
          waitingHours: Math.max(0, Math.floor((nowMs - Date.parse(thread.lastMessageAt)) / 3_600_000)),
          lastMessageAt: thread.lastMessageAt,
        }))
        .filter((thread) => Number.isFinite(thread.waitingHours)),
      followUps: outcomes.rows
        .filter((row) => row.outcome === 'pending' && !conversations.has(row.projectId))
        .map((row) => ({
          projectId: row.projectId,
          title: projectTitles.get(row.projectId) ?? row.projectId,
          daysSinceBid: Math.floor((nowMs - Date.parse(row.submittedAt)) / 86_400_000),
          submittedAt: row.submittedAt,
        }))
        .filter((row) => Number.isFinite(row.daysSinceBid) && row.daysSinceBid >= FOLLOW_UP_DAYS),
      payments: payments.rows.map((payment) => ({
        id: payment.id,
        projectTitle: projectTitles.get(payment.projectId) ?? 'Proyek tidak ditemukan',
        amount: payment.amount,
        currency: payment.currency,
        dueDate: payment.dueDate,
        status: payment.status,
      })),
      deadlines: projects.rows.map((project) => ({
        id: project.id,
        title: project.title,
        deadline: project.deadline,
        daysToDeadline: project.deadline ? daysFromWibDay(day, `${project.deadline}T00:00:00.000Z`) : null,
        status: project.status,
      })),
      missions: missions.rows.map((mission) => ({
        id: mission.id, title: mission.title, priority: mission.priority, dueAt: mission.dueAt, status: mission.status,
      })),
    };

    return buildDailyPriority({
      facts, day, generatedAt: now.toISOString(),
      sources: [syncSource, threads.source, outcomes.source, payments.source, projects.source, missions.source],
    });
  }
}
