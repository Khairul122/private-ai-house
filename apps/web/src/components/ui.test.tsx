import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState, ErrorNotice, LoadingPanel, OperationStatus } from './ui.js';
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
  it('separates a running cycle from the previous cycle result', () => {
    const html = renderToStaticMarkup(<OperationStatus data={{ ...status, cycleInProgress: true, lastRunAt: '2026-10-20T00:00:00Z', lastMessage: 'Siklus otomatis gagal.' }} />);
    expect(html).toContain('Siklus sedang berjalan');
    expect(html).toContain('Hasil siklus sebelumnya: Siklus otomatis gagal.');
  });
});

describe('data state primitives', () => {
  it('announces loading and exposes busy state to assistive tech', () => {
    const html = renderToStaticMarkup(<LoadingPanel label="Memuat pesan..." />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Memuat pesan...');
  });

  it('keeps error text as the message and offers a retry label', () => {
    const html = renderToStaticMarkup(<ErrorNotice message="Kotak masuk gagal dimuat." onRetry={() => undefined} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Kotak masuk gagal dimuat.');
    expect(html).toContain('>Coba lagi</button>');
  });

  it('renders an empty state with a cause and optional action', () => {
    const html = renderToStaticMarkup(<EmptyState title="Belum ada peluang tersimpan" description="Peluang muncul setelah pemindaian berhasil." action={<a href="/policy">Buka kebijakan</a>} />);
    expect(html).toContain('empty-state-action');
    expect(html).toContain('Belum ada peluang tersimpan');
    expect(html).toContain('Buka kebijakan');
  });
});
