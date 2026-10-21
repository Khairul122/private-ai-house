import type { LiveTopic } from '@fvh/domain';
import type { Database, Queryable } from '@fvh/persistence';

export type { LiveTopic };
type Listener = (topics: LiveTopic[]) => void;
type Watched = { topics: LiveTopic[]; read: () => unknown; last: string };

const sample = (read: () => unknown) => { try { return JSON.stringify(read()) ?? 'undefined'; } catch { return 'unreadable'; } };

/**
 * In-process change feed for the SSE stream. Emits are coalesced: the first emit opens a window of
 * `delayMs` and every topic emitted inside it goes out as one event, so an autopilot cycle writing
 * hundreds of audit rows reaches each browser as at most one event per window.
 */
export class LiveEvents {
  private readonly listeners = new Set<Listener>();
  private readonly pending = new Set<LiveTopic>();
  private readonly watched: Watched[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private watchTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly delayMs = 250, private readonly watchMs = 500) {}

  emit(...topics: LiveTopic[]): void {
    if (!this.listeners.size || !topics.length) return;
    for (const topic of topics) this.pending.add(topic);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), this.delayMs);
    this.flushTimer.unref?.();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (!this.watchTimer && this.watched.length) {
      for (const item of this.watched) item.last = sample(item.read);
      this.watchTimer = setInterval(() => this.check(), this.watchMs);
      this.watchTimer.unref?.();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size) return;
      clearInterval(this.watchTimer);
      this.watchTimer = undefined;
    };
  }

  /**
   * In-memory worker state (cycle running, step, browser state) has no write to hook, so it is
   * sampled while at least one browser listens and announced when its JSON changes.
   * ponytail: sampling adds up to `watchMs` latency; push from the services if that ever matters.
   */
  watch(topics: LiveTopic[], read: () => unknown): void {
    this.watched.push({ topics, read, last: this.watchTimer ? sample(read) : '' });
  }

  close(): void {
    clearTimeout(this.flushTimer);
    clearInterval(this.watchTimer);
    this.flushTimer = this.watchTimer = undefined;
    this.pending.clear();
    this.listeners.clear();
  }

  private check(): void {
    for (const item of this.watched) {
      const next = sample(item.read);
      if (next === item.last) continue;
      item.last = next;
      this.emit(...item.topics);
    }
  }

  private flush(): void {
    this.flushTimer = undefined;
    const topics = [...this.pending].sort();
    this.pending.clear();
    for (const listener of this.listeners) {
      try { listener(topics); } catch { /* one broken stream must not stop the others */ }
    }
  }
}

/** Tables -> data areas whose cards read them. Tables not listed (workspaces, legacy) never change what a card shows. */
export const TABLE_TOPICS: Record<string, LiveTopic[]> = {
  audit_events: ['activity', 'dashboard'],
  projects: ['pipeline', 'dashboard', 'projects-co-id'],
  bid_drafts: ['pipeline', 'projects-co-id'],
  bid_results: ['pipeline', 'dashboard', 'inbox'],
  client_threads: ['inbox'],
  client_projects: ['work', 'operations'],
  payments: ['work', 'operations'],
  autonomy_policies: ['policy', 'dashboard', 'autopilot', 'projects-co-id'],
  service_profiles: ['profile', 'projects-co-id'],
  knowledge_sources: ['knowledge', 'capabilities'],
  knowledge_chunks: ['knowledge'],
  operation_documents: ['operations'],
  office_learning_state: ['office-learning'],
  operation_outbox: ['operations'],
};

const WRITE = /^\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:fvh\.)?"?(\w+)/i;
export const writtenTable = (sql: string): string | null => WRITE.exec(sql)?.[1]?.toLowerCase() ?? null;

/**
 * Every repository writes through this Database, so wrapping it once announces all persisted changes
 * (routes and background workers alike) without an emit at each call site. Transactions announce after commit.
 */
export function announceWrites(database: Database, live: LiveEvents): Database {
  const topicsOf = (tables: Iterable<string>) => [...tables].flatMap(table => TABLE_TOPICS[table] ?? []);
  const tracked = (target: Queryable, tables: Set<string>): Queryable => ({
    query: async (text, params) => {
      const result = await target.query(text, params);
      const table = writtenTable(text);
      if (table) tables.add(table);
      return result as never;
    },
  });
  return {
    query: async (text, params) => {
      const tables = new Set<string>();
      const result = await tracked(database, tables).query(text, params);
      live.emit(...topicsOf(tables));
      return result as never;
    },
    exec: text => database.exec(text),
    transaction: async fn => {
      const tables = new Set<string>();
      const result = await database.transaction(tx => fn(tracked(tx, tables)));
      live.emit(...topicsOf(tables));
      return result;
    },
    close: () => database.close(),
  };
}

/** Topics for a successful non-GET request, by URL prefix. */
const ROUTE_TOPICS: Array<[prefix: string, topics: LiveTopic[]]> = [
  ['/api/projects-co-id', ['projects-co-id', 'pipeline']],
  ['/api/projects', ['pipeline', 'dashboard', 'capabilities']],
  ['/api/drafts', ['pipeline']],
  ['/api/policy', ['policy', 'dashboard', 'autopilot', 'projects-co-id']],
  ['/api/profile', ['profile', 'policy', 'dashboard', 'autopilot', 'projects-co-id']],
  ['/api/work', ['work', 'dashboard', 'operations']],
  ['/api/knowledge', ['knowledge', 'capabilities']],
  ['/api/freelancer', ['capabilities', 'pipeline', 'dashboard']],
  ['/api/linkedin', ['capabilities', 'knowledge']],
  ['/api/integrations', ['capabilities', 'operations']],
  ['/api/browser-bidding', ['browser-bidding', 'autopilot']],
  ['/api/operations', ['operations', 'work']],
  ['/api/hermes-kanban', ['hermes-kanban']],
  ['/api/office-learning', ['office-learning']],
];
const READ_ONLY_POSTS = new Set(['/api/knowledge/search']);

export function routeTopics(method: string, url: string): LiveTopic[] {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return [];
  const path = url.split('?')[0] ?? url;
  if (READ_ONLY_POSTS.has(path)) return [];
  const match = ROUTE_TOPICS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  // Nearly every write also records an audit row.
  return match ? [...match[1], 'activity'] : [];
}
