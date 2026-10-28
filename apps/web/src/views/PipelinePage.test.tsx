import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import PipelinePage from './PipelinePage.js';
import type { BidDraft, Opportunity } from '../api/api.js';

function renderPipeline(data: Array<Opportunity & { latestDraft: BidDraft | null }> | null, isError = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (isError) {
    client.setQueryDefaults(['pipeline'], {
      queryFn: () => Promise.reject(new Error('Gagal memuat pipeline')),
    });
  } else if (data) {
    client.setQueryData(['pipeline'], data);
  }
  client.setQueryData(['insights'], {
    summary: { considered: 0, eligible: 0, reasons: {} },
    analytics: null,
  });

  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PipelinePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PipelinePage responsive card adaptations', () => {
  const sampleProject: Opportunity & { latestDraft: BidDraft | null } = {
    id: 'opp-101',
    title: 'Sistem Pembayaran Otomatis',
    description: 'Integrasi gateway pembayaran dengan webhook',
    clientName: 'PT Maju Terus',
    budgetMin: 500,
    budgetMax: 1500,
    currency: 'USD',
    skills: ['TypeScript', 'Fastify', 'React'],
    deadlineDays: 7,
    briefQuality: 85,
    riskScore: 10,
    status: 'open',
    source: 'freelancer',
    pipelineStatus: 'draft_ready',
    createdAt: '2026-10-25T08:30:00Z',
    score: 88,
    factors: [{ key: 'skills', label: 'Keahlian', points: 30, value: 'Sesuai' }],
    latestDraft: {
      id: 'draft-101',
      projectId: 'opp-101',
      proposal: 'Proposal integrasi sistem pembayaran otomatis.',
      proposedPrice: 1200,
      currency: 'USD',
      durationDays: 5,
      confidence: 85,
      evidence: [],
      assumptions: ['API gateway siap digunakan'],
      status: 'draft_ready',
      createdAt: '2026-10-25T09:00:00Z',
    },
  };

  it('displays ID, title, status, source label, date, and action link on pipeline cards', () => {
    const html = renderPipeline([sampleProject]);
    // Card wrapper
    expect(html).toContain('pipeline-card');
    // ID
    expect(html).toContain('ID: opp-101');
    // Title
    expect(html).toContain('Sistem Pembayaran Otomatis');
    // Status
    expect(html).toContain('Draf siap');
    // Source label
    expect(html).toContain('Freelancer');
    // Date
    expect(html).toContain('25 Okt 2026');
    // Action link
    expect(html).toContain('Lihat draf dan detail');
  });

  it('keeps API error as an error notice and does not turn into an empty state', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, retryOnMount: false } },
    });
    client.setQueryData(['pipeline'], [sampleProject]);
    client.getQueryCache().find({ queryKey: ['pipeline'] })!.setState({
      status: 'error',
      error: new Error('Pipeline error'),
    });
    client.setQueryData(['insights'], null);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PipelinePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('Pipeline belum dapat dimuat.');
    expect(html).not.toContain('Belum ada proyek di pipeline');
  });

  it('displays real empty state when there are truly no opportunities stored', () => {
    const html = renderPipeline([]);
    expect(html).toContain('Belum ada proyek di pipeline');
    expect(html).toContain('Buka peluang');
    expect(html).toContain('Periksa integrasi');
  });
});
