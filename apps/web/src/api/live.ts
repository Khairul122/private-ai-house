import { useEffect, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { LiveTopic } from '@fvh/domain';

export type LiveState = 'connecting' | 'live' | 'reconnecting';

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
  const open = () => {
    source = new EventSource(url);
    source.onopen = () => {
      attempts = 0;
      onState('live');
      // Changes made while the stream was down were never announced.
      if (missed) void client.invalidateQueries();
      missed = false;
    };
    source.addEventListener('change', event => {
      let topics: unknown;
      try { topics = (JSON.parse((event as MessageEvent<string>).data) as { topics?: unknown }).topics; } catch { return; }
      for (const key of queryKeysFor(topics)) void client.invalidateQueries({ queryKey: [key] });
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
  return () => { stopped = true; clearTimeout(retry); source?.close(); };
}

export function useLiveUpdates(client: QueryClient): LiveState {
  const [state, setState] = useState<LiveState>('connecting');
  useEffect(() => typeof EventSource === 'undefined' ? undefined : connectLive(client, setState), [client]);
  return state;
}
