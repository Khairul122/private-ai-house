import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { describeCardData, isCardQuery } from '../api/card-data.js';
import type { LiveState } from '../api/live.js';

export function CardDataStatus({ path, live }: { path: string; live: LiveState }) {
  const client = useQueryClient();
  const cache = client.getQueryCache();
  const subscribe = useCallback((notify: () => void) => cache.subscribe(notify), [cache]);
  const snapshot = useCallback(() => describeCardData(cache.getAll().filter(query => isCardQuery(query, path)).map(query => query.state)), [cache, path]);
  const status = useSyncExternalStore(subscribe, snapshot);
  return <div className="sheet-data-status"><span role="status">{status}</span><span title="Menunjukkan koneksi pembaruan aplikasi, bukan keberhasilan marketplace">{live === 'live' ? 'Pembaruan otomatis terhubung' : live === 'connecting' ? 'Menghubungkan pembaruan…' : 'Pembaruan berkala · realtime terputus'}</span></div>;
}
