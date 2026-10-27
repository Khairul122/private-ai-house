import { describe, expect, it } from 'vitest';
import { bidAnalytics, MIN_DECIDED_SAMPLE, type BidAnalyticsRow } from './bid-analytics.js';

const row = (input: Partial<BidAnalyticsRow> & Pick<BidAnalyticsRow, 'outcome'>): BidAnalyticsRow => ({
  projectId: 'p1',
  amount: 500,
  currency: 'USD',
  submittedAt: '2026-10-01T10:00:00.000Z',
  ...input,
});

describe('bidAnalytics', () => {
  it('reports no win rate when every bid is still pending', () => {
    const result = bidAnalytics([row({ outcome: 'pending' }), row({ outcome: 'unknown-value' })]);
    expect(result.totals).toMatchObject({ submitted: 2, won: 0, lost: 0, pending: 2, decided: 0, winRate: null });
    expect(result.sample).toEqual({ decided: 0, minimum: MIN_DECIDED_SAMPLE, sufficient: false });
    expect(result.limitations).toContain('Belum ada bid yang diputuskan; tingkat kemenangan tidak tersedia.');
  });

  it('never treats a pending bid as a loss and counts only decided bids in the denominator', () => {
    const result = bidAnalytics([
      row({ outcome: 'won' }),
      row({ outcome: 'lost' }),
      row({ outcome: 'pending' }),
      row({ outcome: 'pending' }),
    ]);
    expect(result.totals).toMatchObject({ submitted: 4, won: 1, lost: 1, pending: 2, decided: 2, winRate: 0.5 });
    expect(result.limitations).toContain('2 bid masih pending dan tidak dihitung menang atau kalah.');
  });

  it('keeps price bands and months separate per currency and month', () => {
    const result = bidAnalytics([
      row({ outcome: 'won', amount: 450, currency: 'USD', submittedAt: '2026-09-12T10:00:00.000Z' }),
      row({ outcome: 'lost', amount: 450, currency: 'USD', submittedAt: '2026-10-12T10:00:00.000Z' }),
      row({ outcome: 'won', amount: 400, currency: 'IDR', submittedAt: '2026-10-02T10:00:00.000Z' }),
    ]);
    expect(result.byPriceBand.map((band) => band.key)).toEqual(['IDR 300-499', 'USD 300-499']);
    expect(result.byPriceBand[0]).toMatchObject({ submitted: 1, won: 1, decided: 1, winRate: 1 });
    expect(result.byPriceBand[1]).toMatchObject({ submitted: 2, won: 1, lost: 1, decided: 2, winRate: 0.5 });
    expect(result.byMonth.map((month) => month.key)).toEqual(['2026-09', '2026-10']);
    expect(result.byMonth[1]).toMatchObject({ submitted: 2, won: 1, lost: 1 });
  });

  it('reports bids without a recorded amount instead of guessing a band', () => {
    const result = bidAnalytics([
      row({ outcome: 'won', amount: null }),
      row({ outcome: 'lost', currency: null }),
      row({ outcome: 'pending' }),
    ]);
    expect(result.totals).toMatchObject({ missingAmount: 1, missingCurrency: 1, submitted: 3 });
    expect(result.byPriceBand.map((band) => band.submitted)).toEqual([1]);
    expect(result.limitations).toContain('1 bid tidak punya nominal tersimpan, jadi tidak masuk kelompok harga.');
    expect(result.limitations).toContain('1 bid tidak punya mata uang tersimpan; nominalnya tidak dibandingkan lintas mata uang.');
  });

  it('tracks the recorded period from submission and check timestamps', () => {
    const result = bidAnalytics([
      row({ outcome: 'won', submittedAt: '2026-10-05T10:00:00.000Z', checkedAt: '2026-10-07T10:00:00.000Z' }),
      row({ outcome: 'pending', submittedAt: '2026-10-01T10:00:00.000Z', checkedAt: '2026-10-09T10:00:00.000Z' }),
    ]);
    expect(result.period).toEqual({ firstSubmittedAt: '2026-10-01T10:00:00.000Z', lastCheckedAt: '2026-10-09T10:00:00.000Z' });
  });

  it('reports an empty dataset without inventing a rate', () => {
    const result = bidAnalytics([]);
    expect(result.totals.winRate).toBeNull();
    expect(result.byPriceBand).toEqual([]);
    expect(result.period).toEqual({ firstSubmittedAt: null, lastCheckedAt: null });
    expect(result.limitations[0]).toBe('Belum ada bid tersimpan; analisis belum dapat disusun.');
  });

  it('marks a decision sample below the documented minimum as insufficient', () => {
    const result = bidAnalytics(Array.from({ length: MIN_DECIDED_SAMPLE - 1 }, () => row({ outcome: 'won' })));
    expect(result.sample.sufficient).toBe(false);
    expect(result.limitations.some((line) => line.startsWith('Sampel keputusan baru'))).toBe(true);
  });
});
