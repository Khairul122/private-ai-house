import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { describeCardData, isCardQuery } from './card-data.js';

describe('card data status', () => {
  const success = { status: 'success', fetchStatus: 'idle', dataUpdatedAt: 1000 };
  it('never presents retained data from an errored query as fresh', () => {
    expect(describeCardData([success, { ...success, status: 'error', dataUpdatedAt: 2000 }])).toBe('1 sumber gagal dimuat · periksa pesan di kartu');
    expect(describeCardData([{ ...success, status: 'error', fetchStatus: 'fetching' }])).toContain('mencoba kembali');
  });
  it('distinguishes initial loading, refresh and successful reads', () => {
    expect(describeCardData([])).toBe('Menunggu data kartu');
    expect(describeCardData([{ ...success, status: 'pending' }])).toContain('Memuat sumber');
    expect(describeCardData([{ ...success, fetchStatus: 'fetching' }])).toContain('Memperbarui');
    expect(describeCardData([{ ...success, dataUpdatedAt: 2000 }, success])).toBe(describeCardData([success]));
    expect(describeCardData([{ ...success, dataUpdatedAt: 0 }])).toContain('belum tersedia');
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
    expect(isCardQuery(make(['draft', 'old-project'], false), '/opportunities')).toBe(false);
    client.clear();
  });
});
