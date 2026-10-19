import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@fvh/persistence';
import { announceWrites, LiveEvents, routeTopics, writtenTable } from './live-events.js';

describe('LiveEvents', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('coalesces a burst into one event per window and stays silent without listeners', () => {
    vi.useFakeTimers();
    const live = new LiveEvents(250, 500);
    live.emit('activity');
    const received: string[][] = [];
    live.subscribe(topics => received.push(topics));
    for (let i = 0; i < 300; i++) live.emit('activity', 'dashboard');
    live.emit('pipeline');
    vi.advanceTimersByTime(249);
    expect(received).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(received).toEqual([['activity', 'dashboard', 'pipeline']]);
    live.emit('policy');
    vi.advanceTimersByTime(250);
    expect(received).toEqual([['activity', 'dashboard', 'pipeline'], ['policy']]);
    live.close();
  });

  it('announces watched in-memory state only when it changes and only while someone listens', () => {
    vi.useFakeTimers();
    const live = new LiveEvents(0, 500);
    let state = { busy: false };
    const read = vi.fn(() => state);
    live.watch(['autopilot'], read);
    vi.advanceTimersByTime(5_000);
    expect(read).not.toHaveBeenCalled();
    const received: string[][] = [];
    const unsubscribe = live.subscribe(topics => received.push(topics));
    vi.advanceTimersByTime(1_000);
    expect(received).toEqual([]);
    state = { busy: true };
    vi.advanceTimersByTime(500);
    vi.advanceTimersByTime(1);
    expect(received).toEqual([['autopilot']]);
    unsubscribe();
    const calls = read.mock.calls.length;
    vi.advanceTimersByTime(5_000);
    expect(read.mock.calls.length).toBe(calls);
    live.close();
  });

  it('maps SQL writes and non-GET routes to topics', () => {
    expect(writtenTable('INSERT INTO audit_events (id) VALUES ($1)')).toBe('audit_events');
    expect(writtenTable('\n      INSERT INTO projects (id) SELECT 1')).toBe('projects');
    expect(writtenTable("UPDATE operation_outbox SET status='sending'")).toBe('operation_outbox');
    expect(writtenTable('DELETE FROM knowledge_sources WHERE id = $1')).toBe('knowledge_sources');
    expect(writtenTable('SELECT * FROM projects')).toBeNull();
    expect(routeTopics('GET', '/api/policy')).toEqual([]);
    expect(routeTopics('POST', '/api/policy/pause')).toContain('policy');
    expect(routeTopics('POST', '/api/projects-co-id/scan')).toContain('projects-co-id');
    expect(routeTopics('POST', '/api/projects-co-id/scan')).not.toContain('capabilities');
    expect(routeTopics('POST', '/api/projects/abc/draft?x=1')).toContain('pipeline');
    expect(routeTopics('POST', '/api/knowledge/search')).toEqual([]);
    expect(routeTopics('POST', '/api/unknown')).toEqual([]);
  });

  it('announces writes after the query or transaction, never reads', async () => {
    vi.useFakeTimers();
    const live = new LiveEvents(0);
    const received: string[][] = [];
    live.subscribe(topics => received.push(topics));
    const query = vi.fn(async () => []);
    const database = announceWrites({ query, exec: async () => {}, transaction: async fn => fn({ query }), close: async () => {} } as Database, live);
    await database.query('SELECT 1 FROM projects');
    await vi.advanceTimersByTimeAsync(1);
    expect(received).toEqual([]);
    await database.transaction(async tx => { await tx.query('UPDATE client_projects SET status = $1', ['x']); await tx.query('INSERT INTO payments (id) VALUES ($1)', ['p']); });
    await vi.advanceTimersByTimeAsync(1);
    expect(received).toEqual([['operations', 'work']]);
    await expect(database.transaction(async tx => { await tx.query('INSERT INTO payments (id) VALUES ($1)', ['p']); throw new Error('rollback'); })).rejects.toThrow('rollback');
    await vi.advanceTimersByTimeAsync(1);
    expect(received).toHaveLength(1);
    live.close();
  });
});
