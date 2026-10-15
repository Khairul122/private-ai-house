import { describe, expect, it, vi } from 'vitest';
import { GitHubReadAdapter } from './index.js';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('GitHubReadAdapter', () => {
  it('reads only eligible text files from a selected repository', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ default_branch: 'main' }))
      .mockResolvedValueOnce(jsonResponse({ sha: 'tree-123', truncated: false, tree: [
        { path: 'README.md', type: 'blob', size: 25 },
        { path: '.env', type: 'blob', size: 20 },
        { path: 'node_modules/pkg/index.js', type: 'blob', size: 10 },
      ] }))
      .mockResolvedValueOnce(new Response('# Portfolio', { status: 200 }));
    const adapter = new GitHubReadAdapter({ fetcher: fetcher as typeof fetch });

    const result = await adapter.readRepository('owner/project');

    expect(result.files).toEqual([{ path: 'README.md', content: '# Portfolio' }]);
    expect(result.ref).toBe('tree-123');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('Authorization');
  });

  it('lists owned repositories across pages, skipping forks and archived ones', async () => {
    const page1 = Array.from({ length: 100 }, (_, index) => ({ full_name: `me/repo-${index}`, fork: index === 1, archived: index === 2 }));
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(page1))
      .mockResolvedValueOnce(jsonResponse([{ full_name: 'me/last', fork: false, archived: false }]));
    const adapter = new GitHubReadAdapter({ token: 'token-value-1234567890', fetcher: fetcher as typeof fetch });

    const names = await adapter.listOwnRepositories(200);

    expect(names).toHaveLength(99);
    expect(names).not.toContain('me/repo-1');
    expect(names).not.toContain('me/repo-2');
    expect(names.at(-1)).toBe('me/last');
    expect(String(fetcher.mock.calls[1]![0])).toContain('page=2');
  });

  it('fails closed for truncated trees, unauthorized repositories, and invalid repo names', async () => {
    const truncated = new GitHubReadAdapter({ fetcher: vi.fn()
      .mockResolvedValueOnce(jsonResponse({ default_branch: 'main' }))
      .mockResolvedValueOnce(jsonResponse({ sha: 'tree', truncated: true, tree: [] })) as typeof fetch });
    await expect(truncated.readRepository('owner/project')).rejects.toMatchObject({ code: 'tree_truncated' });
    await expect(truncated.readRepository('bad/repo/name')).rejects.toMatchObject({ code: 'invalid_repository' });
    const denied = new GitHubReadAdapter({ fetcher: vi.fn().mockResolvedValue(jsonResponse({ message: 'forbidden' }, 403)) as typeof fetch });
    await expect(denied.readRepository('owner/project')).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('passes an optional read token only in the server-side authorization header', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ default_branch: 'main' }))
      .mockResolvedValueOnce(jsonResponse({ sha: 'tree', truncated: false, tree: [] }));
    const adapter = new GitHubReadAdapter({ token: 'test-token-never-log', fetcher: fetcher as typeof fetch });

    await adapter.readRepository('owner/private');

    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe('Bearer test-token-never-log');
  });
});
