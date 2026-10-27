import { HermesKanban, type HermesKanbanTask } from './hermes-kanban.js';

export type DiscordCalendarTask = { id: string; title: string; projectId: string | null; startAt: string; endAt: string; timezone: string; notes: string; done: boolean; updatedAt: string };

export type DiscordConfig = {
  token: string;
  guildId: string;
  applicationId: string;
  categoryName?: string;
  channelName?: string;
  calendarChannelName?: string;
};

type DiscordChannel = { id: string; name: string; type: number; parent_id?: string | null };
type DiscordMessage = { id: string; author?: { id?: string }; embeds?: Array<{ footer?: { text?: string } }> };
type DiscordCalendarMessage = { id: string; author?: { id?: string }; embeds?: Array<{ footer?: { text?: string } }> };

const API = 'https://discord.com/api/v10';
const categoryType = 4;
const textType = 0;
const footer = (id: string) => `Mission Control · ${id}`;
const normalIntervalMs = 30_000;
// Jeda antar siklus setelah gagal berturut-turut: 30 dtk, lalu 2 mnt, lalu 5 mnt.
const retryDelaysMs = [normalIntervalMs, 120_000, 300_000];

class DiscordApiError extends Error {
  constructor(readonly status: number) {
    super(`Discord API ${status}`);
    this.name = 'DiscordApiError';
  }
}

export function discordTaskEmbed(task: HermesKanbanTask) {
  const state = task.status === 'done' ? 'Selesai' : task.status === 'running' ? 'Dikerjakan' : task.status === 'blocked' || task.status === 'triage' ? 'Butuh Anda' : task.status === 'failed' ? 'Gagal' : 'Antre';
  const color = state === 'Selesai' ? 0x2f855a : state === 'Butuh Anda' || state === 'Gagal' ? 0xc53030 : state === 'Dikerjakan' ? 0xd69e2e : 0x718096;
  return {
    title: task.title.slice(0, 256),
    description: `Kartu ${task.id} pada board Hermes **fvh-house**.`,
    color,
    fields: [
      { name: 'Status', value: state, inline: true },
      { name: 'Petugas', value: task.assignee ?? 'Belum ditentukan', inline: true },
      { name: 'Dibuat', value: task.createdAt ? `<t:${Math.floor(Date.parse(task.createdAt) / 1000)}:f>` : 'Tidak diketahui', inline: false },
      ...(task.startedAt ? [{ name: 'Mulai', value: `<t:${Math.floor(Date.parse(task.startedAt) / 1000)}:f>`, inline: true }] : []),
      ...(task.completedAt ? [{ name: 'Selesai', value: `<t:${Math.floor(Date.parse(task.completedAt) / 1000)}:f>`, inline: true }] : []),
      ...(task.goalStatus ? [{ name: 'Tujuan', value: task.goalStatus, inline: true }] : []),
      ...(task.resultId ? [{ name: 'Kartu hasil', value: task.resultId, inline: true }] : []),
      ...(task.error ? [{ name: 'Catatan', value: task.error.slice(0, 1024), inline: false }] : []),
    ],
    footer: { text: footer(task.id) },
    timestamp: task.completedAt ?? task.startedAt ?? task.createdAt ?? undefined,
  };
}

export function discordCalendarEmbed(task: DiscordCalendarTask) {
  return {
    title: `${task.done ? '✓ ' : ''}${task.title}`.slice(0, 256),
    description: task.notes ? task.notes.slice(0, 4096) : 'Tidak ada catatan tambahan.',
    color: task.done ? 0x2f855a : 0x3867d6,
    fields: [
      { name: 'Mulai', value: `<t:${Math.floor(Date.parse(task.startAt) / 1000)}:F>`, inline: false },
      { name: 'Selesai', value: `<t:${Math.floor(Date.parse(task.endAt) / 1000)}:F>`, inline: false },
      { name: 'Zona waktu', value: task.timezone, inline: true },
      { name: 'Proyek', value: task.projectId ?? 'Tidak terkait proyek', inline: true },
      { name: 'Status', value: task.done ? 'Selesai' : 'Terjadwal', inline: true },
    ],
    footer: { text: `Mission Control · calendar:${task.id}` },
    timestamp: task.updatedAt,
  };
}

export class DiscordKanbanMonitor {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private syncing: Promise<void> | null = null;
  private started = false;
  private failures = 0;
  private lastLoggedError: string | null = null;

  constructor(private readonly config: DiscordConfig, private readonly kanban: HermesKanban | undefined, private readonly getCalendarTasks: () => Promise<DiscordCalendarTask[]> = async () => [], private readonly fetcher: typeof fetch = fetch) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.failures = 0;
    this.lastLoggedError = null;
    this.runCycle();
  }

  stop(): void {
    this.started = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.failures = 0;
    this.lastLoggedError = null;
  }

  sync(): Promise<void> {
    if (this.syncing) return this.syncing;
    this.syncing = this.runSync()
      .then(() => this.succeeded())
      .catch((error: unknown) => this.failed(error))
      .finally(() => { this.syncing = null; });
    return this.syncing;
  }

  // Satu siklus pada satu waktu: timer dipasang setelah siklus selesai, jadi siklus lambat tidak menumpuk.
  private runCycle(): void {
    void this.sync().finally(() => this.arm(this.retryDelayMs()));
  }

  private arm(delayMs: number): void {
    if (!this.started) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; this.runCycle(); }, delayMs);
    this.timer.unref();
  }

  private retryDelayMs(): number {
    return retryDelaysMs[Math.min(Math.max(this.failures - 1, 0), retryDelaysMs.length - 1)]!;
  }

  private succeeded(): void {
    if (this.lastLoggedError !== null) console.log('Sinkronisasi Discord pulih.');
    this.failures = 0;
    this.lastLoggedError = null;
  }

  private failed(error: unknown): void {
    this.failures += 1;
    const message = error instanceof Error ? error.message : 'tidak diketahui';
    // Satu baris per kegagalan yang berbeda; siklus berikutnya dengan galat sama tidak menulis ulang log.
    if (message === this.lastLoggedError) return;
    this.lastLoggedError = message;
    console.error(`Sinkronisasi Discord gagal: ${message} (dicoba lagi tiap ${Math.round(this.retryDelayMs() / 1000)} dtk)`);
  }

  private async request<T>(path: string, init?: RequestInit, attempt = 0): Promise<T> {
    const response = await this.fetcher(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bot ${this.config.token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (response.status === 429 && attempt < 2) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '1');
      await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(retryAfter * 1000, 250), 15_000)));
      return this.request<T>(path, init, attempt + 1);
    }
    if (!response.ok) throw new DiscordApiError(response.status);
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  }

  private async runSync(): Promise<void> {
    const board = this.kanban ? await this.kanban.status() : null;
    const category = await this.ensureCategory();
    await this.syncCalendar(category);
    if (!board?.available) return;
    const channel = await this.ensureChannel(category);
    const messages = await this.request<DiscordMessage[]>(`/channels/${channel.id}/messages?limit=100`);
    const byTask = new Map(messages.flatMap(message => {
      if (message.author?.id !== this.config.applicationId) return [];
      const id = message.embeds?.[0]?.footer?.text?.match(/· (t_[a-f0-9]+)$/)?.[1];
      return id ? [[id, message] as const] : [];
    }));
    const currentIds = new Set(board.tasks.map(task => task.id));
    for (const [id, message] of byTask) {
      if (!currentIds.has(id)) await this.request(`/channels/${channel.id}/messages/${message.id}`, { method: 'DELETE' });
    }
    for (const task of board.tasks) {
      const payload = { embeds: [discordTaskEmbed(task)] };
      const existing = byTask.get(task.id);
      if (existing) await this.request(`/channels/${channel.id}/messages/${existing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await this.request(`/channels/${channel.id}/messages`, { method: 'POST', body: JSON.stringify(payload) });
    }
  }

  private async syncCalendar(category: DiscordChannel): Promise<void> {
    const channel = await this.ensureNamedChannel(category, this.config.calendarChannelName ?? 'kalender');
    const tasks = await this.getCalendarTasks();
    const messages = await this.request<DiscordCalendarMessage[]>(`/channels/${channel.id}/messages?limit=100`);
    const byTask = new Map(messages.flatMap(message => {
      if (message.author?.id !== this.config.applicationId) return [];
      const id = message.embeds?.[0]?.footer?.text?.match(/· calendar:(.+)$/)?.[1];
      return id ? [[id, message] as const] : [];
    }));
    const currentIds = new Set(tasks.map(task => task.id));
    for (const [id, message] of byTask) if (!currentIds.has(id)) await this.request(`/channels/${channel.id}/messages/${message.id}`, { method: 'DELETE' });
    for (const task of tasks) {
      const payload = { embeds: [discordCalendarEmbed(task)] };
      const existing = byTask.get(task.id);
      if (existing) await this.request(`/channels/${channel.id}/messages/${existing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await this.request(`/channels/${channel.id}/messages`, { method: 'POST', body: JSON.stringify(payload) });
    }
  }

  private async ensureCategory(): Promise<DiscordChannel> {
    const channels = await this.request<DiscordChannel[]>(`/guilds/${this.config.guildId}/channels`);
    const name = this.config.categoryName ?? 'mission-control';
    const existing = channels.find(channel => channel.type === categoryType && channel.name === name);
    if (existing) return existing;
    return this.request<DiscordChannel>(`/guilds/${this.config.guildId}/channels`, { method: 'POST', body: JSON.stringify({ name, type: categoryType }) });
  }

  private async ensureNamedChannel(category: DiscordChannel, name: string): Promise<DiscordChannel> {
    const channels = await this.request<DiscordChannel[]>(`/guilds/${this.config.guildId}/channels`);
    const existing = channels.find(channel => channel.type === textType && channel.name === name && channel.parent_id === category.id);
    return existing ?? this.request<DiscordChannel>(`/guilds/${this.config.guildId}/channels`, { method: 'POST', body: JSON.stringify({ name, type: textType, parent_id: category.id, topic: name === 'kalender' ? 'Kalender Mission Control.' : 'Monitoring kartu Papan Tugas Mission Control.' }) });
  }

  private ensureChannel(category: DiscordChannel): Promise<DiscordChannel> {
    return this.ensureNamedChannel(category, this.config.channelName ?? 'papan-tugas');
  }
}
