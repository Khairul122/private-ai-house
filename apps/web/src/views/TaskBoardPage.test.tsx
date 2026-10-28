import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import TaskBoardPage, { evaluateTaskBoardMove } from './TaskBoardPage.js';
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

  it('evaluates task board move attempts and enforces policy and confirmation rules', () => {
    // Attempting to move to active column fails because marketplace confirmation is required
    const failToActive = evaluateTaskBoardMove(sampleOpportunity, 'active', 'Terkirim & Diskusi');
    expect(failToActive.allowed).toBe(false);
    expect(failToActive.reason).toContain('Perpindahan ke "Terkirim & Diskusi" gagal');
    expect(failToActive.reason).toContain('konfirmasi marketplace diperlukan sesuai kebijakan');

    // Attempting to move to drafting column fails because status is managed automatically
    const failToDrafting = evaluateTaskBoardMove(sampleOpportunity, 'drafting', 'Draf & Review');
    expect(failToDrafting.allowed).toBe(false);
    expect(failToDrafting.reason).toContain('status kartu dikelola otomatis oleh kebijakan dan sistem');

    // projects.co.id opportunity that is open can be skipped to archived by owner
    const projectsCoIdOpp: Opportunity = {
      ...sampleOpportunity,
      id: 'pco-123',
      source: 'projects_co_id',
      status: 'open',
    };
    const allowSkip = evaluateTaskBoardMove(projectsCoIdOpp, 'archived', 'Selesai / Dilewati');
    expect(allowSkip.allowed).toBe(true);
    expect(allowSkip.reason).toContain('Peluang projects.co.id dapat dilewati oleh pemilik');
  });

  it('provides keyboard-accessible select options and disables current column option', () => {
    const html = renderTaskBoard([sampleOpportunity]);
    // The card is in 'Antrean Peluang' (queue), so the Antrean Peluang option should be disabled
    expect(html).toMatch(/<option[^>]*value="queue"[^>]*disabled=""[^>]*>Antrean Peluang<\/option>/);
    // Other options are enabled for keyboard selection
    expect(html).toContain('<option value="drafting">Draf &amp; Review</option>');
    expect(html).toContain('<option value="active">Terkirim &amp; Diskusi</option>');
    expect(html).toContain('<option value="archived">Selesai / Dilewati</option>');
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
