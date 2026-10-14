import { describe, expect, it } from 'vitest';
import { prepareKnowledgeFile } from './index.js';

describe('prepareKnowledgeFile', () => {
  const base = { sourceId: 'source-1', provider: 'manual' as const, label: 'Portfolio notes', referenceUrl: 'https://example.test/portfolio', sourceRef: 'user-import', updatedAt: '2026-10-14T00:00:00.000Z' };

  it('excludes credentials and sensitive file paths before producing chunks', () => {
    expect(prepareKnowledgeFile({ ...base, path: '.env.production', content: 'TOKEN=privatevalue123456' })).toMatchObject({ ok: false, code: 'excluded_path' });
    expect(prepareKnowledgeFile({ ...base, path: 'src/client.ts', content: 'const key = "ghp_123456789012345678901234567890123456";' })).toMatchObject({ ok: false, code: 'secret_detected' });
  });

  it('rejects binary and oversized content and does not echo sensitive input', () => {
    expect(prepareKnowledgeFile({ ...base, path: 'assets/photo.png', content: 'not text' })).toMatchObject({ ok: false, code: 'excluded_path' });
    expect(prepareKnowledgeFile({ ...base, path: 'docs/binary.txt', content: `a\u0000b` })).toMatchObject({ ok: false, code: 'binary_content' });
    const result = prepareKnowledgeFile({ ...base, path: 'notes.md', content: 'a'.repeat(100_001) });
    expect(result).toMatchObject({ ok: false, code: 'file_too_large' });
    expect(JSON.stringify(result)).not.toContain('TOKEN=');
  });

  it('splits safe text into traceable chunks with stable hashes', () => {
    const input = { ...base, path: 'projects/api/README.md', content: '# Service\n\nBuilt a TypeScript service with evidence-backed API design.' };
    const first = prepareKnowledgeFile(input);
    const second = prepareKnowledgeFile(input);

    expect(first.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.chunks[0]).toMatchObject({ path: input.path, sourceId: base.sourceId, url: `${base.referenceUrl}#projects/api/README.md` });
      expect(first.chunks[0]?.contentHash).toBe(second.chunks[0]?.contentHash);
    }
  });
});
