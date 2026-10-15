import { describe, expect, it, vi } from 'vitest';
import { FreelancerProductionWriteAdapter, FreelancerReadAdapter, FreelancerSandboxWriteAdapter } from './index.js';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('FreelancerReadAdapter', () => {
  it('reads the authenticated profile using a GET request and normalizes numeric IDs', async () => {
    const requests: Array<[string | URL | Request, RequestInit | undefined]> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push([input, init]);
      return jsonResponse({ result: { id: 42, username: 'sample-user', display_name: 'Sample User', country: { name: 'Indonesia' }, profile_description: 'Python engineer', hourly_rate: 18, primary_currency: { code: 'USD' }, jobs: [{ id: 15, name: 'Python' }] } });
    });
    const adapter = new FreelancerReadAdapter({ token: 'test-token-value-1234', fetcher });

    const profile = await adapter.readOwnProfile();
    const [url, init] = requests[0] ?? [];

    expect(profile).toMatchObject({ id: '42', username: 'sample-user', displayName: 'Sample User', country: 'Indonesia', profileUrl: 'https://www.freelancer.com/u/sample-user' });
    expect(profile).toMatchObject({ description: 'Python engineer', hourlyRate: 18, currency: 'USD', jobs: [{ id: 15, name: 'Python' }] });
    expect(new URL(String(url)).pathname).toBe('/api/users/0.1/self/');
    expect(new URL(String(url)).searchParams.toString()).toBe(new URLSearchParams({ compact: 'true', details: 'true', profile_description: 'true', jobs: 'true' }).toString());
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

describe('FreelancerSandboxWriteAdapter', () => {
  it('places a bid only on the Freelancer sandbox and uses the authenticated sandbox user ID', async () => {
    const requests: Array<[string | URL | Request, RequestInit | undefined]> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push([input, init]);
      return requests.length === 1
        ? jsonResponse({ result: { id: 42 } })
        : jsonResponse({ result: { id: 9001 } });
    });
    const adapter = new FreelancerSandboxWriteAdapter({ token: 'sandbox-token-value-1234', fetcher });

    await expect(adapter.run({ operation: 'submit_bid', projectId: 77, amount: 25, period: 3, milestonePercentage: 100, description: 'Sandbox integration check.' })).resolves.toEqual({ statusCode: 200, resultId: '9001' });
    const [profileUrl, profileInit] = requests[0] ?? [];
    const [bidUrl, bidInit] = requests[1] ?? [];

    expect(String(profileUrl)).toBe('https://www.freelancer-sandbox.com/api/users/0.1/self/');
    expect(profileInit).toMatchObject({ method: 'GET' });
    expect(String(bidUrl)).toBe('https://www.freelancer-sandbox.com/api/projects/0.1/bids/');
    expect(bidInit).toMatchObject({ method: 'POST', headers: { 'Freelancer-OAuth-V1': 'sandbox-token-value-1234', 'Content-Type': 'application/json' } });
    expect(JSON.parse(String(bidInit?.body))).toMatchObject({ project_id: 77, bidder_id: 42, amount: 25, period: 3, milestone_percentage: 100 });
  });

  it('uses the documented profile jobs endpoint and does not use the production host', async () => {
    const requests: Array<[string | URL | Request, RequestInit | undefined]> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push([input, init]);
      return jsonResponse({ status: 'success' });
    });
    const adapter = new FreelancerSandboxWriteAdapter({ token: 'sandbox-token-value-1234', fetcher });

    await expect(adapter.run({ operation: 'edit_profile', jobIds: [17, 23] })).resolves.toEqual({ statusCode: 200, resultStatus: 'success' });
    const [url, init] = requests[0] ?? [];

    expect(String(url)).toBe('https://www.freelancer-sandbox.com/api/users/0.1/self/jobs/');
    expect(init).toMatchObject({ method: 'PUT' });
    expect(JSON.parse(String(init?.body))).toEqual({ 'jobs[]': [17, 23] });
  });

  it('sends the message as form data to the documented sandbox thread route', async () => {
    const requests: Array<[string | URL | Request, RequestInit | undefined]> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push([input, init]);
      return jsonResponse({ result: { id: 11 } });
    });
    const adapter = new FreelancerSandboxWriteAdapter({ token: 'sandbox-token-value-1234', fetcher });

    await expect(adapter.run({ operation: 'send_message', threadId: 55, message: 'FVH sandbox verification.' })).resolves.toEqual({ statusCode: 200, resultId: '11' });
    const [url, init] = requests[0] ?? [];

    expect(String(url)).toBe('https://www.freelancer-sandbox.com/api/messages/0.1/threads/55/messages/');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    expect(String(init?.body)).toBe('message=FVH+sandbox+verification.');
  });

  it('surfaces the provider HTTP status and never falls back to production', async () => {
    const adapter = new FreelancerSandboxWriteAdapter({ token: 'sandbox-token-value-1234', fetcher: async () => jsonResponse({}, 403) });
    await expect(adapter.run({ operation: 'edit_profile', jobIds: [17] })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('FreelancerProductionWriteAdapter', () => {
  it('targets production for a confirmed bid and uses the authenticated production account ID', async () => {
    const requests: Array<[string | URL | Request, RequestInit | undefined]> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push([input, init]);
      return requests.length === 1 ? jsonResponse({ result: { id: 42 } }) : jsonResponse({ result: { id: 9001 } });
    });
    const adapter = new FreelancerProductionWriteAdapter({ token: 'production-token-value-1234', fetcher });

    await expect(adapter.run({ operation: 'submit_bid', projectId: 77, amount: 25, period: 3, milestonePercentage: 100, description: 'Live proposal.' })).resolves.toEqual({ statusCode: 200, resultId: '9001' });
    expect(String(requests[0]?.[0])).toBe('https://www.freelancer.com/api/users/0.1/self/');
    expect(String(requests[1]?.[0])).toBe('https://www.freelancer.com/api/projects/0.1/bids/');
    expect(requests[1]?.[1]).toMatchObject({ method: 'POST', headers: { 'Freelancer-OAuth-V1': 'production-token-value-1234' } });
    expect(JSON.parse(String(requests[1]?.[1]?.body))).toMatchObject({ project_id: 77, bidder_id: 42, amount: 25, period: 3, description: 'Live proposal.' });
    expect(requests.every(([url]) => !String(url).includes('freelancer-sandbox.com'))).toBe(true);
  });

  it('updates profile jobs and posts a message only to the production host', async () => {
    const requests: Array<[string | URL | Request, RequestInit | undefined]> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push([input, init]);
      return jsonResponse({ result: { id: 81 }, status: 'success' });
    });
    const adapter = new FreelancerProductionWriteAdapter({ token: 'production-token-value-1234', fetcher });

    await expect(adapter.run({ operation: 'edit_profile', jobIds: [17, 23] })).resolves.toMatchObject({ statusCode: 200 });
    await expect(adapter.run({ operation: 'send_message', threadId: 55, message: 'Live message.' })).resolves.toMatchObject({ statusCode: 200, resultId: '81', resultStatus: 'success' });
    expect(String(requests[0]?.[0])).toBe('https://www.freelancer.com/api/users/0.1/self/jobs/');
    expect(requests[0]?.[1]).toMatchObject({ method: 'PUT' });
    expect(JSON.parse(String(requests[0]?.[1]?.body))).toEqual({ 'jobs[]': [17, 23] });
    expect(String(requests[1]?.[0])).toBe('https://www.freelancer.com/api/messages/0.1/threads/55/messages/');
    expect(requests[1]?.[1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    expect(String(requests[1]?.[1]?.body)).toBe('message=Live+message.');
  });
});
