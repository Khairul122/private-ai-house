import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import ProjectsCoIdPage from './ProjectsCoIdPage.js';
import type { ProjectsCoIdStatus } from '../api/projects-co-id-api.js';

const worker: ProjectsCoIdStatus = {
  mode: 'scan-only', state: 'login_required', busy: false, reason: 'Login perlu diperiksa.',
  username: null, remaining: null, checkedAt: '2026-10-20T01:02:00Z', pageStatus: 200,
  lastScanAt: null, lastResult: null, lastSearchTerms: [], searchTerms: [], autoAvailable: false,
  draftsInProgress: 0, projectCount: 0, readyDrafts: 0, blockedWrites: 0,
  draftUsage: { today: 0, week: 0, dailyLimit: 4, weeklyLimit: 12 },
};

function render(client: QueryClient) {
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><ProjectsCoIdPage /></MemoryRouter></QueryClientProvider>);
}

describe('projects.co.id account evidence', () => {
  it('keeps account identity unknown even when the page responds HTTP 200', () => {
    const client = new QueryClient();
    client.setQueryData(['projects-co-id'], worker);
    client.setQueryData(['projects-co-id-drafts'], []);
    const html = render(client);
    expect(html).toContain('HTTP 200');
    expect(html).toContain('Akun teramati</dt><dd>Tidak diketahui');
    expect(html).toContain('Perlu login');
    expect(html).toContain('Pemeriksaan akun');
    client.clear();
  });

  it('hides a retained successful account check after a read error and does not invent an empty queue', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
    client.setQueryData(['projects-co-id'], { ...worker, state: 'ready', username: 'KhairulHuda06' });
    client.getQueryCache().find({ queryKey: ['projects-co-id'] })!.setState({ status: 'error', error: new Error('API tidak tersedia') });
    const html = render(client);
    expect(html).not.toContain('HTTP 200');
    expect(html).not.toContain('KhairulHuda06');
    expect(html).toContain('Status worker tidak tersedia');
    expect(html).toContain('Draf siap dikirim (–)');
    client.clear();
  });
});
