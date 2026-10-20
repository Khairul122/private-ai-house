import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isCardQuery, summarizeCardData, type CardDataSummary } from '../api/card-data.js';
import { LIVE_STATE_LABELS, type LiveState } from '../api/live.js';

export function CardDataStatus({ path, live }: { path: string; live: LiveState }) {
  const client = useQueryClient();
  const cache = client.getQueryCache();
  const subscribe = useCallback((notify: () => void) => cache.subscribe(notify), [cache]);
  const latest = useRef<CardDataSummary | undefined>(undefined);
  const snapshot = useCallback(() => {
    const next = summarizeCardData(cache.getAll().filter(query => isCardQuery(query, path)).map(query => query.state));
    const previous = latest.current;
    if (previous && previous.kind === next.kind && previous.label === next.label && previous.updatedAt === next.updatedAt) return previous;
    latest.current = next;
    return next;
  }, [cache, path]);
  const status = useSyncExternalStore(subscribe, snapshot, snapshot);
  return <div className="sheet-data-status" data-state={status.kind}>
    <span role="status" aria-live="polite" aria-atomic="true"><span className="sheet-data-mark" aria-hidden="true" />{status.label}</span>
    <span className="sheet-live-state" data-state={live} title="Menunjukkan koneksi pembaruan aplikasi, bukan keberhasilan marketplace"><span className="sheet-live-mark" aria-hidden="true" />{LIVE_STATE_LABELS[live]}</span>
  </div>;
}
