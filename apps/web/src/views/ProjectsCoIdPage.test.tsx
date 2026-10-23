import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import ProjectsCoIdPage from './ProjectsCoIdPage.js';
import type { ProjectsCoIdStatus } from '../api/projects-co-id-api.js';

const worker: ProjectsCoIdStatus = {
  mode: 'scan-only', state: 'stopped', busy: false, reason: 'Pemindaian projects.co.id read-only aktif.',
  username: null, remaining: null, checkedAt: null, pageStatus: null,
  lastScanAt: null, lastResult: null, lastSearchTerms: [], searchTerms: [], autoAvailable: false,
  draftsInProgress: 0, projectCount: 0, readyDrafts: 0, blockedWrites: 0,
  draftUsage: { today: 0, week: 0, dailyLimit: 0, weeklyLimit: 0 },
};

function render(client: QueryClient) {
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><ProjectsCoIdPage /></MemoryRouter></QueryClientProvider>);
}

describe('projects.co.id stored data', () => {
  it('shows scanning disabled without inventing account evidence', () => {
    const client = new QueryClient();
    client.setQueryData(['projects-co-id'], worker);
    client.setQueryData(['projects-co-id-drafts'], []);
    const html = render(client);
    expect(html).toContain('GET read-only');
    expect(html).toContain('Baca penawaran');
    expect(html).not.toContain('HTTP 200');
    expect(html).not.toContain('Akun teramati');
    client.clear();
  });

  it('discards stale status after a read error and shows unknown counts', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
    client.setQueryData(['projects-co-id'], worker);
    client.getQueryCache().find({ queryKey: ['projects-co-id'] })!.setState({ status: 'error', error: new Error('API tidak tersedia') });
    const html = render(client);
    expect(html).not.toContain('KhairulHuda06');
    expect(html).toContain('Status tidak tersedia');
    expect(html).toContain('Status tidak tersedia');
    client.clear();
  });
});
