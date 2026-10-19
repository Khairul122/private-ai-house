import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OperationStatus } from './ui.js';
import type { Autopilot } from '../api/api.js';

describe('operation status evidence', () => {
  const status: Autopilot = { state: 'running', lastRunAt: null, nextRunAt: null, lastMessage: 'Menunggu jadwal.', lastImported: 0, lastSubmitted: 0, specializations: [], summary: { considered: 0, eligible: 0, reasons: {} } };
  it('does not invent the interval or a completed cycle', () => {
    const html = renderToStaticMarkup(<OperationStatus data={status} />);
    expect(html).toContain('Belum tercatat');
    expect(html).toContain('Interval saat ini</dt><dd>Tidak tersedia');
    expect(html).not.toContain('bid terkirim pada siklus terakhir');
  });
  it('labels a failed marketplace submission with its recorded time separately from scheduler state', () => {
    const html = renderToStaticMarkup(<OperationStatus data={{ ...status, intervalMinutes: 5, marketplaceNotice: { at: '2026-10-20T00:00:00Z', quotaExhausted: true, reason: 'Kuota habis', retryAt: null } }} />);
    expect(html).toContain('Berjalan');
    expect(html).toContain('pada percobaan terakhir');
    expect(html).toContain('Tercatat');
    expect(html).toContain('5 menit selama server aktif');
  });
});
