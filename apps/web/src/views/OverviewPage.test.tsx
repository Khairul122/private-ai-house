import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ClientProject, Inbox, Work } from '../api/api.js';
import OverviewPage from './OverviewPage.js';

const project: ClientProject = {
  id: 'project-1', title: 'Situs klien', client: 'Klien A', source: 'direct', externalProjectId: null,
  status: 'active', deadline: '2026-10-20', value: null, currency: 'IDR', createdAt: '2026-10-18T00:00:00Z', daysToDeadline: 0,
};

function render(inbox: Inbox, projects: ClientProject[]) {
  const client = new QueryClient();
  client.setQueryData(['dashboard'], {
    counts: { openProjects: 0, drafts: 0, submittedBids: 0, knowledgeSources: 0 },
    policy: { state: 'paused', version: 1, simulationOnly: false }, profileComplete: true,
    activity: [], externalWrites: false,
  });
  client.setQueryData(['projects', 'overview'], []);
  client.setQueryData(['autopilot'], {
    state: 'paused', lastRunAt: null, nextRunAt: null, lastMessage: 'Automasi dijeda.', lastImported: 0, lastSubmitted: 0, specializations: [],
  });
  client.setQueryData(['inbox'], inbox);
  client.setQueryData(['work'], { projects, payments: [], income: { month: '2026-10', received: [], expected: [] }, dueSoon: 1 } satisfies Work);
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><OverviewPage /></MemoryRouter></QueryClientProvider>);
}

describe('tablet overview', () => {
  it('does not treat failed message sync as an empty inbox', () => {
    const html = render({ sync: { lastRunAt: '2026-10-19T00:00:00Z', ok: false, error: 'gagal' }, needsReply: [], followUps: [] }, []);
    expect(html).toContain('Status pesan tidak diketahui');
    expect(html).not.toContain('Belum ada tindakan dari pesan, bid, atau tenggat');
  });

  it('shows only recorded actions, source, and a link to their detail', () => {
    const html = render({
      sync: { lastRunAt: '2026-10-20T00:00:00Z', ok: true, error: null },
      needsReply: [{ threadId: '42', projectId: null, projectTitle: 'Aplikasi klien', preview: 'Butuh revisi', lastMessageAt: '2026-10-20T01:00:00Z', waitingHours: 2 }],
      followUps: [],
    }, [project, { ...project, id: 'project-2', title: 'Proyek bulan depan', daysToDeadline: 12 }]);
    expect(html).toContain('Aplikasi klien');
    expect(html).toContain('Butuh revisi');
    expect(html).toContain('Klien langsung');
    expect(html).toContain('Situs klien');
    expect(html).not.toContain('Proyek bulan depan');
    expect(html).toContain('href="/work"');
  });
});
