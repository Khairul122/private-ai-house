import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { officeDiscussionOutputSchema, type OfficeDiscussionInput, type OfficeDiscussionOutput } from '@fvh/adapter-hermes';
import { OfficeLearningRepository, type WorkspaceRepository } from '@fvh/persistence';
import type { OfficeLearningSession, OfficeLearningStatus } from '../models/office-learning-types.js';

const INTERVAL = 30 * 60_000;
const DAILY_LIMIT = 12;
const sessionSchema = z.object({
  id: z.string(), startedAt: z.string().datetime(), completedAt: z.string().datetime().nullable(),
  participantIds: z.array(z.string()).length(2), topic: z.string().max(300),
  turns: z.array(z.object({ employeeId: z.string(), message: z.string().max(800) })).max(2),
  state: z.enum(['running', 'completed', 'failed']), error: z.string().nullable(),
});
const stateSchema = z.object({
  enabled: z.boolean(), nextRunAt: z.string().datetime().nullable(), cursor: z.number().int().nonnegative(),
  sessions: z.array(sessionSchema).max(60),
  memories: z.array(z.object({ employeeId: z.string(), lesson: z.string().max(400), sessionId: z.string(), createdAt: z.string().datetime() })).max(1000),
});
type Employee = OfficeDiscussionInput['employee'];
const day = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const nextDay = (date: Date) => {
  const jakarta = new Date(date.getTime() + 7 * 60 * 60_000);
  return new Date(Date.UTC(jakarta.getUTCFullYear(), jakarta.getUTCMonth(), jakarta.getUTCDate() + 1) - 7 * 60 * 60_000).toISOString();
};
export const TOPICS = [
  'Menyusun kriteria selesai yang dapat diuji sebelum menerima pekerjaan freelance.',
  'Menyampaikan ketidakpastian dan meminta informasi yang kurang secara ringkas.',
  'Berbagi kebiasaan belajar, fokus, dan istirahat yang membantu kerja tim.',
  'Meninjau risiko dan bukti sebelum menyampaikan klaim kepada klien.',
  'Membagi pekerjaan dan memberi masukan kepada rekan dengan contoh konkret.',
  'Mengubah pelajaran diskusi sebelumnya menjadi checklist yang bisa diperiksa.',
];

/**
 * Only work on the same Hermes CLI blocks a discussion: drafting/review calls (`hermesWork`) and
 * running kanban cards. Autopilot scans, BusinessSync and projects.co.id reads are HTTP-only, so
 * including them starved every session while autopilot ran.
 */
export function discussionBlocked(hermesWork: number, runningCards: number, discussionActive = false): boolean {
  return hermesWork > 0 || runningCards > 0 || discussionActive;
}

export class OfficeLearningService {
  private readonly store: OfficeLearningRepository;
  private state: z.infer<typeof stateSchema> = { enabled: true, nextRunAt: null, cursor: 0, sessions: [], memories: [] };
  private loaded: Promise<void> | null = null;
  private active: Promise<OfficeLearningStatus> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopping = false;
  private phase: OfficeLearningStatus['phase'] = 'idle';
  private speaker: string | null = null;
  private storageError = false;

  constructor(private readonly options: {
    repository: WorkspaceRepository;
    discuss: (input: OfficeDiscussionInput) => Promise<OfficeDiscussionOutput>;
    employees: readonly Employee[];
    available: () => boolean;
    busy: () => boolean;
    onSessionStateChange?: (active: boolean) => void;
    now?: () => Date;
  }) { this.store = new OfficeLearningRepository(options.repository.sql); }

  private now() { return this.options.now?.() ?? new Date(); }
  private load(): Promise<void> {
    this.loaded ??= (async () => {
      const stored = await this.store.read();
      if (stored !== null) this.state = stateSchema.parse(stored);
      // A stopped process cannot confirm its pending model call; preserve the attempt and its quota.
      for (const session of this.state.sessions) if (session.state === 'running') {
        session.state = 'failed'; session.error = 'Server berhenti sebelum diskusi selesai.'; session.completedAt = this.now().toISOString();
      }
      if (stored !== null) await this.store.save(this.state);
    })().catch(() => { this.storageError = true; });
    return this.loaded;
  }

  peek(): OfficeLearningStatus {
    const now = this.now();
    const available = this.options.available() && !this.storageError && this.options.employees.length >= 2;
    const running = this.state.sessions.find(session => session.state === 'running');
    const sessionsToday = this.state.sessions.filter(session => day(new Date(session.startedAt)) === day(now)).length;
    const reason = this.storageError ? 'Memori tidak dapat dibaca atau disimpan; pembelajaran dihentikan.'
      : !available ? 'Hermes atau tim belum tersedia.' : !this.state.enabled ? 'Pembelajaran dijeda.'
        : running ? 'Diskusi internal Hermes sedang berlangsung.' : this.options.busy() ? 'Menunggu pekerjaan aktif selesai.'
          : sessionsToday >= DAILY_LIMIT ? 'Batas 12 sesi hari ini tercapai.'
            : this.phase === 'error' ? 'Diskusi terakhir gagal. Sesi berikut mengikuti jadwal.' : 'Siap belajar pada jadwal berikutnya.';
    return {
      enabled: this.state.enabled, available, busy: !!running, reason, phase: this.phase,
      participantIds: running?.participantIds ?? [], activeSpeakerId: this.speaker,
      nextRunAt: !available || !this.state.enabled ? null : sessionsToday >= DAILY_LIMIT ? nextDay(now) : this.state.nextRunAt,
      lastRunAt: this.state.sessions[0]?.startedAt ?? null, sessionsToday, dailyLimit: DAILY_LIMIT, intervalMinutes: 30,
      sessions: structuredClone(this.state.sessions), memories: structuredClone(this.state.memories),
    };
  }
  async status(): Promise<OfficeLearningStatus> { await this.load(); return this.peek(); }
  async start(): Promise<void> {
    await this.load();
    if (this.timer) return;
    this.stopping = false;
    this.timer = setInterval(() => { void this.run(); }, 60_000);
    this.timer.unref();
    void this.run();
  }
  async close(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.active;
  }
  async setEnabled(enabled: boolean): Promise<OfficeLearningStatus> {
    await this.load();
    if (this.storageError) throw new Error('Memori pembelajaran tidak tersedia.');
    const previous = this.state.enabled;
    this.state.enabled = enabled;
    try { await this.store.save(this.state); }
    catch { this.state.enabled = previous; throw new Error('Pengaturan pembelajaran tidak dapat disimpan.'); }
    return this.peek();
  }
  run(force = false): Promise<OfficeLearningStatus> {
    if (this.active) return this.active;
    this.active = this.cycle(force).finally(() => { this.active = null; });
    return this.active;
  }
  private async cycle(force: boolean): Promise<OfficeLearningStatus> {
    await this.load();
    const status = this.peek();
    if (this.stopping || !status.available || !status.enabled || status.sessionsToday >= DAILY_LIMIT || this.options.busy()
      || (!force && this.state.nextRunAt !== null && Date.parse(this.state.nextRunAt) > this.now().getTime())) return status;
    const employees = this.options.employees;
    const first = employees[this.state.cursor % employees.length]!;
    const second = employees[(this.state.cursor + 1) % employees.length]!;
    const session: OfficeLearningSession = {
      id: randomUUID(), startedAt: this.now().toISOString(), completedAt: null, participantIds: [first.id, second.id],
      topic: TOPICS[this.state.cursor % TOPICS.length]!, turns: [], state: 'running', error: null,
    };
    this.state.cursor += 2;
    this.state.sessions = [session, ...this.state.sessions].slice(0, 60);
    this.state.nextRunAt = new Date(this.now().getTime() + INTERVAL).toISOString();
    try {
      // Reserve Hermes for both turns; another worker must not interrupt between speakers.
      this.options.onSessionStateChange?.(true);
      // Persist the quota reservation before any provider call so a restart cannot create free retries.
      await this.store.save(this.state);
      for (const [employee, colleague] of [[first, second], [second, first]] as const) {
        if (this.stopping || !this.state.enabled || !this.options.available()) throw new Error('interrupted');
        this.phase = session.turns.length ? 'discussing' : 'learning';
        this.speaker = employee.id;
        const output = officeDiscussionOutputSchema.parse(await this.options.discuss({
          employee, colleague, topic: session.topic,
          memories: this.state.memories.filter(memory => memory.employeeId === employee.id).map(memory => memory.lesson),
          previousMessage: session.turns[0]?.message ?? null,
        }));
        session.turns.push({ employeeId: employee.id, message: output.message });
        const personal = this.state.memories.filter(memory => memory.employeeId === employee.id).slice(-11);
        this.state.memories = [...this.state.memories.filter(memory => memory.employeeId !== employee.id), ...personal,
          { employeeId: employee.id, lesson: output.lesson, sessionId: session.id, createdAt: this.now().toISOString() }];
        await this.store.save(this.state);
      }
      session.state = 'completed'; this.phase = 'idle';
    } catch {
      session.state = 'failed'; session.error = 'Diskusi tidak selesai; pekerjaan aktif, jeda, atau gangguan Hermes.'; this.phase = 'error';
    } finally {
      this.options.onSessionStateChange?.(false);
      session.completedAt = this.now().toISOString(); this.speaker = null;
      try { await this.store.save(this.state); }
      catch { this.storageError = true; }
    }
    return this.peek();
  }
}
