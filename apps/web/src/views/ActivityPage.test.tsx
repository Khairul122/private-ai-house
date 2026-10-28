import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import ActivityPage from './ActivityPage.js';
import type { AuditEvent } from '../api/api.js';

function renderActivity(data: AuditEvent[] | null, isError = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });
  if (data !== null) {
    client.setQueryData(['activity', 100], data);
  }
  if (isError) {
    client.setQueryData(['activity', 100], []);
    client.getQueryCache().find({ queryKey: ['activity', 100] })!.setState({
      status: 'error',
      error: new Error('Gagal memuat log aktivitas'),
    });
  }

  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ActivityPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ActivityPage and ActivityRows responsive audit cards', () => {
  const sampleEvents: AuditEvent[] = [
    {
      id: 'audit-1',
      type: 'marketplace.production.submit_bid',
      resourceId: 'freelancer-project-99',
      status: 'recorded',
      reason: 'Bid berhasil dikirim ke Freelancer API.',
      policyVersion: 14,
      payloadHash: 'abcdef0123456789deadbeef',
      createdAt: '2026-10-25T14:20:00Z',
    },
    {
      id: 'audit-2',
      type: 'projects_co_id.owner_marked_sent',
      resourceId: 'projects_co_id_xyz789',
      status: 'allowed',
      reason: 'Ditandai terkirim oleh pemilik; tidak diverifikasi aplikasi.',
      policyVersion: null,
      payloadHash: null,
      createdAt: '2026-10-26T10:00:00Z',
    },
  ];

  it('displays timestamp, event, status, source label, summary, and additional details', () => {
    const html = renderActivity(sampleEvents);
    // Card class
    expect(html).toContain('activity-card');
    // Source labels visible
    expect(html).toContain('Freelancer');
    expect(html).toContain('projects.co.id');
    // Timestamps
    expect(html).toContain('25 Okt 2026');
    expect(html).toContain('26 Okt 2026');
    // Event titles
    expect(html).toContain('Bid dikirim ke Freelancer');
    // Status
    expect(html).toContain('Tercatat');
    expect(html).toContain('Diizinkan');
    // Reason / summary
    expect(html).toContain('Bid berhasil dikirim ke Freelancer API.');
    expect(html).toContain('Ditandai terkirim oleh pemilik; tidak diverifikasi aplikasi.');
    // Additional details: resourceId, policyVersion, payloadHash, event ID
    expect(html).toContain('Sumber daya: freelancer-project-99');
    expect(html).toContain('Kebijakan v14');
    expect(html).toContain('Hash payload: abcdef0123456789');
    expect(html).toContain('ID: audit-1');
    expect(html).toContain('ID: audit-2');
  });

  it('retains API error notice without changing to an empty state', () => {
    const html = renderActivity(null, true);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Log aktivitas belum dapat dimuat.');
    expect(html).not.toContain('Belum ada aktivitas tercatat');
  });

  it('renders real empty state when no activity events exist', () => {
    const html = renderActivity([]);
    expect(html).toContain('Belum ada aktivitas tercatat');
    expect(html).toContain('Keputusan autopilot, draf, bid, dan impor akan muncul di sini setelah aplikasi bekerja.');
  });
});
