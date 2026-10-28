import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import WorkPage from './WorkPage.js';
import type { Work, Profile } from '../api/api.js';

function renderWork(workData: Work | null, isError = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });
  const profile: Profile = {
    primaryField: 'Full Stack Development',
    specializations: ['TypeScript', 'Fastify', 'React'],
    language: 'id',
    currency: 'USD',
    timezone: 'Asia/Jakarta',
    minPrice: 50,
    maxPrice: 2000,
    facts: [],
  };
  client.setQueryData(['profile'], profile);

  if (workData !== null) {
    client.setQueryData(['work'], workData);
  }
  if (isError) {
    client.setQueryData(['work'], {
      projects: [],
      payments: [],
      income: { month: '2026-10', received: [], expected: [] },
      dueSoon: 0,
    });
    client.getQueryCache().find({ queryKey: ['work'] })!.setState({
      status: 'error',
      error: new Error('Gagal memuat proyek & pendapatan'),
    });
  }

  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WorkPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WorkPage responsive invoice and payment card adaptations', () => {
  const sampleWork: Work = {
    projects: [
      {
        id: 'proj-401',
        title: 'Platform Finansial Klien',
        client: 'PT Finansial Unggul',
        source: 'direct',
        externalProjectId: null,
        status: 'active',
        deadline: '2026-11-01',
        value: 25000000,
        currency: 'IDR',
        createdAt: '2026-10-20T00:00:00Z',
        daysToDeadline: 4,
      },
    ],
    payments: [
      {
        id: 'pay-777',
        projectId: 'proj-401',
        amount: 12500000,
        currency: 'IDR',
        status: 'expected',
        dueDate: '2026-10-31',
        receivedAt: null,
        note: 'Termin 1 (DP 50%)',
        createdAt: '2026-10-20T00:00:00Z',
      },
    ],
    income: {
      month: '2026-10',
      received: [],
      expected: [{ currency: 'IDR', total: 12500000 }],
    },
    dueSoon: 0,
  };

  it('displays ID, project, amount/currency, status, due date, and action on invoice cards', () => {
    const html = renderWork(sampleWork);
    // Card class
    expect(html).toContain('invoice-card');
    // ID
    expect(html).toContain('ID: pay-777');
    // Proyek
    expect(html).toContain('Platform Finansial Klien');
    // Jumlah dan mata uang
    expect(html).toContain('12.500.000');
    expect(html).toContain('Rp');
    // Status
    expect(html).toContain('Menunggu');
    // Jatuh tempo
    expect(html).toContain('Jatuh tempo: 2026-10-31');
    // Aksi
    expect(html).toContain('Tandai diterima');
  });

  it('preserves error alert when API fails without transforming into empty state', () => {
    const html = renderWork(null, true);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Data proyek belum dapat dimuat.');
    expect(html).not.toContain('Belum ada pembayaran tertunda');
  });

  it('displays real empty state when no payments are pending', () => {
    const html = renderWork({
      projects: sampleWork.projects,
      payments: [],
      income: { month: '2026-10', received: [], expected: [] },
      dueSoon: 0,
    });
    expect(html).toContain('Belum ada pembayaran tertunda');
    expect(html).toContain('Catat pembayaran');
  });
});
