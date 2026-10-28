import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import CalendarPage from './CalendarPage.js';
import type { Policy, Opportunity, Autopilot, Work } from '../api/api.js';

function setupClient(options: {
  policy?: Policy;
  projects?: Opportunity[];
  work?: Work;
  autopilot?: Autopilot;
  policyError?: boolean;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });

  const basePolicy: Policy = {
    version: 14,
    state: 'active',
    simulationOnly: false,
    timezone: 'Asia/Jakarta',
    activeDays: [1, 2, 3, 4, 5],
    activeHours: { start: 9, end: 18 },
    expiresAt: '2026-10-31T00:00:00Z',
    minPrice: 50,
    maxPrice: 2000,
    maxRiskScore: 30,
    dailyBidLimit: 10,
    weeklyBidLimit: 50,
    allowedActions: ['bid'],
    primaryField: 'Full Stack Development',
    specializations: [],
    keywords: [],
    minimumConfidence: 70,
    noNegotiationTerms: [],
    scanIntervalMinutes: 5,
  };

  const baseAutopilot: Autopilot = {
    state: 'running',
    lastRunAt: '2026-10-25T10:00:00Z',
    nextRunAt: '2026-10-25T10:05:00Z',
    lastMessage: 'Operasi aktif.',
    lastImported: 5,
    lastSubmitted: 1,
    cycleInProgress: false,
    intervalMinutes: 5,
    specializations: [],
  };

  const baseWork: Work = {
    projects: [
      {
        id: 'work-1',
        title: 'Pengembangan API Fastify',
        client: 'Klien Tech',
        source: 'freelancer',
        externalProjectId: null,
        status: 'active',
        deadline: '2026-10-28',
        value: 1000,
        currency: 'USD',
        createdAt: '2026-10-20T00:00:00Z',
        daysToDeadline: 1,
      },
    ],
    payments: [
      {
        id: 'pay-1',
        projectId: 'work-1',
        amount: 500,
        currency: 'USD',
        status: 'expected',
        dueDate: '2026-10-29',
        receivedAt: null,
        note: 'Uang muka',
        createdAt: '2026-10-20T00:00:00Z',
      },
    ],
    income: { month: '2026-10', received: [], expected: [] },
    dueSoon: 1,
  };

  client.setQueryData(['policy'], options.policy ?? basePolicy);
  client.setQueryData(['projects', 'calendar'], options.projects ?? []);
  client.setQueryData(['dashboard'], {
    counts: { openProjects: 1, drafts: 1, policySkips: 0 },
    bidUsage: { today: 2, week: 8 },
  });
  client.setQueryData(['autopilot'], options.autopilot ?? baseAutopilot);
  client.setQueryData(['work'], options.work ?? baseWork);
  client.setQueryData(['operations'], {
    clients: [],
    notes: [],
    tasks: [],
    invoices: [],
    identity: null,
    briefings: [],
    messages: [],
    projects: [],
    payments: [],
    runtime: { running: true, jobs: {} },
    whatsapp: null,
    google: null,
  });
  client.setQueryData(['agenda', 'summary'], {
    timezone: 'Asia/Jakarta',
    days: {},
  });

  if (options.policyError) {
    client.getQueryCache().find({ queryKey: ['policy'] })!.setState({
      status: 'error',
      error: new Error('Gagal memuat kebijakan kalender'),
    });
  }

  return client;
}

describe('CalendarPage mobile agenda, status, and error states', () => {
  it('renders agenda tabs, period heading, status, action links, and visible source labels', () => {
    const client = setupClient({});
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/calendar?view=agenda']}>
          <CalendarPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Agenda tab
    expect(html).toContain('Agenda');
    expect(html).toContain('Hari');
    expect(html).toContain('Bulan');
    expect(html).toContain('Tahun');

    // Automation status
    expect(html).toContain('Jadwal automasi');
    expect(html).toContain('Batas Penawaran Harian');

    // Project deadline event & source label
    expect(html).toContain('Tenggat: Pengembangan API Fastify');
    expect(html).toContain('Freelancer');
    expect(html).toContain('href="/work"');
    expect(html).toContain('Buka detail');

    // Payment event & source label
    expect(html).toContain('Pembayaran diharapkan');
    expect(html).toContain('Pembayaran klien');

    // Policy event & source label
    expect(html).toContain('Masa berlaku kebijakan berakhir');
    expect(html).toContain('Kebijakan');
  });

  it('keeps error notice when calendar queries fail and does not show an empty state', () => {
    const client = setupClient({ policyError: true });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/calendar?view=agenda']}>
          <CalendarPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('Gagal memuat data kalender.');
    expect(html).not.toContain('Belum ada agenda pada tanggal ini');
  });

  it('displays true empty state when no agenda events exist on selected date', () => {
    const client = setupClient({
      work: {
        projects: [],
        payments: [],
        income: { month: '2026-10', received: [], expected: [] },
        dueSoon: 0,
      },
      autopilot: {
        state: 'paused',
        lastRunAt: null,
        nextRunAt: null,
        lastMessage: 'Dijeda.',
        lastImported: 0,
        lastSubmitted: 0,
        cycleInProgress: false,
        specializations: [],
      },
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/calendar?view=agenda']}>
          <CalendarPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('Belum ada tenggat proyek klien.');
  });
});
