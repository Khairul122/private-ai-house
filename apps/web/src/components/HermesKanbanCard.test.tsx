import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HermesKanbanCard from './HermesKanbanCard.js';
import type { HermesKanbanStatus, HermesKanbanTask } from '../../../server/src/models/hermes-kanban-types.js';

function renderKanban(data: HermesKanbanStatus | null, isError = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });
  if (data !== null) {
    client.setQueryData(['hermes-kanban'], data);
  }
  if (isError) {
    client.setQueryData(['hermes-kanban'], null);
    client.getQueryCache().find({ queryKey: ['hermes-kanban'] })!.setState({
      status: 'error',
      error: new Error('Gagal memuat kanban Hermes'),
    });
  }

  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <HermesKanbanCard />
    </QueryClientProvider>,
  );
}

describe('HermesKanbanCard responsive stack and move failure handling', () => {
  const sampleTask: HermesKanbanTask = {
    id: 'task-hermes-1',
    title: 'Audit kepatuhan bid otomatis',
    assignee: 'fvh-compliance-auditor',
    status: 'running',
    createdBy: 'mission-control',
    createdAt: '2026-10-25T11:00:00Z',
    startedAt: '2026-10-25T11:05:00Z',
    completedAt: null,
    error: null,
  };

  const sampleStatus: HermesKanbanStatus = {
    available: true,
    reason: 'Hermes aktif dan siap menerima tugas.',
    board: 'fvh-house',
    gateway: 'running',
    checkedAt: '2026-10-25T12:00:00Z',
    oldestReadyAt: null,
    tasks: [sampleTask],
    team: ['fvh-chief-of-staff', 'fvh-compliance-auditor'],
    orchestrationError: null,
  };

  it('renders kanban board with columns and "Pindahkan ke" select with accessible aria-label', () => {
    const html = renderKanban(sampleStatus);
    expect(html).toContain('kanban-board');
    expect(html).toContain('Antre');
    expect(html).toContain('Dikerjakan');
    expect(html).toContain('Butuh Anda');
    expect(html).toContain('Selesai');

    // Task details
    expect(html).toContain('Audit kepatuhan bid otomatis');
    expect(html).toContain('kanban-move-select');
    expect(html).toContain('aria-label="Pindahkan tugas Audit kepatuhan bid otomatis ke tahap lain"');
    expect(html).toContain('Pindahkan ke…');
  });

  it('keeps API error notice and does not turn into an empty state', () => {
    const html = renderKanban(null, true);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Kanban Hermes tidak tersedia.');
    expect(html).not.toContain('Tidak ada kartu');
  });

  it('shows empty state per column when column has no assigned tasks', () => {
    const html = renderKanban(sampleStatus);
    // Task is in 'Dikerjakan', so other columns show 'Tidak ada kartu'
    expect(html).toContain('Tidak ada kartu');
  });
});
