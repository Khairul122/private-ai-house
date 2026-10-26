import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceRepository } from './repository.js';

describe('mission persistence', () => {
  let repository: WorkspaceRepository | undefined;
  afterEach(async () => { await repository?.close(); });

  it('creates once per source identity and keeps the first item unchanged', async () => {
    repository = await WorkspaceRepository.open();
    const input = { source: 'inbox' as const, sourceId: 'thread-1', kind: 'reply', title: 'Balas klien', priority: 'high' as const,
      payload: { threadId: 'thread-1' }, dueAt: '2026-10-28T08:00:00+07:00', assignedTo: 'fvh-client-relations' };
    const first = await repository.createMission(input);
    expect(first).toMatchObject({ ...input, status: 'queued', dueAt: '2026-10-28T01:00:00.000Z', blocker: null, error: null });
    expect(first?.id).toBeTruthy();
    expect(first?.createdAt).toBeTruthy();
    expect(first?.updatedAt).toBeTruthy();
    expect(await repository.createMission({ ...input, title: 'Changed title' })).toBeUndefined();
    expect(await repository.listMissions()).toEqual([first]);
    expect(await repository.createMission({ ...input, source: 'deadline' })).toBeDefined();
    const edge = await repository.createMission({ ...input, sourceId: 'payload-edge', payload: { projectId: 'a'.repeat(2031) } });
    expect(edge?.payload.projectId).toHaveLength(2031);
    await expect(repository.createMission({ ...input, sourceId: 'payload-too-large', payload: { projectId: 'a'.repeat(2032) } })).rejects.toThrow();
    await expect(repository.sql.query('UPDATE missions SET payload=$2::jsonb WHERE id=$1',
      [edge!.id, JSON.stringify({ projectId: 'a'.repeat(2032) })])).rejects.toThrow(/check constraint/);
  });

  it('filters by status, source, assignee and inclusive due window', async () => {
    repository = await WorkspaceRepository.open();
    const base = { source: 'payment' as const, kind: 'follow_up', title: 'Cek pembayaran', priority: 'normal' as const };
    await repository.createMission({ ...base, sourceId: 'one', assignedTo: 'fvh-operations-analyst', dueAt: '2026-10-28T00:00:00Z' });
    await repository.createMission({ ...base, sourceId: 'two', assignedTo: 'fvh-operations-analyst', dueAt: '2026-10-29T00:00:00Z' });
    await repository.createMission({ ...base, sourceId: 'three', assignedTo: 'fvh-client-relations', dueAt: '2026-10-28T00:00:00Z' });
    await repository.createMission({ ...base, sourceId: 'four', source: 'inbox', assignedTo: 'fvh-operations-analyst' });
    const found = await repository.listMissions({ status: 'queued', source: 'payment', assignedTo: 'fvh-operations-analyst',
      dueFrom: '2026-10-28T00:00:00Z', dueTo: '2026-10-28T00:00:00Z' });
    expect(found.map(item => item.sourceId)).toEqual(['one']);
    expect((await repository.listMissions({ source: 'payment', assignedTo: 'fvh-operations-analyst', limit: 1, offset: 1 })).map(item => item.sourceId)).toEqual(['two']);
  });

  it('enforces transitions and preserves a short blocker until recovery', async () => {
    repository = await WorkspaceRepository.open();
    const first = await repository.createMission({ source: 'hermes_kanban', sourceId: 'task-1', kind: 'review', title: 'Tinjau tugas', priority: 'urgent' });
    expect(first).toBeDefined();
    const id = first!.id;
    await expect(repository.updateMissionStatus(id, { status: 'completed' })).rejects.toThrow('Transisi status mission tidak valid.');
    expect(await repository.updateMissionStatus(id, { status: 'blocked', blocker: 'Menunggu input pemilik.' })).toMatchObject({ status: 'blocked', blocker: 'Menunggu input pemilik.' });
    expect(await repository.updateMissionStatus(id, { status: 'queued' })).toMatchObject({ status: 'queued', blocker: null });
    expect(await repository.updateMissionStatus(id, { status: 'in_progress' })).toMatchObject({ status: 'in_progress' });
    expect(await repository.updateMissionStatus(id, { status: 'completed' })).toMatchObject({ status: 'completed' });
    await expect(repository.updateMissionStatus(id, { status: 'queued' })).rejects.toThrow('Transisi status mission tidak valid.');
    expect(await repository.updateMissionStatus('missing', { status: 'queued' })).toBeUndefined();
  });
});
