import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WorkspaceRepository } from '@fvh/persistence';
import { createApp } from '../app.js';
import { HermesKanban, type HermesKanbanRunner } from './hermes-kanban.js';
import { insertTestOpportunity } from '../test-fixtures.js';

const list = JSON.stringify([{ id: 't_aa11bb22', title: 'Rencana bid', assignee: 'fvh-chief-of-staff', status: 'running', created_by: 'mission-control', created_at: 1792424383, started_at: 1792424392, completed_at: null, last_failure_error: null }]);
const assignees = JSON.stringify([{ name: 'default' }, { name: 'fvh-market-scout' }, { name: 'fvh-chief-of-staff' }, { name: 'fvh-qa-engineer' }, { name: 'private-ai-house' }]);

function fakeRunner(calls: string[][], bodies: string[] = []): HermesKanbanRunner {
  return async (args) => {
    calls.push(args);
    if (args[0] === 'list') return list;
    if (args[0] === 'assignees') return assignees;
    if (args[0] === 'create') { bodies.push(readFileSync(args[args.indexOf('--body-file') + 1]!, 'utf8')); return JSON.stringify({ id: 't_cc33dd44', title: args[1], assignee: args[args.indexOf('--assignee') + 1], status: 'ready' }); }
    if (args[0] === 'show') return JSON.stringify({ latest_summary: 'Selesai.', children: ['t_ee55ff66'], runs: [{ profile: 'fvh-market-scout', outcome: 'completed', summary: 'Tiga peluang cocok.', started_at: 1792424392, ended_at: 1792424450 }] });
    throw new Error('unexpected');
  };
}

describe('Hermes kanban', () => {
  it('reads cards and only treats fvh-* profiles as the team, with a short cache', async () => {
    const calls: string[][] = [];
    const kanban = new HermesKanban(fakeRunner(calls), () => new Date('2026-10-20T00:00:00Z'));
    const status = await kanban.status();
    await kanban.status();

    expect(status).toMatchObject({ available: true, team: ['fvh-chief-of-staff', 'fvh-market-scout', 'fvh-qa-engineer'], tasks: [{ id: 't_aa11bb22', status: 'running', assignee: 'fvh-chief-of-staff', createdAt: '2026-10-19T15:39:43.000Z', completedAt: null }] });
    expect(calls).toHaveLength(2);
  });

  it('reports unavailable instead of stale or invented cards when Hermes fails', async () => {
    const kanban = new HermesKanban(async () => { throw new Error('no hermes'); });
    expect(await kanban.status()).toMatchObject({ available: false, tasks: [], team: [] });
  });

  it('refuses assignees outside the team before creating anything', async () => {
    const calls: string[][] = [];
    const kanban = new HermesKanban(fakeRunner(calls));
    await expect(kanban.create({ title: 'Tes', body: 'x', assignee: 'fvh-unknown', key: 'k' })).rejects.toThrow('unknown_assignee');
    await expect(new HermesKanban(async () => { throw new Error('down'); }).create({ title: 'Tes', body: 'x', assignee: 'fvh-market-scout', key: 'k' })).rejects.toThrow('unavailable');
    expect(calls.some(args => args[0] === 'create')).toBe(false);
  });

  it('creates a card through the API with a real app-data snapshot, requiring Origin', async () => {
    const repository = await WorkspaceRepository.open();
    insertTestOpportunity(repository);
    const calls: string[][] = [];
    const bodies: string[] = [];
    const app = await createApp({ repository, hermesKanban: new HermesKanban(fakeRunner(calls, bodies)), clock: () => new Date('2026-10-20T00:00:00Z') });
    await app.ready();
    try {
      const payload = { title: 'Pilih proyek terbaik minggu ini', goal: 'Bandingkan peluang teratas.', assignee: 'fvh-market-scout' };
      const noOrigin = await app.inject({ method: 'POST', url: '/api/hermes-kanban/tasks', payload });
      const outsider = await app.inject({ method: 'POST', url: '/api/hermes-kanban/tasks', headers: { origin: 'http://127.0.0.1:5174' }, payload: { ...payload, assignee: 'default' } });
      const created = await app.inject({ method: 'POST', url: '/api/hermes-kanban/tasks', headers: { origin: 'http://127.0.0.1:5174' }, payload });
      const detail = await app.inject({ method: 'GET', url: '/api/hermes-kanban/tasks/t_cc33dd44' });
      const toCodeProfile = await app.inject({ method: 'POST', url: '/api/hermes-kanban/tasks', headers: { origin: 'http://127.0.0.1:5174' }, payload: { ...payload, assignee: 'fvh-qa-engineer' } });
      const optionTitle = await app.inject({ method: 'POST', url: '/api/hermes-kanban/tasks', headers: { origin: 'http://127.0.0.1:5174' }, payload: { ...payload, title: '--triage' } });
      const codeWithoutData = await app.inject({ method: 'POST', url: '/api/hermes-kanban/tasks', headers: { origin: 'http://127.0.0.1:5174' }, payload: { ...payload, assignee: 'fvh-qa-engineer', includeData: false } });

      expect(noOrigin.statusCode).toBe(403);
      expect(outsider.statusCode).toBe(400);
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ id: 't_cc33dd44', assignee: 'fvh-market-scout' });
      expect(toCodeProfile.statusCode).toBe(400);
      expect(optionTitle.statusCode).toBe(400);
      expect(codeWithoutData.statusCode).toBe(201);
      expect(bodies).toHaveLength(2);
      expect(bodies[1]).not.toContain('## Data aplikasi');
      expect(bodies[0]).toContain('Bandingkan peluang teratas.');
      expect(bodies[0]).toContain('## Data aplikasi (snapshot 2026-10-20T00:00:00.000Z)');
      expect(bodies[0]).toMatch(/Kebijakan (draft|active|paused) v\d+/);
      expect(bodies[0]).toContain('API inventori dengan TypeScript');
      expect(calls.find(args => args[0] === 'create')).toEqual(expect.arrayContaining(['--assignee', 'fvh-market-scout', '--max-runtime', '30m', '--idempotency-key']));
      expect(detail.json()).toMatchObject({ summary: 'Selesai.', children: ['t_ee55ff66'], runs: [{ profile: 'fvh-market-scout', outcome: 'completed' }] });
    } finally {
      await app.close();
      await repository.close();
    }
  });
});
