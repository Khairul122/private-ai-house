import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { LIVE_TOPICS } from '@fvh/domain';
import { connectLive, queryKeysFor, TOPIC_QUERY_KEYS } from './live.js';

describe('live topic -> query keys', () => {
  it('maps every server topic to at least its own card', () => {
    for (const topic of LIVE_TOPICS) expect(TOPIC_QUERY_KEYS[topic].length).toBeGreaterThan(0);
    expect(queryKeysFor(['policy'])).toEqual(['policy']);
    expect(queryKeysFor(['autopilot'])).toContain('autopilot');
    expect(queryKeysFor(['projects-co-id'])).toEqual(['projects-co-id', 'projects-co-id-drafts']);
  });

  it('merges duplicates and ignores unknown or hostile input', () => {
    expect(queryKeysFor(['activity', 'pipeline'])).toEqual(['activity', 'agenda', 'insights', 'autopilot', 'pipeline', 'projects', 'draft']);
    expect(queryKeysFor(['toString', '__proto__', 'nope', 42])).toEqual([]);
    expect(queryKeysFor('policy')).toEqual([]);
    expect(queryKeysFor(undefined)).toEqual([]);
  });
});

describe('live refetch concurrency', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('coalesces bursts, finishes the current read and reads the latest change afterwards', async () => {
    const sources: EventTarget[] = [];
    vi.stubGlobal('EventSource', class extends EventTarget {
      constructor() { super(); sources.push(this); }
      close() {}
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const reads: Array<() => void> = [];
    let revision = 0;
    let concurrent = 0;
    let maximum = 0;
    const observer = new QueryObserver(client, { queryKey: ['pipeline'], queryFn: async () => {
      const snapshot = revision;
      concurrent++;
      maximum = Math.max(maximum, concurrent);
      await new Promise<void>(resolve => reads.push(resolve));
      concurrent--;
      return snapshot;
    } });
    const unsubscribe = observer.subscribe(() => undefined);
    const disconnect = connectLive(client, () => undefined);
    const emit = () => sources[0]!.dispatchEvent(new MessageEvent('change', { data: JSON.stringify({ topics: ['pipeline'] }) }));
    try {
      await vi.waitFor(() => expect(reads).toHaveLength(1));
      revision = 1;
      for (let i = 0; i < 20; i++) emit();
      expect(reads).toHaveLength(1);
      reads[0]!();
      await vi.waitFor(() => expect(reads).toHaveLength(2));
      expect(client.getQueryData(['pipeline'])).toBe(0);
      reads[1]!();
      await vi.waitFor(() => expect(client.getQueryData(['pipeline'])).toBe(1));
      revision = 2;
      emit();
      await vi.waitFor(() => expect(reads).toHaveLength(3));
      revision = 3;
      for (let i = 0; i < 20; i++) emit();
      expect(reads).toHaveLength(3);
      reads[2]!();
      await vi.waitFor(() => expect(reads).toHaveLength(4));
      reads[3]!();
      await vi.waitFor(() => expect(client.getQueryData(['pipeline'])).toBe(3));
      expect(maximum).toBe(1);
      revision = 4;
      emit();
      await vi.waitFor(() => expect(reads).toHaveLength(5));
      emit();
      disconnect();
      reads[4]!();
      await vi.waitFor(() => expect(client.getQueryData(['pipeline'])).toBe(4));
      expect(reads).toHaveLength(5);
    } finally {
      disconnect(); unsubscribe(); client.clear();
    }
  });
});
