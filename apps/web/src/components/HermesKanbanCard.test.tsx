import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HermesKanbanCard, { evaluateHermesTaskMove, TaskCard } from './HermesKanbanCard.js';
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

  it('evaluates task move restrictions and provides clear move failure messages', () => {
    // Attempting to move a running task to other stages fails because Hermes manages execution
    const failToDone = evaluateHermesTaskMove(sampleTask, 'Selesai');
    expect(failToDone.allowed).toBe(false);
    expect(failToDone.reason).toContain('Perpindahan ke "Selesai" gagal');
    expect(failToDone.reason).toContain('status kartu Hermes dikelola otomatis oleh eksekusi agen');

    const failToQueue = evaluateHermesTaskMove(sampleTask, 'Antre');
    expect(failToQueue.allowed).toBe(false);
    expect(failToQueue.reason).toContain('Perpindahan ke "Antre" gagal');

    // A blocked task can be recovered back to Antre
    const blockedTask: HermesKanbanTask = { ...sampleTask, status: 'blocked' };
    const allowBlocked = evaluateHermesTaskMove(blockedTask, 'Antre');
    expect(allowBlocked.allowed).toBe(true);
    expect(allowBlocked.reason).toBe('Lanjutkan kartu dari kontrol perpindahan.');

    // A scheduled task can also be recovered to Antre
    const scheduledTask: HermesKanbanTask = { ...sampleTask, status: 'scheduled' };
    const allowScheduled = evaluateHermesTaskMove(scheduledTask, 'Antre');
    expect(allowScheduled.allowed).toBe(true);
  });

  it('renders kanban move error message with role="alert" when a move failure occurs', () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <TaskCard task={sampleTask} initialMoveError='Perpindahan ke "Selesai" gagal: status kartu Hermes dikelola otomatis oleh eksekusi agen.' />
      </QueryClientProvider>,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('kanban-move-error');
    expect(html).toContain('Perpindahan ke &quot;Selesai&quot; gagal: status kartu Hermes dikelola otomatis oleh eksekusi agen.');
  });

  it('provides accessible keyboard attributes and disables current column in move select', () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <TaskCard task={sampleTask} />
      </QueryClientProvider>,
    );

    // Keyboard action: native select with aria-label and disabled current column (Dikerjakan)
    expect(html).toContain('<select aria-label="Pindahkan tugas Audit kepatuhan bid otomatis ke tahap lain" class="kanban-move-select"');
    expect(html).toContain('<option value="" disabled="" selected="">Pindahkan ke…</option>');
    // The task is running ('Dikerjakan'), so Dikerjakan option should be disabled
    expect(html).toMatch(/<option[^>]*disabled=""[^>]*>Dikerjakan<\/option>/);
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
