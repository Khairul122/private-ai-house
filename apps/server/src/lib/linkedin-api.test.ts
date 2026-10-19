import { describe, expect, it, vi } from 'vitest';
import { readLinkedInProfile, syncLinkedInProfile } from './linkedin-api.js';
import { WorkspaceRepository } from '@fvh/persistence';

describe('LinkedIn API', () => {
  it('rejects malformed optional claims and strips unsupported data', async () => {
    await expect(readLinkedInProfile('test', vi.fn(async () => Response.json({ sub: 'id', name: { bad: 'data' } })))).rejects.toThrow('tidak valid');
    await expect(readLinkedInProfile('test', vi.fn(async () => Response.json({ sub: 'id', positions: ['unapproved'] })))).resolves.toEqual({ sub: 'id' });
  });
  it('replaces the same API profile atomically without duplicate sources', async () => {
    const repository = await WorkspaceRepository.open();
    try {
      await syncLinkedInProfile(repository, { sub: 'id', name: 'First' });
      await syncLinkedInProfile(repository, { sub: 'id', name: 'Updated' });
      expect(await repository.listKnowledgeSources()).toHaveLength(1);
      expect(await repository.searchKnowledge('Updated')).toHaveLength(1);
      expect(await repository.searchKnowledge('First')).toHaveLength(0);
    } finally { await repository.close(); }
  });
  it('reads only profile returned by userinfo and sends bearer server-side', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect((init?.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
      return new Response(JSON.stringify({ sub: 'real-sub', name: 'API name' }), { status: 200 });
    });
    await expect(readLinkedInProfile('token-not-printed', fetcher)).resolves.toMatchObject({ sub: 'real-sub', name: 'API name' });
  });

  it('reports provider status instead of inventing profile data', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('{}', { status: 403 }));
    await expect(readLinkedInProfile('token-not-printed', fetcher)).rejects.toThrow('HTTP 403');
  });
});
