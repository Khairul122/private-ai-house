import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import KnowledgePage from './KnowledgePage.js';
import type { Capabilities } from '../api/api.js';

function setupClient(options: {
  knowledgeError?: boolean;
  sources?: Array<{
    id: string;
    provider: string;
    label: string;
    referenceUrl: string;
    updatedAt: string;
    chunkCount: number;
  }>;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });

  const baseSources = options.sources ?? [
    {
      id: 'src-1',
      provider: 'github',
      label: 'Khairul122/private-ai-house',
      referenceUrl: 'https://github.com/Khairul122/private-ai-house',
      updatedAt: '2026-10-25T12:00:00Z',
      chunkCount: 42,
    },
    {
      id: 'src-2',
      provider: 'manual',
      label: 'Ringkasan Portofolio Full-Stack',
      referenceUrl: '',
      updatedAt: '2026-10-26T08:00:00Z',
      chunkCount: 15,
    },
  ];

  client.setQueryData(['knowledge'], {
    sources: baseSources,
    coverage: {
      sources: baseSources.length,
      chunks: baseSources.reduce((acc, s) => acc + s.chunkCount, 0),
    },
  });

  client.setQueryData(['knowledge-sync'], {
    job: null,
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
    marketplace: [],
  };

  client.setQueryData(['capabilities'], baseCapabilities);

  if (options.knowledgeError) {
    client.getQueryCache().find({ queryKey: ['knowledge'] })!.setState({
      status: 'error',
      error: new Error('Koneksi ke knowledge hub terputus'),
    });
  }

  return client;
}

describe('KnowledgePage responsive cards, provider labels, and error states', () => {
  it('renders responsive source cards with provider label, chunk count, and action buttons', () => {
    const client = setupClient({});
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <KnowledgePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Responsive cards structure
    expect(html).toContain('source-card');
    expect(html).toContain('source-row');

    // Provider labels visible
    expect(html).toContain('github');
    expect(html).toContain('manual');
    expect(html).toContain('Khairul122/private-ai-house');
    expect(html).toContain('Ringkasan Portofolio Full-Stack');

    // Chunks and dates
    expect(html).toContain('42 potongan');
    expect(html).toContain('15 potongan');

    // Actions
    expect(html).toContain('Sinkron ulang');
    expect(html).toContain('Hapus sumber');
  });

  it('keeps error notice when knowledge query fails and does not show an empty state', () => {
    const client = setupClient({ knowledgeError: true });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <KnowledgePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('Status knowledge hub belum dapat dimuat.');
    expect(html).not.toContain('Belum ada sumber terindeks');
  });

  it('displays true empty state when no sources exist', () => {
    const client = setupClient({ sources: [] });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <KnowledgePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(html).toContain('Belum ada sumber terindeks');
    expect(html).not.toContain('source-card');
  });
});
