import { HermesKanban, type HermesKanbanTask } from './hermes-kanban.js';

export type DiscordConfig = {
  token: string;
  guildId: string;
  applicationId: string;
  categoryName?: string;
  channelName?: string;
};

type DiscordChannel = { id: string; name: string; type: number; parent_id?: string | null };
type DiscordMessage = { id: string; embeds?: Array<{ footer?: { text?: string } }> };

const API = 'https://discord.com/api/v10';
const categoryType = 4;
const textType = 0;
const footer = (id: string) => `Mission Control · ${id}`;

export function discordTaskEmbed(task: HermesKanbanTask) {
  const state = task.status === 'done' ? 'Selesai' : task.status === 'running' ? 'Dikerjakan' : task.status === 'blocked' || task.status === 'triage' ? 'Butuh Anda' : task.status === 'failed' ? 'Gagal' : 'Antre';
  const color = state === 'Selesai' ? 0x2f855a : state === 'Butuh Anda' || state === 'Gagal' ? 0xc53030 : state === 'Dikerjakan' ? 0xd69e2e : 0x718096;
  return {
    title: task.title.slice(0, 256),
    color,
    fields: [
      { name: 'Status', value: state, inline: true },
      { name: 'Petugas', value: task.assignee ?? 'Belum ditentukan', inline: true },
      ...(task.error ? [{ name: 'Catatan', value: task.error.slice(0, 1024), inline: false }] : []),
    ],
    footer: { text: footer(task.id) },
    timestamp: task.completedAt ?? task.startedAt ?? task.createdAt ?? undefined,
  };
}

export class DiscordKanbanMonitor {
  private timer: ReturnType<typeof setInterval> | undefined;
  private channelId: string | null = null;
  private syncing: Promise<void> | null = null;

  constructor(private readonly config: DiscordConfig, private readonly kanban: HermesKanban, private readonly fetcher: typeof fetch = fetch) {}

  start(): void {
    if (this.timer) return;
    void this.sync();
    this.timer = setInterval(() => { void this.sync(); }, 30_000);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  sync(): Promise<void> {
    if (this.syncing) return this.syncing;
    this.syncing = this.runSync().catch(error => console.error(`Sinkronisasi Discord gagal: ${error instanceof Error ? error.message : 'tidak diketahui'}`)).finally(() => { this.syncing = null; });
    return this.syncing;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bot ${this.config.token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!response.ok) throw new Error(`Discord API ${response.status}`);
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  }

  private async runSync(): Promise<void> {
    const board = await this.kanban.status();
    if (!board.available) return;
    const category = await this.ensureCategory();
    const channel = await this.ensureChannel(category);
    const messages = await this.request<DiscordMessage[]>(`/channels/${channel.id}/messages?limit=100`);
    const byTask = new Map(messages.flatMap(message => {
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

  private async ensureCategory(): Promise<DiscordChannel> {
    const channels = await this.request<DiscordChannel[]>(`/guilds/${this.config.guildId}/channels`);
    const name = this.config.categoryName ?? 'mission-control';
    const existing = channels.find(channel => channel.type === categoryType && channel.name === name);
    if (existing) return existing;
    return this.request<DiscordChannel>(`/guilds/${this.config.guildId}/channels`, { method: 'POST', body: JSON.stringify({ name, type: categoryType }) });
  }

  private async ensureChannel(category: DiscordChannel): Promise<DiscordChannel> {
    if (this.channelId) return { id: this.channelId, name: this.config.channelName ?? 'monitoring-kartu', type: textType, parent_id: category.id };
    const channels = await this.request<DiscordChannel[]>(`/guilds/${this.config.guildId}/channels`);
    const name = this.config.channelName ?? 'monitoring-kartu';
    const existing = channels.find(channel => channel.type === textType && channel.name === name && channel.parent_id === category.id);
    const channel = existing ?? await this.request<DiscordChannel>(`/guilds/${this.config.guildId}/channels`, { method: 'POST', body: JSON.stringify({ name, type: textType, parent_id: category.id, topic: 'Monitoring kartu Papan Tugas Mission Control.' }) });
    this.channelId = channel.id;
    return channel;
  }
}
