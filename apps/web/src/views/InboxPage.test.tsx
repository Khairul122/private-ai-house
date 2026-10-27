import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { Inbox } from '../api/api.js';
import InboxPage from './InboxPage.js';

function render(analysis: Inbox['needsReply'][number]['analysis']) {
  const client = new QueryClient();
  client.setQueryData(['inbox'], { sync: { lastRunAt: '2026-10-27T10:01:00Z', ok: true, error: null },
    needsReply: [{ threadId: '501', projectId: '71', projectTitle: 'API', preview: 'Tambahkan ekspor CSV.',
      lastMessageAt: '2026-10-27T10:00:00Z', waitingHours: 1, analysis }], followUps: [] } satisfies Inbox);
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><InboxPage /></MemoryRouter></QueryClientProvider>);
}

const source = { threadId: '501', messageId: '901', sourceVersion: 'abc', completeness: 'complete' as const,
  completenessReason: null, linkStatus: 'verified' as const, clientProjectId: 'local-1' };

describe('InboxPage analysis', () => {
  it('shows AI suggestions, exact source quotes, local draft, and result time', () => {
    const html = render({ id: 'a1', status: 'succeeded', finishedAt: '2026-10-27T10:02:00Z', error: null, source,
      result: { classification: 'feature', summary: 'Klien meminta ekspor.', summaryQuote: 'Tambahkan ekspor CSV.',
        requirements: [{ id: 'r1', text: 'Ekspor CSV.', evidenceRef: { threadId: '501', messageId: '901', sourceVersion: 'abc', quote: 'Tambahkan ekspor CSV.' } }],
        questions: ['Kolom apa yang diperlukan?'], replyDraft: 'Terima kasih. Kolom apa yang diperlukan?' } });
    expect(html).toContain('Saran AI');
    expect(html).toContain('Tambahkan ekspor CSV.');
    expect(html).toContain('Draf balasan lokal');
    expect(html).toContain('Kolom apa yang diperlukan?');
    expect(html).toContain('pesan 901');
  });

  it('shows incomplete and blocked states without a fabricated draft', () => {
    const html = render({ id: 'a1', status: 'blocked', finishedAt: '2026-10-27T10:02:00Z', error: 'Keluaran AI tidak valid.',
      source: { ...source, completeness: 'truncated', completenessReason: 'Teks dibatasi 4.000 karakter saat dibaca.', linkStatus: 'unlinked', clientProjectId: null }, result: null });
    expect(html).toContain('Sumber terpotong');
    expect(html).toContain('Proyek aktif belum terhubung');
    expect(html).toContain('Analisis terhenti');
    expect(html).not.toContain('Draf balasan lokal');
  });
});
