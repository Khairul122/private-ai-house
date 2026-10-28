import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmptyState, ErrorNotice, LoadingPanel, OperationStatus, SkipLink, LiveAnnouncer, VisuallyHidden } from './ui.js';
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
describe('accessibility primitives', () => {
  it('renders a skip link pointing to a target with accessible label', () => {
    const html = renderToStaticMarkup(<SkipLink targetId="vo3d-controls" label="Lewati ke kontrol kantor" />);
    expect(html).toContain('class="vo3d-skip-link"');
    expect(html).toContain('href="#vo3d-controls"');
    expect(html).toContain('Lewati ke kontrol kantor');
  });

  it('renders live announcer for screen reader announcements', () => {
    const polite = renderToStaticMarkup(<LiveAnnouncer message="Lantai 2 aktif" politeness="polite" />);
    expect(polite).toContain('role="status"');
    expect(polite).toContain('aria-live="polite"');
    expect(polite).toContain('Lantai 2 aktif');

    const assertive = renderToStaticMarkup(<LiveAnnouncer message="Jeda darurat" politeness="assertive" />);
    expect(assertive).toContain('role="alert"');
    expect(assertive).toContain('aria-live="assertive"');
    expect(assertive).toContain('Jeda darurat');
  });

  it('renders visually hidden content for assistive technology', () => {
    const html = renderToStaticMarkup(<VisuallyHidden>Teks pembaca layar</VisuallyHidden>);
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('Teks pembaca layar');
  });
});
