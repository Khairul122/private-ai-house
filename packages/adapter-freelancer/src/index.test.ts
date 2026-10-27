import { describe, expect, it, vi } from 'vitest';
import { FreelancerPartialReadError, FreelancerProductionWriteAdapter, FreelancerReadAdapter, FreelancerSandboxWriteAdapter, lastFreelancerRateLimit } from './index.js';

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
    expect(profile).toMatchObject({ description: 'Python engineer', hourlyRate: 18, currency: 'USD', jobs: [{ id: 15, name: 'Python' }], jobIds: [15] });
    expect(new URL(String(url)).pathname).toBe('/api/users/0.1/self/');
    expect(new URL(String(url)).searchParams.toString()).toBe(new URLSearchParams({ compact: 'true', details: 'true', profile_description: 'true', jobs: 'true' }).toString());
    expect(init).toMatchObject({ method: 'GET', headers: { 'Freelancer-OAuth-V1': 'test-token-value-1234' } });
  });

  it('reads own bid statuses with repeated bid IDs and exact outcome fields', async () => {
    const requests: Array<string | URL | Request> = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      requests.push(input);
      return jsonResponse({ result: { bids: {
        '11': { id: 11, project_id: 77, award_status: 'awarded', retracted: false },
        '12': { id: 12, project_id: 78, award_status: 'rejected', retracted: false },
        '13': { id: 13, project_id: 79, award_status: null, retracted: true },
      } } });
    });
    const adapter = new FreelancerReadAdapter({ token: 'test-token-value-1234', fetcher });

    await expect(adapter.readOwnBids(['11', '12', '13'])).resolves.toEqual([
      { bidId: '11', projectId: '77', awardStatus: 'awarded', retracted: false },
      { bidId: '12', projectId: '78', awardStatus: 'rejected', retracted: false },
      { bidId: '13', projectId: '79', awardStatus: null, retracted: true },
    ]);
    expect(new URL(String(requests[0])).searchParams.getAll('bids[]')).toEqual(['11', '12', '13']);
    await expect(adapter.readOwnBids(['0'.repeat(31)])).rejects.toMatchObject({ code: 'invalid_query' });
    await expect(adapter.readOwnBids(Array.from({ length: 101 }, (_, index) => String(index + 1)))).rejects.toMatchObject({ code: 'invalid_query' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reads the latest message of each thread with its project context', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/threads/')) return jsonResponse({ result: { threads: [
        { id: 501, context: { type: 'project', id: 77 } },
        { id: 502, context: { type: 'contest', id: 9 } },
      ] } });
      const threadId = url.searchParams.get('threads[]');
      return jsonResponse({ result: { messages: [{ id: Number(threadId) * 10, from_user: { id: 42 }, message: `Halo ${threadId}`, time_created: 1_760_000_000 }] } });
    });
    const adapter = new FreelancerReadAdapter({ token: 'test-token-value-1234', fetcher });

    await expect(adapter.readLatestThreadMessages('7', 5)).resolves.toEqual([
      { threadId: 501, projectId: '77', messageId: 5010, senderId: '42', message: 'Halo 501', completeness: 'complete', completenessReason: null, createdAt: new Date(1_760_000_000_000).toISOString() },
      { threadId: 502, projectId: null, messageId: 5020, senderId: '42', message: 'Halo 502', completeness: 'complete', completenessReason: null, createdAt: new Date(1_760_000_000_000).toISOString() },
    ]);
  });

  it('reads changed threads in one request and fetches messages only for changed threads without last_message', async () => {
    const urls: URL[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      urls.push(url);
      if (url.pathname.endsWith('/threads/')) return jsonResponse({ result: { threads: [
        { id: 601, thread: { id: 601, context: { type: 'project', id: 40123456 } }, time_updated: 1_760_000_300, message_count: 4,
          last_message: { id: 9_001, thread_id: 601, from_user: 31_001, message: 'Kapan bisa mulai?', time_created: 1_760_000_300 } },
        { id: 602, thread: { id: 602, context: { type: 'project', id: 40123457 } }, time_updated: 1_760_000_200 },
        { id: 603, thread: { id: 603, context: { type: 'project', id: 40123458 } }, time_updated: 1_760_000_100 },
        { id: 604, thread: { id: 604 } },
      ] }, users: { '31001': { id: 31_001, username: 'client' } } });
      return jsonResponse({ result: { messages: [{ id: 9_002, thread_id: 602, from_user: 31_002, message: 'Sudah saya kirim file.', time_created: 1_760_000_200 }] } });
    });
    const adapter = new FreelancerReadAdapter({ token: 'test-token-value-1234', fetcher });

    const messages = await adapter.readUpdatedThreads('7', { fromUpdatedTime: 1_759_999_880, known: new Map([[602, 1_760_000_000], [603, 1_760_000_100]]) });

    expect(messages).toEqual([
      { threadId: 601, projectId: '40123456', messageId: 9001, senderId: '31001', message: 'Kapan bisa mulai?', completeness: 'complete', completenessReason: null, createdAt: new Date(1_760_000_300_000).toISOString(), threadUpdated: 1_760_000_300 },
      { threadId: 602, projectId: '40123457', messageId: 9002, senderId: '31002', message: 'Sudah saya kirim file.', completeness: 'complete', completenessReason: null, createdAt: new Date(1_760_000_200_000).toISOString(), threadUpdated: 1_760_000_200 },
    ]);
    expect(urls).toHaveLength(2);
    expect(Object.fromEntries(urls[0]!.searchParams)).toMatchObject({ 'members[]': '7', limit: '30', last_message: 'true', unread_count: 'true', from_updated_time: '1759999880' });
    expect(urls[1]!.searchParams.getAll('threads[]')).toEqual(['602']);

    // Full sweep: no time filter, and a thread without time_updated is read because change cannot be ruled out.
    urls.length = 0;
    await adapter.readUpdatedThreads('7', { known: new Map([[602, 1_760_000_200], [603, 1_760_000_100]]) });
    expect(urls[0]!.searchParams.has('from_updated_time')).toBe(false);
    expect(urls.slice(1).map((url) => url.searchParams.get('threads[]'))).toEqual(['604']);
  });

  it('marks a message truncated before slicing it', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ result: { threads: [{ id: 501, time_updated: 1_760_000_000,
      last_message: { id: 901, from_user: 42, message: 'x'.repeat(4001), time_created: 1_760_000_000 } }] } }));
    const adapter = new FreelancerReadAdapter({ token: 'test-token-value-1234', fetcher });
    const [message] = await adapter.readUpdatedThreads('7');
    expect(message).toMatchObject({ messageId: 901, completeness: 'truncated', completenessReason: 'Teks dibatasi 4.000 karakter saat dibaca.' });
    expect(message?.message).toHaveLength(4000);
  });

  it('keeps messages read before a 429 and records rate-limit header numbers', async () => {
    let messageCalls = 0;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const headers = { 'Content-Type': 'application/json', 'RateLimit-Limit': '50, 50;window=60, 1000;window=3600', 'RateLimit-Remaining': messageCalls >= 1 ? '0' : '12' };
      if (url.pathname.endsWith('/threads/')) return new Response(JSON.stringify({ result: { threads: [{ id: 501 }, { id: 502 }, { id: 503 }] } }), { headers });
      messageCalls += 1;
      if (messageCalls === 2) return new Response(JSON.stringify({ status: 'error', error_code: 'RATE_LIMITED' }), { status: 429, headers });
      return new Response(JSON.stringify({ result: { messages: [{ id: 7_001, from_user: 42, message: 'Halo', time_created: 1_760_000_000 }] } }), { headers });
    });
    const adapter = new FreelancerReadAdapter({ token: 'test-token-value-1234', fetcher, now: () => new Date('2026-10-20T00:00:00.000Z') });

    const error = await adapter.readLatestThreadMessages('7', 3).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FreelancerPartialReadError);
    expect(error).toMatchObject({ code: 'rate_limited', statusCode: 429, partial: [{ threadId: 501, messageId: 7001, senderId: '42' }] });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(lastFreelancerRateLimit()).toEqual({ limit: 50, remaining: 0, status: 429, seenAt: '2026-10-20T00:00:00.000Z' });
  });

  it('searches recently updated projects by job IDs with one request', async () => {
    const urls: URL[] = [];
    const adapter = new FreelancerReadAdapter({
      token: 'test-token-value-1234', now: () => new Date('2026-10-14T00:00:00.000Z'),
      fetcher: async (input) => { urls.push(new URL(String(input))); return jsonResponse({ result: { projects: [{ id: 40123459, title: 'Laravel API', owner_id: 5512309 }], users: { '5512309': { id: 5512309, username: 'buyer' } } } }); },
    });

    const result = await adapter.searchProjectsByJobs([3, 13], 1_760_000_000);

    expect(result.projects.map((project) => [project.id, project.clientName])).toEqual([['freelancer:40123459', 'buyer']]);
    expect(urls[0]!.searchParams.getAll('jobs[]')).toEqual(['3', '13']);
    expect(Object.fromEntries(urls[0]!.searchParams)).toMatchObject({ sort_field: 'time_updated', from_time: '1760000000', limit: '50' });
    expect(urls[0]!.searchParams.has('query')).toBe(false);
    await expect(adapter.searchProjectsByJobs([], 1)).rejects.toMatchObject({ code: 'invalid_query' });
  });

  it('searches active projects and imports only rows that contain project identifiers and titles', async () => {
    const requests: Array<[string | URL | Request, RequestInit | undefined]> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push([input, init]);
      return jsonResponse({ result: { projects: [
        {
          id: 839101, title: 'Build a TypeScript API', description: '<p>Inventory endpoints with pagination.</p>',
          budget: { minimum: 300, maximum: 600, currency_code: 'USD' },
          job_details: [{ name: 'TypeScript' }, { name: 'API' }], owner_id: 5512309,
          time_submitted: 1_791_936_000, time_expire: 1_793_232_000,
        },
        { id: '839102', description: 'Missing title' },
        null,
      ], users: {
        '5512309': { id: 5512309, username: 'buyer', display_name: 'Buyer Co.', location: { city: 'Austin', country: { name: 'United States', code: 'us' } } },
      } } });
    });
    const adapter = new FreelancerReadAdapter({ token: 'test-token-value-1234', fetcher, now: () => new Date('2026-10-14T00:00:00.000Z') });

    const result = await adapter.searchActiveProjects('TypeScript & API', 12);
    const [url, init] = requests[0] ?? [];
    const parsedUrl = new URL(String(url));

    expect(parsedUrl.pathname).toBe('/api/projects/0.1/projects/active/');
    expect(parsedUrl.searchParams.get('query')).toBe('TypeScript & API');
    expect(parsedUrl.searchParams.get('limit')).toBe('12');
    expect(parsedUrl.searchParams.get('user_details')).toBe('true');
    expect(parsedUrl.searchParams.get('user_country_details')).toBe('true');
    expect(init).toMatchObject({ method: 'GET' });
    expect(result).toMatchObject({ skipped: 2, projects: [{ id: 'freelancer:839101', title: 'Build a TypeScript API', clientName: 'Buyer Co.', clientCountry: 'United States', budgetMin: 300, budgetMax: 600, currency: 'USD', skills: ['TypeScript', 'API'], source: 'freelancer' }] });
    expect(result.projects[0]?.deadlineDays).toBeGreaterThan(0);
  });

  it('falls back to "Tidak tersedia" when the owner is missing from the users map', async () => {
    const adapter = new FreelancerReadAdapter({
      token: 'test-token-value-1234',
      fetcher: async () => jsonResponse({ result: {
        projects: [{ id: 839104, title: 'Owner not returned', owner_id: 7700001 }],
        users: { '5512309': { id: 5512309, username: 'someone-else' } },
      } }),
      now: () => new Date('2026-10-14T00:00:00.000Z'),
    });

    const result = await adapter.searchActiveProjects('TypeScript');

    expect(result.projects[0]).toMatchObject({ clientName: 'Tidak tersedia', clientCountry: null });
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

  it('keeps the provider error code and message of a rejected bid', async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => (++calls === 1 ? jsonResponse({ result: { id: 42 } }) : new Response(JSON.stringify({ status: 'error', error_code: 'ProjectExceptionCodes.BID_LIMIT', message: 'Bid limit reached' }), { status: 400, headers: { 'Content-Type': 'application/json' } })));
    const adapter = new FreelancerProductionWriteAdapter({ token: 'production-token-value-1234', fetcher });

    await expect(adapter.run({ operation: 'submit_bid', projectId: 77, amount: 25, period: 3, milestonePercentage: 100, description: 'Live proposal.' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('ProjectExceptionCodes.BID_LIMIT: Bid limit reached') });
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
