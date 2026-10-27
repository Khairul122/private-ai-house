import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { DailyPrioritySummary } from '../../../server/src/models/daily-priority-types.js';
import OverviewPage from './OverviewPage.js';

const capturedAt = '2026-10-27T01:00:00Z';
const available = { state: 'available' as const, observedAt: capturedAt, reason: null };
const summary: DailyPrioritySummary = {
  day: '2026-10-27', revision: 1, capturedAt, state: 'complete',
  sources: { messages: available, projects: available, tasks: available, invoices: available, payments: available, kanban: available, reports: available },
  reports: [{ id: '2:2026-10-27T01', floor: 2, createdAt: capturedAt, state: 'reviewed' }],
  items: [{ id: 'messages:501', source: 'messages', sourceId: '501', kind: 'reply', title: 'Balas percakapan #501', reason: 'Pesan terakhir dari klien.', decision: 'Periksa dan balas.', href: '/inbox', observedAt: capturedAt, dueAt: null, rule: 'reply_waiting' }],
};

function render(priority: { day: string; summary: DailyPrioritySummary | null; job: { busy: boolean; error: string | null } | null }) {
  const client = new QueryClient();
  client.setQueryData(['dashboard'], {
    counts: { openProjects: 0, drafts: 0, submittedBids: 0, knowledgeSources: 0 },
    policy: { state: 'paused', version: 1, simulationOnly: false }, profileComplete: true,
    activity: [], externalWrites: false,
  });
  client.setQueryData(['projects', 'overview'], []);
  client.setQueryData(['autopilot'], { state: 'paused', lastRunAt: null, nextRunAt: null, lastMessage: 'Automasi dijeda.', lastImported: 0, lastSubmitted: 0, specializations: [] });
  client.setQueryData(['daily-priority'], priority);
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><OverviewPage /></MemoryRouter></QueryClientProvider>);
}

describe('daily priority in overview', () => {
  it('marks failed sources and does not show an invented empty or live message status', () => {
    const partial: DailyPrioritySummary = { ...summary, state: 'partial', items: [], sources: { ...summary.sources, messages: { state: 'failed', observedAt: capturedAt, reason: 'Sinkronisasi gagal.' } } };
    const html = render({ day: partial.day, summary: partial, job: null });
    expect(html).toContain('Sebagian sumber gagal');
    expect(html).toContain('Sinkronisasi gagal.');
    expect(html).toContain('Belum ada tindakan dari sumber yang terbaca');
    expect(html).not.toContain('Balas percakapan');
  });

  it('shows stored action, reason, decision, source link and labeled AI review', () => {
    const html = render({ day: summary.day, summary, job: null });
    expect(html).toContain('Balas percakapan #501');
    expect(html).toContain('Pesan terakhir dari klien.');
    expect(html).toContain('Keputusan Anda: Periksa dan balas.');
    expect(html).toContain('href="/inbox"');
    expect(html).toContain('tinjauan Hermes adalah saran AI');
  });
});
