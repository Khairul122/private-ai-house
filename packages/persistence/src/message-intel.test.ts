import { describe, expect, it } from 'vitest';
import {
  inventedAmounts,
  messageMissionSourceId,
  messageSourceVersion,
  quoteViolation,
  resolveMessageLink,
} from './message-intel.js';

const base = { threadId: '501', messageId: '1', body: 'Halo', completeness: 'complete' as const, truncatedAt: null };

describe('messageSourceVersion', () => {
  it('is stable for the same message but changes with the body or cut point', () => {
    const first = messageSourceVersion(base);
    expect(messageSourceVersion({ ...base })).toBe(first);
    expect(messageSourceVersion({ ...base, body: 'Halo!' })).not.toBe(first);
    expect(messageSourceVersion({ ...base, completeness: 'truncated', truncatedAt: 4_000 })).not.toBe(first);
  });

  it('ignores the sync timestamp, so a repeated sync stores nothing new', () => {
    // `syncedAt` is not an input: the same message text from a later sync keeps the same identity.
    const first = messageSourceVersion(base);
    expect(messageSourceVersion({ threadId: base.threadId, messageId: base.messageId, body: base.body, completeness: base.completeness })).toBe(first);
  });
});

describe('messageMissionSourceId', () => {
  it('separates stages and stays inside the 200 character limit', () => {
    const version = messageSourceVersion(base);
    expect(messageMissionSourceId('analysis', version)).not.toBe(messageMissionSourceId('candidate', version));
    expect(messageMissionSourceId('analysis', 'a'.repeat(64))).toHaveLength(82);
  });
});

describe('resolveMessageLink', () => {
  const project = { id: 'project-1', source: 'freelancer', externalProjectId: 'freelancer:71' };

  it('links only on one exact Freelancer project id', () => {
    expect(resolveMessageLink('71', [project])).toEqual({ clientProjectId: 'project-1', linkStatus: 'linked' });
    expect(resolveMessageLink('72', [project])).toEqual({ clientProjectId: null, linkStatus: 'unlinked' });
    expect(resolveMessageLink(null, [project])).toEqual({ clientProjectId: null, linkStatus: 'unlinked' });
  });

  it('never links by title or another source', () => {
    expect(resolveMessageLink('71', [{ ...project, source: 'direct' }])).toEqual({ clientProjectId: null, linkStatus: 'unlinked' });
    expect(resolveMessageLink('71', [{ ...project, externalProjectId: '71' }])).toEqual({ clientProjectId: null, linkStatus: 'unlinked' });
  });

  it('reports ambiguity instead of guessing when two rows share the id', () => {
    expect(resolveMessageLink('71', [project, { ...project, id: 'project-2' }])).toEqual({ clientProjectId: null, linkStatus: 'ambiguous' });
  });
});

describe('quoteViolation', () => {
  const body = 'Tolong tambahkan filter tanggal di halaman laporan. Budget saya 100 USD.';

  it('accepts quotes that exist verbatim', () => {
    expect(quoteViolation([{ quote: 'filter tanggal' }], body)).toBeNull();
    expect(quoteViolation([], body)).toBeNull();
  });

  it('rejects empty and invented quotes', () => {
    expect(quoteViolation([{ quote: '  ' }], body)).toMatch(/kosong/);
    expect(quoteViolation([{ quote: 'fitur export PDF' }], body)).toMatch(/tidak ditemukan/);
  });
});

describe('inventedAmounts', () => {
  const body = 'Budget saya 100 USD untuk revisi ini.';

  it('accepts amounts the client stated', () => {
    expect(inventedAmounts({ requirements: [], replyDraft: 'Baik, saya kerjakan sesuai 100 USD.' }, body)).toEqual([]);
  });

  it('flags amounts that appear only in model text', () => {
    expect(inventedAmounts({ requirements: [{ text: 'Biaya tambahan USD 500', quote: 'revisi' }], replyDraft: '' }, body))
      .toEqual(['usd 500']);
    expect(inventedAmounts({ requirements: [], replyDraft: 'Saya minta Rp 2.000.000 untuk ini.' }, body)).toEqual(['rp 2.000.000']);
  });
});
