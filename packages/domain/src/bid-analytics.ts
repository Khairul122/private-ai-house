/**
 * Bid analytics over stored bid outcomes only.
 *
 * Every number here is derived from fields the app actually records: no budget estimate,
 * no assumed currency, and no guessed category. Pending bids are never counted as losses.
 */

export type BidAnalyticsRow = {
  projectId: string;
  amount: number | null;
  currency: string | null;
  submittedAt: string;
  outcome: string;
  checkedAt?: string | null;
};

export type BidOutcomeBucket = {
  key: string;
  submitted: number;
  won: number;
  lost: number;
  pending: number;
  decided: number;
  /** Null while nothing is decided: a 0% rate would claim a loss that never happened. */
  winRate: number | null;
};

export type BidAnalytics = {
  period: { firstSubmittedAt: string | null; lastCheckedAt: string | null };
  totals: {
    submitted: number;
    won: number;
    lost: number;
    pending: number;
    decided: number;
    winRate: number | null;
    missingAmount: number;
    missingCurrency: number;
  };
  sample: { decided: number; minimum: number; sufficient: boolean };
  byPriceBand: BidOutcomeBucket[];
  byMonth: BidOutcomeBucket[];
  limitations: string[];
};

/** Below this many decided bids the rate is reported but explicitly marked as a small sample. */
export const MIN_DECIDED_SAMPLE = 10;

const PRICE_BANDS: Array<{ label: string; min: number; max: number }> = [
  { label: '<100', min: 0, max: 100 },
  { label: '100-299', min: 100, max: 300 },
  { label: '300-499', min: 300, max: 500 },
  { label: '500-799', min: 500, max: 800 },
  { label: '>=800', min: 800, max: Number.POSITIVE_INFINITY },
];

function bucket(key: string): BidOutcomeBucket {
  return { key, submitted: 0, won: 0, lost: 0, pending: 0, decided: 0, winRate: null };
}

function add(bucketValue: BidOutcomeBucket, outcome: string): void {
  bucketValue.submitted += 1;
  if (outcome === 'won') bucketValue.won += 1;
  else if (outcome === 'lost') bucketValue.lost += 1;
  else bucketValue.pending += 1;
  bucketValue.decided = bucketValue.won + bucketValue.lost;
  bucketValue.winRate = bucketValue.decided === 0 ? null : bucketValue.won / bucketValue.decided;
}

function priceBand(amount: number, currency: string): string {
  const band = PRICE_BANDS.find((candidate) => amount >= candidate.min && amount < candidate.max) ?? PRICE_BANDS.at(-1)!;
  return `${currency} ${band.label}`;
}

function monthKey(submittedAt: string): string | null {
  const month = submittedAt.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(month) ? month : null;
}

/** Sorted by submission month, oldest first, so a table reads as a timeline. */
export function bidAnalytics(rows: BidAnalyticsRow[]): BidAnalytics {
  const totals = { submitted: 0, won: 0, lost: 0, pending: 0, decided: 0, winRate: null as number | null, missingAmount: 0, missingCurrency: 0 };
  const byPriceBand = new Map<string, BidOutcomeBucket>();
  const byMonth = new Map<string, BidOutcomeBucket>();
  let firstSubmittedAt: string | null = null;
  let lastCheckedAt: string | null = null;

  for (const row of rows) {
    const outcome = row.outcome === 'won' || row.outcome === 'lost' ? row.outcome : 'pending';
    totals.submitted += 1;
    if (outcome === 'won') totals.won += 1;
    else if (outcome === 'lost') totals.lost += 1;
    else totals.pending += 1;

    if (row.amount === null || !Number.isFinite(row.amount)) totals.missingAmount += 1;
    if (!row.currency) totals.missingCurrency += 1;
    // A band without both amount and currency would compare different currencies.
    if (row.amount !== null && Number.isFinite(row.amount) && row.currency) {
      const key = priceBand(row.amount, row.currency);
      const target = byPriceBand.get(key) ?? bucket(key);
      add(target, outcome);
      byPriceBand.set(key, target);
    }

    const month = monthKey(row.submittedAt);
    if (month) {
      const target = byMonth.get(month) ?? bucket(month);
      add(target, outcome);
      byMonth.set(month, target);
    }

    if (!firstSubmittedAt || row.submittedAt < firstSubmittedAt) firstSubmittedAt = row.submittedAt;
    if (row.checkedAt && (!lastCheckedAt || row.checkedAt > lastCheckedAt)) lastCheckedAt = row.checkedAt;
  }

  totals.decided = totals.won + totals.lost;
  totals.winRate = totals.decided === 0 ? null : totals.won / totals.decided;

  const limitations: string[] = [];
  if (totals.submitted === 0) limitations.push('Belum ada bid tersimpan; analisis belum dapat disusun.');
  if (totals.decided === 0 && totals.submitted > 0) limitations.push('Belum ada bid yang diputuskan; tingkat kemenangan tidak tersedia.');
  if (totals.pending > 0) limitations.push(`${totals.pending} bid masih pending dan tidak dihitung menang atau kalah.`);
  if (totals.missingAmount > 0) limitations.push(`${totals.missingAmount} bid tidak punya nominal tersimpan, jadi tidak masuk kelompok harga.`);
  if (totals.missingCurrency > 0) limitations.push(`${totals.missingCurrency} bid tidak punya mata uang tersimpan; nominalnya tidak dibandingkan lintas mata uang.`);
  if (totals.decided > 0 && totals.decided < MIN_DECIDED_SAMPLE) {
    limitations.push(`Sampel keputusan baru ${totals.decided}; angka ini belum cukup untuk menyimpulkan sebab-akibat.`);
  }
  limitations.push('Kelompok harga dan bulan hanya memakai atribut tersimpan, bukan taksiran anggaran atau kategori proyek.');

  return {
    period: { firstSubmittedAt, lastCheckedAt },
    totals,
    sample: { decided: totals.decided, minimum: MIN_DECIDED_SAMPLE, sufficient: totals.decided >= MIN_DECIDED_SAMPLE },
    byPriceBand: [...byPriceBand.values()].sort((a, b) => a.key.localeCompare(b.key)),
    byMonth: [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key)),
    limitations,
  };
}
