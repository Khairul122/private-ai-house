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
