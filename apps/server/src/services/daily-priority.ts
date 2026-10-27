import { randomUUID } from 'node:crypto';
import { currencyDigits, invoiceBalance, toMinor, type Invoice, type OwnerTask, type TeamBriefing } from '@fvh/domain';
import { OperationsRepository, type ClientProject, type ClientThread, type Payment, type WorkspaceRepository } from '@fvh/persistence';
import type { DailyPrioritySummary, PriorityItem, PrioritySource, PrioritySourceKey } from '../models/daily-priority-types.js';

type MessageStatus = { lastRunAt: string | null; ok: boolean | null; selfId: string | null };
type BoardSnapshot = { available: boolean; reason: string; checkedAt: string; tasks: Array<{ id: string; title: string; status: string; goalStatus?: string | undefined }> };
type Inputs = {
  projects: ClientProject[]; threads: ClientThread[]; tasks: OwnerTask[]; invoices: Invoice[];
  payments: Payment[]; reports: TeamBriefing[]; kanban: BoardSnapshot | null;
  selfId: string | null;
};
type Read<T> = { value: T | null; source: PrioritySource };
const WIB = 'Asia/Jakarta';
export const jakartaDay = (date: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: WIB, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const dayOffset = (day: string, amount: number) => new Date(`${day}T00:00:00Z`).getTime() + amount * 86_400_000;
const daysUntil = (day: string, target: string) => Math.round((Date.parse(`${target}T00:00:00Z`) - dayOffset(day, 0)) / 86_400_000);
const short = (value: string) => value.trim().slice(0, 160) || 'Tanpa judul';
const money = (minor: number, currency: string) => `${currency} ${(minor / 10 ** currencyDigits(currency)).toLocaleString('id-ID', { maximumFractionDigits: currencyDigits(currency) })}`;
const available = (observedAt: string): PrioritySource => ({ state: 'available', observedAt, reason: null });
const unavailable = (state: PrioritySource['state'], reason: string, observedAt: string | null = null): PrioritySource => ({ state, observedAt, reason });
const SOURCE_KEYS: PrioritySourceKey[] = ['messages', 'projects', 'tasks', 'invoices', 'payments', 'kanban', 'reports'];

export function buildDailyPriority(day: string, revision: number, capturedAt: string, inputs: Inputs, sources: Record<PrioritySourceKey, PrioritySource>): DailyPrioritySummary {
  const ranked: Array<{ rank: number; item: PriorityItem }> = [];
  const add = (rank: number, item: PriorityItem) => ranked.push({ rank, item });
  const base = (source: PrioritySourceKey, sourceId: string, kind: PriorityItem['kind'], title: string, reason: string, decision: string, href: string, dueAt: string | null, rule: string, observedAt = sources[source].observedAt ?? capturedAt): PriorityItem =>
    ({ id: `${source}:${sourceId}`, source, sourceId, kind, title: short(title), reason, decision, href, dueAt, rule, observedAt });

  if (sources.projects.state === 'available') for (const project of inputs.projects) {
    if (project.status !== 'active' || !project.deadline) continue;
    const days = daysUntil(day, project.deadline);
    if (days > 2) continue;
    const reason = days < 0 ? `Tenggat proyek lewat ${-days} hari.` : days === 0 ? 'Tenggat proyek hari ini.' : `Tenggat proyek dalam ${days} hari.`;
    add(days < 0 ? 0 : days === 0 ? 5 : 7, base('projects', project.id, 'deadline', `Periksa tenggat ${project.title}`, reason, 'Tentukan progres dan langkah penyelesaian.', '/work', project.deadline, days < 0 ? 'overdue_deadline' : 'upcoming_deadline'));
  }
  if (sources.tasks.state === 'available') for (const task of inputs.tasks) {
    if (task.done) continue;
    const dueDay = jakartaDay(new Date(task.endAt));
    const days = daysUntil(day, dueDay);
    if (days > 2) continue;
    const reason = days < 0 ? `Jadwal tugas lewat ${-days} hari.` : days === 0 ? 'Jadwal tugas berakhir hari ini.' : `Jadwal tugas berakhir dalam ${days} hari.`;
    add(days < 0 ? 1 : days === 0 ? 5 : 7, base('tasks', task.id, 'task', task.title, reason, 'Kerjakan atau perbarui jadwal tugas.', '/operations', task.endAt, days < 0 ? 'overdue_task' : 'upcoming_task'));
  }
  if (sources.invoices.state === 'available' && sources.payments.state === 'available') {
    const latest = new Map<string, Invoice>();
    for (const invoice of inputs.invoices) {
      const previous = latest.get(invoice.projectId);
      if (!previous || `${invoice.issuedOn}:${invoice.createdAt}:${invoice.id}` > `${previous.issuedOn}:${previous.createdAt}:${previous.id}`) latest.set(invoice.projectId, invoice);
    }
    for (const invoice of latest.values()) {
      const project = inputs.projects.find(row => row.id === invoice.projectId);
      if (project?.status === 'closed') continue;
      const remaining = invoiceBalance(invoice, inputs.payments.filter(row => row.projectId === invoice.projectId)).remainingMinor;
      const days = daysUntil(day, invoice.dueOn);
      if (!remaining || days > 2) continue;
      const reason = `${days < 0 ? `Invoice lewat ${-days} hari` : days === 0 ? 'Invoice jatuh tempo hari ini' : `Invoice jatuh tempo dalam ${days} hari`}; sisa ${money(remaining, invoice.currency)} menurut pembayaran tercatat.`;
      add(days < 0 ? 2 : days === 0 ? 6 : 7, base('invoices', invoice.id, 'invoice', `Periksa ${invoice.number}`, reason, 'Periksa pembayaran sebelum menindaklanjuti tagihan.', '/operations', invoice.dueOn, days < 0 ? 'overdue_invoice' : 'upcoming_invoice'));
    }
    for (const payment of inputs.payments) {
      if (payment.status !== 'expected' || !payment.dueDate || latest.has(payment.projectId)) continue;
      const project = inputs.projects.find(row => row.id === payment.projectId);
      if (project?.status === 'closed') continue;
      const days = daysUntil(day, payment.dueDate);
      if (days > 2) continue;
      const reason = `${days < 0 ? `Pembayaran diharapkan lewat ${-days} hari` : days === 0 ? 'Pembayaran diharapkan hari ini' : `Pembayaran diharapkan dalam ${days} hari`}; ${money(toMinor(payment.amount, payment.currency), payment.currency)} belum ditandai diterima.`;
      add(days < 0 ? 2 : days === 0 ? 6 : 7, base('payments', payment.id, 'payment', `Periksa pembayaran ${project?.title ?? payment.projectId}`, reason, 'Verifikasi penerimaan atau perbarui catatan pembayaran.', '/work', payment.dueDate, days < 0 ? 'overdue_payment' : 'upcoming_payment'));
    }
  }
  if (sources.messages.state === 'available' && inputs.selfId) for (const thread of inputs.threads) {
    if (thread.lastSenderId === inputs.selfId) continue;
    add(3, base('messages', thread.threadId, 'reply', `Balas percakapan Freelancer #${thread.threadId}`, 'Pesan terakhir yang teramati berasal dari pihak lain; isi lengkap dan riwayat tidak tersedia di ringkasan.', 'Baca percakapan dan putuskan balasan.', '/inbox', null, 'reply_waiting', thread.syncedAt));
  }
  if (sources.kanban.state === 'available') for (const card of inputs.kanban?.tasks ?? []) {
    if (card.status !== 'blocked' && card.status !== 'triage' && card.goalStatus !== 'blocked') continue;
    add(4, base('kanban', card.id, 'blocker', `Tinjau hambatan ${card.title}`, 'Kartu Hermes tercatat terhambat pada board.', 'Buka kartu dan tentukan cara membuka hambatan.', '/tasks', null, 'blocked_card', inputs.kanban?.checkedAt));
  }
  ranked.sort((a, b) => a.rank - b.rank || (a.item.dueAt ?? '9999').localeCompare(b.item.dueAt ?? '9999') || a.item.id.localeCompare(b.item.id));
  const reports = inputs.reports.filter(report => jakartaDay(new Date(report.createdAt)) === day).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latestReports = [1, 2].flatMap(floor => reports.find(report => report.floor === floor) ?? []);
  return {
    day, revision, capturedAt, state: SOURCE_KEYS.every(key => sources[key].state === 'available') ? 'complete' : 'partial', sources,
    reports: latestReports.map(report => ({ id: report.id, floor: report.floor, createdAt: report.createdAt, state: report.state })),
    items: ranked.map(row => row.item),
  };
}

export class DailyPriorityService {
  private readonly store: OperationsRepository;
  private readonly claimant = `chief-of-staff:${randomUUID()}`;
  private messageStatus: (() => Promise<MessageStatus | null>) | null = null;
  private kanban: (() => Promise<BoardSnapshot | null>) | null = null;
  constructor(private readonly options: { repository: WorkspaceRepository; now: () => Date }) {
    this.store = new OperationsRepository(options.repository.sql);
  }
  setSources(sources: { messageStatus: () => Promise<MessageStatus | null>; kanban: () => Promise<BoardSnapshot | null> }): void {
    this.messageStatus = sources.messageStatus;
    this.kanban = sources.kanban;
  }
  day(): string { return jakartaDay(this.options.now()); }
  get(): Promise<DailyPrioritySummary | null> { return this.store.dailyPriority<DailyPrioritySummary>(this.day()); }
  async refresh(force = false): Promise<DailyPrioritySummary | null> {
    const day = this.day();
    const current = await this.store.dailyPriority<DailyPrioritySummary>(day);
    if (current && !force) return current;
    const revision = (current?.revision ?? 0) + 1;
    const sourceId = `daily-priority:v1:${day}:${revision}`;
    const repository = this.options.repository;
    const created = await repository.createMission({ source: 'client_operations', sourceId, kind: 'daily_priority', title: `Prioritas harian ${day}`, priority: 'normal', assignedTo: 'fvh-chief-of-staff' });
    const mission = created ?? await this.store.dailyPriorityMission(sourceId);
    if (!mission) throw new Error('Mission prioritas harian tidak ditemukan.');
    const claimed = await repository.claimMission(mission.id, { claimant: this.claimant, leaseSeconds: 120 });
    if (!claimed) return this.store.dailyPriority<DailyPrioritySummary>(day);
    try {
      if (mission.status === 'queued') await repository.updateMissionStatus(mission.id, { status: 'in_progress' });
      const read = async <T>(fn: () => Promise<T>): Promise<Read<T>> => {
        try { const value = await fn(); return { value, source: available(this.options.now().toISOString()) }; }
        catch { return { value: null, source: unavailable('failed', 'Data tersimpan tidak dapat dibaca.', this.options.now().toISOString()) }; }
      };
      const [projects, threads, tasks, invoices, payments, reports] = await Promise.all([
        read(() => repository.listClientProjects()), read(() => repository.listClientThreads()), read(() => this.store.list<OwnerTask>('task')),
        read(() => this.store.list<Invoice>('invoice')), read(() => repository.listPayments()), read(() => this.store.list<TeamBriefing>('briefing')),
      ]);
      const syncRead = this.messageStatus ? await read(this.messageStatus) : { value: null, source: unavailable('unknown', 'Status sinkronisasi belum tersedia.') };
      const boardRead = this.kanban ? await read(this.kanban) : { value: null, source: unavailable('unknown', 'Board Hermes belum diperiksa.') };
      const capturedAt = this.options.now().toISOString();
      const sync = syncRead.value;
      const messages = !threads.value ? threads.source : syncRead.source.state === 'failed' ? syncRead.source : !sync || !sync.selfId || sync.ok === null ? unavailable('unknown', 'Status sinkronisasi atau identitas akun belum tersedia.', sync?.lastRunAt ?? null) :
        sync.ok === false ? unavailable('failed', 'Sinkronisasi pesan terakhir gagal.', sync.lastRunAt) :
        !sync.lastRunAt || Date.parse(capturedAt) - Date.parse(sync.lastRunAt) > 5 * 60_000 ? unavailable('stale', 'Sinkronisasi pesan lebih dari lima menit.', sync.lastRunAt) : available(sync.lastRunAt);
      const board = boardRead.value;
      const kanban = boardRead.source.state === 'failed' ? boardRead.source : !board ? unavailable('unknown', 'Board Hermes belum diperiksa.') : !board.available ? unavailable('failed', board.reason, board.checkedAt) :
        Date.parse(capturedAt) - Date.parse(board.checkedAt) > 60_000 ? unavailable('stale', 'Pemeriksaan board lebih dari satu menit.', board.checkedAt) : available(board.checkedAt);
      const sources = { messages, projects: projects.source, tasks: tasks.source, invoices: invoices.source, payments: payments.source, kanban, reports: reports.source };
      const summary = buildDailyPriority(day, revision, capturedAt, {
        projects: projects.value ?? [], threads: threads.value ?? [], tasks: tasks.value ?? [], invoices: invoices.value ?? [],
        payments: payments.value ?? [], reports: reports.value ?? [], kanban: board, selfId: sync?.selfId ?? null,
      }, sources);
      if (!await this.store.saveDailyPriorityWithLease(mission.id, this.claimant, claimed.lease.leaseId, summary)) throw new Error('Lease prioritas harian kedaluwarsa atau revisi sudah tersimpan.');
      return summary;
    } finally {
      await repository.releaseMissionLease(mission.id, { claimant: this.claimant, leaseId: claimed.lease.leaseId });
    }
  }
}
