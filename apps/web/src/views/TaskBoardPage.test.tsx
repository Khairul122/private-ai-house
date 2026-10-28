import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import TaskBoardPage from './TaskBoardPage.js';
import type { BidDraft, Opportunity } from '../api/api.js';

function renderTaskBoard(data: Array<Opportunity & { latestDraft: BidDraft | null }> | null, isError = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });
  if (data !== null) {
    client.setQueryData(['pipeline'], data);
  }
  if (isError) {
    client.setQueryData(['pipeline'], []);
    client.getQueryCache().find({ queryKey: ['pipeline'] })!.setState({
      status: 'error',
      error: new Error('Gagal memuat papan tugas'),
    });
  }
  // Disable Hermes Kanban in task board for focused unit testing
  client.setQueryData(['hermes-kanban'], null);

  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TaskBoardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TaskBoardPage responsive kanban stack and move controls', () => {
  const sampleOpportunity: Opportunity & { latestDraft: BidDraft | null } = {
    id: 'opp-202',
    title: 'Migrasi PostgreSQL Supabase',
    description: 'Migrasi database dan sinkronisasi skema fvh',
    clientName: 'PT Teknologi Mandiri',
    budgetMin: 300,
    budgetMax: 800,
    currency: 'USD',
    skills: ['PostgreSQL', 'SQL', 'Node.js'],
    deadlineDays: 5,
    briefQuality: 90,
    riskScore: 5,
    status: 'open',
    source: 'freelancer',
    pipelineStatus: 'scored',
    score: 85,
    factors: [],
    latestDraft: null,
  };

  it('renders kanban board with columns and "Pindahkan ke" select control with aria-label', () => {
    const html = renderTaskBoard([sampleOpportunity]);
    expect(html).toContain('kanban-board');
    expect(html).toContain('Antrean Peluang');
    expect(html).toContain('Draf &amp; Review');
    expect(html).toContain('Terkirim &amp; Diskusi');
    expect(html).toContain('Selesai / Dilewati');

    // Card and move control
    expect(html).toContain('Migrasi PostgreSQL Supabase');
    expect(html).toContain('kanban-move-select');
    expect(html).toContain('aria-label="Pindahkan peluang Migrasi PostgreSQL Supabase ke tahap lain"');
    expect(html).toContain('Pindahkan ke…');
    expect(html).toContain('Freelancer.com · PT Teknologi Mandiri');
  });

  it('keeps API error notice and does not turn into an empty state', () => {
    const html = renderTaskBoard(null, true);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Gagal memuat data papan tugas.');
    expect(html).not.toContain('Tidak ada kartu di tahap antrean peluang');
  });

  it('displays empty column state when a column has no cards', () => {
    const html = renderTaskBoard([sampleOpportunity]);
    // The other columns have no cards
    expect(html).toContain('Tidak ada kartu di tahap draf &amp; review');
    expect(html).toContain('Tidak ada kartu di tahap terkirim &amp; diskusi');
    expect(html).toContain('Tidak ada kartu di tahap selesai / dilewati');
  });
});
