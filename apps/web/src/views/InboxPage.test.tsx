import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { Inbox } from '../api/api.js';
import InboxPage from './InboxPage.js';

function render(snapshot: Inbox['needsReply'][number]['snapshot']) {
  const client = new QueryClient();
  client.setQueryData(['inbox'], {
    sync: { lastRunAt: '2026-10-27T10:01:00Z', ok: true, error: null },
    needsReply: [{
      threadId: '501', projectId: '71', projectTitle: 'API', preview: 'Tambahkan ekspor CSV.',
      lastMessageAt: '2026-10-27T10:00:00Z', waitingHours: 1, snapshot,
    }],
    followUps: [],
    messageIntel: { available: true, reason: null, counts: { snapshots: 1, analyzable: 1, succeeded: 1, blocked: 0 } },
  } satisfies Inbox);
  return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><InboxPage /></MemoryRouter></QueryClientProvider>);
}

const baseSnapshot = {
  sourceVersion: 'abc',
  messageId: '901',
  capturedAt: '2026-10-27T10:01:00Z',
  completeness: 'complete' as const,
  completenessReason: null,
  linkStatus: 'linked' as const,
  clientProjectId: 'local-1',
};

describe('InboxPage analysis', () => {
  it('shows AI suggestions, exact source quotes, local draft, and result time', () => {
    const html = render({
      ...baseSnapshot,
      analysis: {
        sourceVersion: 'abc',
        contractVersion: '1.0.0',
        status: 'succeeded',
        classification: 'feature',
        summary: 'Klien meminta ekspor.',
        requirements: [{ id: 'r1', text: 'Ekspor CSV.', quote: 'Tambahkan ekspor CSV.' }],
        questions: ['Kolom apa yang diperlukan?'],
        replyDraft: 'Terima kasih. Kolom apa yang diperlukan?',
        error: null,
        startedAt: '2026-10-27T10:01:00Z',
        finishedAt: '2026-10-27T10:02:00Z',
      },
    });
    expect(html).toContain('Analisis selesai');
    expect(html).toContain('Permintaan fitur');
    expect(html).toContain('Tambahkan ekspor CSV.');
    expect(html).toContain('Draf balasan — belum dikirim');
    expect(html).toContain('Kolom apa yang diperlukan?');
  });

  it('shows incomplete and blocked states without a fabricated draft', () => {
    const html = render({
      ...baseSnapshot,
      completeness: 'truncated',
      completenessReason: 'Teks dibatasi 4.000 karakter saat dibaca.',
      linkStatus: 'unlinked',
      clientProjectId: null,
      analysis: {
        sourceVersion: 'abc',
        contractVersion: '1.0.0',
        status: 'blocked',
        classification: null,
        summary: null,
        requirements: [],
        questions: [],
        replyDraft: null,
        error: 'Keluaran AI tidak valid.',
        startedAt: '2026-10-27T10:01:00Z',
        finishedAt: '2026-10-27T10:02:00Z',
      },
    });
    expect(html).toContain('Teks tidak lengkap');
    expect(html).toContain('Belum tertaut proyek');
    expect(html).toContain('Analisis diblokir');
    expect(html).not.toContain('Draf balasan — belum dikirim');
  });
});

