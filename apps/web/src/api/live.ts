import { useEffect, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { LiveTopic } from '@fvh/domain';

export type LiveState = 'connecting' | 'live' | 'reconnecting';

export const LIVE_STATE_LABELS: Record<LiveState, string> = {
  connecting: 'Menghubungkan pembaruan otomatis',
  live: 'Pembaruan otomatis terhubung',
  reconnecting: 'Realtime terputus, pembaruan berkala tetap aktif',
};

/** Server topic -> root query keys that read that data. invalidateQueries matches by prefix and refetches only mounted queries. */
export const TOPIC_QUERY_KEYS: Record<LiveTopic, string[]> = {
  activity: ['activity', 'agenda', 'insights', 'autopilot'],
  autopilot: ['autopilot', 'health'],
  'business-sync': ['business-sync', 'inbox', 'insights'],
  pipeline: ['pipeline', 'projects', 'draft', 'insights', 'agenda'],
  dashboard: ['dashboard'],
  inbox: ['inbox'],
  work: ['work', 'agenda'],
  policy: ['policy'],
  profile: ['profile'],
  knowledge: ['knowledge', 'knowledge-sync'],
  capabilities: ['capabilities', 'health'],
  'projects-co-id': ['projects-co-id', 'projects-co-id-drafts'],
  'browser-bidding': ['browser-bidding'],
  operations: ['operations', 'operations-qr'],
  'hermes-kanban': ['hermes-kanban'],
  'office-learning': ['office-learning'],
};

export function queryKeysFor(topics: unknown): string[] {
  if (!Array.isArray(topics)) return [];
  return [...new Set(topics.flatMap(topic => typeof topic === 'string' && Object.hasOwn(TOPIC_QUERY_KEYS, topic) ? TOPIC_QUERY_KEYS[topic as LiveTopic] : []))];
}

/** Opens one EventSource and refetches the cards a change touches. Returns a disconnect function. */
export function connectLive(client: QueryClient, onState: (state: LiveState) => void, url = '/api/events'): () => void {
  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let missed = false;
  let stopped = false;
  const dirty = new Set<string>();
  const refreshing = new Set<string>();
  const refresh = (key: string) => {
    dirty.add(key);
    if (refreshing.has(key)) return;
    refreshing.add(key);
    void (async () => {
      try {
        while (!stopped && dirty.delete(key)) {
          const inFlight = client.isFetching({ queryKey: [key], type: 'active' }) > 0;
          await client.invalidateQueries({ queryKey: [key] }, { cancelRefetch: false });
          // An event arriving after a read started still needs a read after it finishes.
          if (inFlight && !stopped) dirty.add(key);
        }
      } finally {
        refreshing.delete(key);
        if (!stopped && dirty.has(key)) refresh(key);
      }
    })();
  };
  const open = () => {
    source = new EventSource(url);
    source.onopen = () => {
      attempts = 0;
      onState('live');
      // Changes made while the stream was down were never announced.
      if (missed) for (const key of new Set(client.getQueryCache().getAll().map(query => query.queryKey[0]))) if (typeof key === 'string') refresh(key);
      missed = false;
    };
    source.addEventListener('change', event => {
      let topics: unknown;
      try { topics = (JSON.parse((event as MessageEvent<string>).data) as { topics?: unknown }).topics; } catch { return; }
      for (const key of queryKeysFor(topics)) refresh(key);
    });
    source.onerror = () => {
      // Own backoff instead of EventSource's fixed retry, which also gives up for good on a 503.
      source?.close();
      missed = true;
      onState('reconnecting');
      if (stopped) return;
      retry = setTimeout(open, Math.min(30_000, 1_000 * 2 ** attempts++));
    };
  };
  onState('connecting');
  open();
  return () => { stopped = true; dirty.clear(); clearTimeout(retry); source?.close(); };
}

export function useLiveUpdates(client: QueryClient): LiveState {
  const [state, setState] = useState<LiveState>('connecting');
  useEffect(() => typeof EventSource === 'undefined' ? undefined : connectLive(client, setState), [client]);
  return state;
}
