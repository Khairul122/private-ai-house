import { describe, expect, it, vi } from 'vitest';
import { FreelancerReadAdapter } from './index.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('FreelancerReadAdapter', () => {
  it('reads the authenticated profile using a GET request and normalizes numeric IDs', async () => {
    const requests: Array<[string | URL | Request, RequestInit | undefined]> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push([input, init]);
      return jsonResponse({ result: { id: 42, username: 'sample-user', display_name: 'Sample User', country: { name: 'Indonesia' } } });
    });
    const adapter = new FreelancerReadAdapter({ token: 'test-token-value-1234', fetcher });

    const profile = await adapter.readOwnProfile();
    const [url, init] = requests[0] ?? [];

    expect(profile).toMatchObject({ id: '42', username: 'sample-user', displayName: 'Sample User', country: 'Indonesia', profileUrl: 'https://www.freelancer.com/u/sample-user' });
    expect(String(url)).toBe('https://www.freelancer.com/api/users/0.1/self/');
    expect(init).toMatchObject({ method: 'GET', headers: { 'Freelancer-OAuth-V1': 'test-token-value-1234' } });
  });

  it('searches active projects and imports only rows that contain project identifiers and titles', async () => {
    const requests: Array<[string | URL | Request, RequestInit | undefined]> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push([input, init]);
      return jsonResponse({ result: { projects: [
        {
          id: 839101, title: 'Build a TypeScript API', description: '<p>Inventory endpoints with pagination.</p>',
          budget: { minimum: 300, maximum: 600, currency_code: 'USD' },
          job_details: [{ name: 'TypeScript' }, { name: 'API' }], user_details: { username: 'buyer' },
          time_submitted: 1_791_936_000, time_expire: 1_793_232_000,
        },
        { id: '839102', description: 'Missing title' },
        null,
      ] } });
    });
    const adapter = new FreelancerReadAdapter({ token: 'test-token-value-1234', fetcher, now: () => new Date('2026-10-14T00:00:00.000Z') });

    const result = await adapter.searchActiveProjects('TypeScript & API', 12);
    const [url, init] = requests[0] ?? [];
    const parsedUrl = new URL(String(url));

    expect(parsedUrl.pathname).toBe('/api/projects/0.1/projects/active/');
    expect(parsedUrl.searchParams.get('query')).toBe('TypeScript & API');
    expect(parsedUrl.searchParams.get('limit')).toBe('12');
    expect(init).toMatchObject({ method: 'GET' });
    expect(result).toMatchObject({ skipped: 2, projects: [{ id: 'freelancer:839101', title: 'Build a TypeScript API', clientName: 'buyer', budgetMin: 300, budgetMax: 600, currency: 'USD', skills: ['TypeScript', 'API'], source: 'freelancer' }] });
    expect(result.projects[0]?.deadlineDays).toBeGreaterThan(0);
  });

  it('does not mistake free-bid expiration for a project deadline', async () => {
    const adapter = new FreelancerReadAdapter({
      token: 'test-token-value-1234',
      fetcher: async () => jsonResponse({ result: { projects: [{ id: 839103, title: 'Project without deadline', time_free_bids_expire: 1_793_232_000 }] } }),
      now: () => new Date('2026-10-14T00:00:00.000Z'),
    });

    const result = await adapter.searchActiveProjects('TypeScript');

    expect(result.projects[0]?.deadlineDays).toBeNull();
  });

  it.each([
    [401, 'invalid_token'],
    [403, 'scope_denied'],
    [429, 'rate_limited'],
  ] as const)('maps HTTP %i into an actionable read error', async (status, code) => {
    const adapter = new FreelancerReadAdapter({ token: 'test-token-value-1234', fetcher: async () => jsonResponse({}, status) });
    await expect(adapter.readOwnProfile()).rejects.toMatchObject({ code, statusCode: status });
  });

  it('turns network failures into a safe provider error without exposing request details', async () => {
    const adapter = new FreelancerReadAdapter({ token: 'test-token-value-1234', fetcher: async () => { throw new Error('socket details'); } });
    await expect(adapter.searchActiveProjects('Typescript')).rejects.toMatchObject({ code: 'network_error', message: 'Freelancer tidak dapat dijangkau dari server lokal. Periksa koneksi jaringan lalu coba lagi.' });
  });

  it('rejects invalid search bounds before making a provider request', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ result: {} }));
    const adapter = new FreelancerReadAdapter({ token: 'test-token-value-1234', fetcher });
    await expect(adapter.searchActiveProjects('x')).rejects.toMatchObject({ code: 'invalid_query' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
