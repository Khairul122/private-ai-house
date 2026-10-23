import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HermesKanban } from './hermes-kanban.js';
import { DATA_PLAN_AUTHOR, FINAL_AUTHOR, PLAN_AUTHOR, WORK_AUTHOR } from './hermes-workflow.js';

function boardFixture(includeData = false) {
  const root = { id: 't_aabbccdd', title: 'Prioritas peluang', assignee: 'fvh-chief-of-staff', status: 'done', created_by: includeData ? DATA_PLAN_AUTHOR : PLAN_AUTHOR, body: '## Tujuan pemilik\nKonteks pemilik', summary: JSON.stringify({ tasks: [
    { title: 'Cari peluang', goal: 'Pilih tiga peluang yang cocok.', assignee: 'fvh-market-scout', parents: [] },
    { title: 'Tinjau hasil', goal: 'Periksa risiko tiga peluang.', assignee: 'fvh-market-scout', parents: [0] },
  ] }), parents: [] as string[] };
  const tasks = [root];
  const keys = new Map<string, string>();
  const calls: string[][] = [];
  let failCreation = 0;
  const run = async (args: string[]) => {
    calls.push(args);
    if (args[0] === 'list') return JSON.stringify(tasks);
    if (args[0] === 'assignees') return JSON.stringify(['fvh-chief-of-staff', 'fvh-market-scout', 'fvh-qa-engineer'].map(name => ({ name })));
    if (args[0] === '@gateway') return 'Gateway is running';
    if (args[0] === 'show') {
      const task = tasks.find(task => task.id === args[1]);
      if (!task) throw new Error('not found');
      return JSON.stringify({ task, latest_summary: task.summary, children: tasks.filter(child => child.parents.includes(task.id)).map(child => child.id), parents: task.parents });
    }
    if (args[0] === 'create') {
      if (failCreation > 0 && --failCreation === 0) throw new Error('uncertain');
      const value = (flag: string) => args[args.indexOf(flag) + 1]!;
      const key = value('--idempotency-key');
      const found = tasks.find(task => task.id === keys.get(key));
      if (found) return JSON.stringify(found);
      const task = { id: `t_0000000${tasks.length}`, title: args[1]!, assignee: value('--assignee'), status: 'todo', created_by: value('--created-by'), body: readFileSync(value('--body-file'), 'utf8'), summary: '', parents: args.flatMap((arg, index) => arg === '--parent' ? [args[index + 1]!] : []) };
      tasks.push(task); keys.set(key, task.id);
      return JSON.stringify(task);
    }
    if (args[0] === 'comment') return 'commented';
    if (args[0] === 'unblock') { tasks.find(task => task.id === args[1])!.status = 'ready'; return 'unblocked'; }
    throw new Error('unexpected');
  };
  return { root, tasks, calls, run, failNext: (count: number) => { failCreation = count; } };
}

describe('durable orchestration graph', () => {
  it('adds a synthesis stage to a legacy API goal without rerunning its workers', async () => {
    const fixture = boardFixture(); fixture.root.created_by = 'mission-control'; fixture.root.summary = 'Pekerjaan dibagi.';
    const child = { ...fixture.root, id: 't_11223344', assignee: 'fvh-market-scout', created_by: 'fvh-chief-of-staff', parents: [fixture.root.id] };
    fixture.tasks.push(child);
    await new HermesKanban(fixture.run).reconcile();
    expect(fixture.tasks).toHaveLength(3);
    expect(fixture.tasks[2]?.parents).toEqual([fixture.root.id, child.id]);
  });
  it('gates synthesis on all workers and only marks the goal done after synthesis', async () => {
    const fixture = boardFixture();
    const service = new HermesKanban(fixture.run);
    await service.reconcile();
    const workers = fixture.tasks.filter(task => task.created_by === `${WORK_AUTHOR}${fixture.root.id}`);
    const final = fixture.tasks.find(task => task.created_by === `${FINAL_AUTHOR}${fixture.root.id}`)!;
    expect(workers).toHaveLength(2);
    expect(workers[1]?.parents).toEqual([fixture.root.id, workers[0]!.id]);
    expect(final.parents).toEqual([fixture.root.id, ...workers.map(task => task.id)]);
    expect(final.body).toContain('FVH_SYNTHESIS_V1');
    expect(workers[0]?.body).not.toContain('FVH_PLAN_V1');
    expect((await service.status()).tasks.find(task => task.id === fixture.root.id)?.goalStatus).toBe('running');
    final.status = 'done';
    expect((await new HermesKanban(fixture.run).status()).tasks.find(task => task.id === fixture.root.id)).toMatchObject({ goalStatus: 'done', resultId: final.id });
  });
  it('resumes partial graph creation after a process restart without duplicates', async () => {
    const fixture = boardFixture(); fixture.failNext(2);
    await new HermesKanban(fixture.run).reconcile();
    expect(fixture.tasks).toHaveLength(2);
    const service = new HermesKanban(fixture.run);
    await Promise.all([service.reconcile(), service.reconcile()]);
    await service.reconcile();
    expect(fixture.tasks).toHaveLength(4);
  });
  it('does not create any worker for an invalid, cyclic, oversized, or data-to-code plan', async () => {
    for (const invalid of ['not json', JSON.stringify({ tasks: Array(7).fill({}) }), JSON.stringify({ tasks: [{ title: 'Uji kode', goal: 'Uji aplikasi', assignee: 'fvh-qa-engineer', parents: [] }] })]) {
      const fixture = boardFixture(true); fixture.root.summary = invalid;
      const service = new HermesKanban(fixture.run); await service.reconcile();
      expect(fixture.tasks).toHaveLength(1);
      expect((await service.status()).tasks[0]).toMatchObject({ goalStatus: 'blocked', goalError: expect.any(String) });
    }
  });
  it('requires an eligible card before unblocking and passes option-like comments as text', async () => {
    const fixture = boardFixture(); const service = new HermesKanban(fixture.run);
    await expect(service.recover(fixture.root.id, 'jawaban', true)).rejects.toThrow('not_recoverable');
    fixture.root.status = 'blocked';
    await service.recover(fixture.root.id, '--pesan', true);
    expect(fixture.calls).toContainEqual(['comment', fixture.root.id, '--author', 'mission-control-owner', '--', '--pesan']);
    expect(fixture.root.status).toBe('ready');
  });
});
