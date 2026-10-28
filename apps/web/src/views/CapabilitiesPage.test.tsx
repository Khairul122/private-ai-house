import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import CapabilitiesPage from './CapabilitiesPage.js';
import type { Autopilot, Capabilities } from '../api/api.js';

function setupClient(options: {
  capabilitiesError?: boolean;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });

  const baseCapabilities: Capabilities = {
    freelancerCredentials: {
      accessTokenConfigured: true,
      productionWriteConfigured: false,
      sandboxWriteTestConfigured: true,
      verificationStatus: 'verified',
      readProfile: true,
      readProjects: true,
      readPortfolio: true,
      readMessages: true,
    },
    github: {
      read: 'supported',
      tokenConfigured: true,
      scope: 'repo (read-only)',
      verificationStatus: 'supported',
    },
    linkedin: {
      read: 'unverified',
      clientConfigured: true,
      authorized: false,
      verificationStatus: 'unverified',
      reason: 'Belum dihubungkan.',
      redirectUri: 'http://127.0.0.1:3001/api/linkedin/callback',
      accessTokenExpiresAt: null,
    },
    hermes: {
      draft: 'supported',
      active: true,
      reason: 'Hermes aktif.',
      draftsInProgress: 0,
    },
    marketplace: [
      {
        operation: 'search_projects',
        status: 'supported',
        evidence: 'GET /projects/0.1/projects/active/',
        sandboxVerification: {
          statusCode: 200,
          checkedAt: '2026-10-25T10:00:00Z',
        },
      },
      {
        operation: 'submit_bid',
        status: 'supported',
        evidence: 'POST /projects/0.1/bids/',
        sandboxVerification: {
          statusCode: 200,
          checkedAt: '2026-10-25T10:00:00Z',
        },
        productionVerification: {
          statusCode: 200,
          checkedAt: '2026-10-26T12:00:00Z',
        },
      },
    ],
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

  client.setQueryData(['capabilities'], baseCapabilities);
  client.setQueryData(['autopilot'], baseAutopilot);
  client.setQueryData(['activity', 'bids'], []);

  if (options.capabilitiesError) {
    client.getQueryCache().find({ queryKey: ['capabilities'] })!.setState({
      status: 'error',
      error: new Error('Gagal memuat status integrasi'),
    });
  }

  return client;
}

describe('CapabilitiesPage responsive cards, integration labels, and error states', () => {
  it('renders responsive capability cards with labels for Freelancer, GitHub, LinkedIn, and Hermes', () => {
    const client = setupClient({});
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CapabilitiesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Responsive cards structure
    expect(html).toContain('capability-card');
    expect(html).toContain('capability-row');

    // Integration sources and headings
    expect(html).toContain('API Freelancer.com');
    expect(html).toContain('GitHub');
    expect(html).toContain('LinkedIn');
    expect(html).toContain('Hermes Agent');

    // Operations and evidence
    expect(html).toContain('Cari proyek');
    expect(html).toContain('Kirim bid');
    expect(html).toContain('HTTP 200 · Sandbox');
  });

  it('keeps error notice when capabilities query fails and does not show cards', () => {
    const client = setupClient({ capabilitiesError: true });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CapabilitiesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('Status integrasi belum dapat dimuat.');
    expect(html).not.toContain('Akses API Freelancer');
    expect(html).not.toContain('capability-card');
  });

  it('renders health check card with inspection controls', () => {
    const client = setupClient({});
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <CapabilitiesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('Apa yang perlu diperbaiki');
    expect(html).toContain('Periksa semua integrasi');
    expect(html).toContain('Belum ada hasil pemeriksaan');
  });
});
