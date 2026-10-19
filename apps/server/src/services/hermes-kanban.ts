import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { allowedEnvironment } from '@fvh/adapter-hermes';
import type { HermesKanbanDetail, HermesKanbanStatus, HermesKanbanTask } from '../models/hermes-kanban-types.js';

/** Board and team created by scripts/hermes-team.ts. */
export const HERMES_BOARD = 'fvh-house';
const TEAM_PREFIX = 'fvh-';
/** Profiles with file + terminal tools (scripts/hermes-team.ts). They never receive app data, which carries untrusted client text. */
export const CODE_PROFILES: readonly string[] = ['fvh-qa-engineer', 'fvh-knowledge-curator'];

export type { HermesKanbanDetail, HermesKanbanStatus, HermesKanbanTask };
export type HermesKanbanRunner = (args: string[]) => Promise<string>;
export function hermesKanbanRunner(executable: string): HermesKanbanRunner {
  return (args) => new Promise((resolve, reject) => {
    execFile(executable, ['kanban', '--board', HERMES_BOARD, ...args], { env: allowedEnvironment(), windowsHide: true, shell: false, timeout: 60_000, maxBuffer: 4_000_000, encoding: 'utf8' },
      (error, stdout) => error ? reject(new Error('Perintah kanban Hermes gagal.')) : resolve(stdout));
  });
}

const epoch = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
const text = (value: unknown, limit = 2000) => typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null;
const taskRow = z.object({ id: z.string(), title: z.string() }).passthrough();

function toTask(raw: z.infer<typeof taskRow>): HermesKanbanTask {
  const row = raw as Record<string, unknown>;
  return {
    id: raw.id, title: raw.title.slice(0, 300), assignee: text(row.assignee, 80), status: text(row.status, 40) ?? 'unknown', createdBy: text(row.created_by, 80),
    createdAt: epoch(row.created_at), startedAt: epoch(row.started_at), completedAt: epoch(row.completed_at), error: text(row.last_failure_error, 500),
  };
}

export class HermesKanban {
  private cached: { at: number; value: Promise<HermesKanbanStatus> } | null = null;
  private last: HermesKanbanStatus | null = null;
  constructor(private readonly run: HermesKanbanRunner, private readonly now: () => Date = () => new Date()) {}

  /**
   * Board snapshot. Each read starts two Hermes processes (~10 s), so after the first read the last
   * snapshot is served at once while a refresh runs; `checkedAt` tells the reader how old it is.
   */
  status(): Promise<HermesKanbanStatus> {
    const at = this.now().getTime();
    if (!this.cached || at - this.cached.at >= 30_000) {
      const value = this.read();
      this.cached = { at, value };
      void value.then(result => { this.last = result; });
    }
    return this.last ? Promise.resolve(this.last) : this.cached.value;
  }

  /** Last snapshot without starting a Hermes read. */
  peek(): HermesKanbanStatus | null { return this.last; }

  private async read(): Promise<HermesKanbanStatus> {
    const checkedAt = this.now().toISOString();
    try {
      const [list, assignees] = await Promise.all([this.run(['list', '--json']), this.run(['assignees', '--json'])]);
      const tasks = z.array(taskRow).parse(JSON.parse(list)).map(toTask);
      const team = z.array(z.object({ name: z.string() }).passthrough()).parse(JSON.parse(assignees)).map(a => a.name).filter(name => name.startsWith(TEAM_PREFIX)).sort();
      return { available: true, reason: team.length ? `${team.length} karyawan di board ${HERMES_BOARD}.` : 'Tim Hermes belum dibuat. Jalankan scripts/hermes-team.ts.', board: HERMES_BOARD, checkedAt, team, tasks };
    } catch {
      return { available: false, reason: 'Kanban Hermes tidak dapat dibaca. Periksa instalasi Hermes dan board fvh-house.', board: HERMES_BOARD, checkedAt, team: [], tasks: [] };
    }
  }

  async detail(id: string): Promise<HermesKanbanDetail> {
    const raw = z.object({ latest_summary: z.unknown(), children: z.array(z.unknown()).default([]), runs: z.array(z.record(z.string(), z.unknown())).default([]) }).passthrough()
      .parse(JSON.parse(await this.run(['show', id, '--json'])));
    return {
      id, summary: text(raw.latest_summary, 4000), children: raw.children.filter((c): c is string => typeof c === 'string'),
      runs: raw.runs.slice(-10).map(r => ({ profile: text(r.profile, 80), outcome: text(r.outcome, 40), summary: text(r.summary, 4000), error: text(r.error, 500), startedAt: epoch(r.started_at), endedAt: epoch(r.ended_at) })),
    };
  }

  /** `key` identifies the owner's request so a retry after an uncertain result returns the same card instead of a second one. */
  async create(input: { title: string; body: string; assignee: string; key: string }): Promise<HermesKanbanTask> {
    const { available, team } = await this.status();
    if (!available) throw new Error('unavailable');
    if (!team.includes(input.assignee)) throw new Error('unknown_assignee');
    const directory = await mkdtemp(join(tmpdir(), 'fvh-kanban-'));
    try {
      const bodyPath = join(directory, 'body.md');
      await writeFile(bodyPath, input.body, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      // A runtime cap keeps a stuck worker from holding a card (and model quota) indefinitely.
      const created = taskRow.parse(JSON.parse(await this.run(['create', input.title, '--body-file', bodyPath, '--assignee', input.assignee, '--created-by', 'mission-control', '--max-runtime', '30m', '--idempotency-key', input.key, '--json'])));
      this.cached = null;
      this.last = null;
      return toTask(created);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
