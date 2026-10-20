import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { isCardQuery, summarizeCardData } from './card-data.js';

describe('card data status', () => {
  const success = { status: 'success', fetchStatus: 'idle', dataUpdatedAt: 1000 };
  it('never presents retained data from an errored query as fresh', () => {
    expect(summarizeCardData([success, { ...success, status: 'error', dataUpdatedAt: 2000 }])).toMatchObject({ kind: 'error', label: '1 sumber gagal dimuat, periksa pesan di kartu', updatedAt: null });
    expect(summarizeCardData([{ ...success, status: 'error', fetchStatus: 'fetching' }]).label).toContain('mencoba kembali');
  });
  it('distinguishes initial loading, refresh and successful reads', () => {
    expect(summarizeCardData([])).toMatchObject({ kind: 'waiting', label: 'Menunggu sumber data kartu' });
    expect(summarizeCardData([{ ...success, status: 'pending' }])).toMatchObject({ kind: 'loading', label: 'Memuat sumber data kartu' });
    expect(summarizeCardData([{ ...success, fetchStatus: 'fetching' }])).toMatchObject({ kind: 'refreshing', label: 'Memperbarui data kartu' });
    expect(summarizeCardData([{ ...success, dataUpdatedAt: 2000 }, success]).updatedAt).toBe(1000);
    expect(summarizeCardData([{ ...success, dataUpdatedAt: 0 }]).label).toContain('belum tersedia');
  });
  it('reports the oldest read time and the state a card badge needs', () => {
    expect(summarizeCardData([]).kind).toBe('waiting');
    expect(summarizeCardData([{ ...success, status: 'pending' }]).kind).toBe('loading');
    expect(summarizeCardData([{ ...success, fetchStatus: 'fetching' }])).toMatchObject({ kind: 'refreshing', updatedAt: 1000 });
    expect(summarizeCardData([success, { ...success, dataUpdatedAt: 3000 }])).toMatchObject({ kind: 'ready', updatedAt: 1000 });
    expect(summarizeCardData([{ ...success, dataUpdatedAt: 0 }])).toMatchObject({ kind: 'waiting', updatedAt: null });
  });
  it('scopes reads and refreshes to active card sources, excluding office and cached detail queries', () => {
    const client = new QueryClient();
    const make = (key: string[], active: boolean) => {
      const query = client.getQueryCache().build(client, { queryKey: key });
      query.isActive = () => active;
      return query;
    };
    expect(isCardQuery(make(['profile'], true), '/profile')).toBe(true);
    expect(isCardQuery(make(['work'], true), '/profile')).toBe(false);
    expect(isCardQuery(make(['autopilot', 'office'], true), '/overview')).toBe(false);
    expect(isCardQuery(make(['inbox'], true), '/overview')).toBe(true);
    expect(isCardQuery(make(['work'], true), '/overview')).toBe(true);
    expect(isCardQuery(make(['draft', 'old-project'], false), '/opportunities')).toBe(false);
    client.clear();
  });
});
