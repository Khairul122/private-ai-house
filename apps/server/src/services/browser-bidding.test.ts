import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { FreelancerWriteError } from '@fvh/adapter-freelancer';
const fixture = vi.hoisted(() => ({ inspect: vi.fn(), submit: vi.fn(), connect: vi.fn() }));
vi.mock('../lib/browser-bid-page.js', () => ({ FreelancerBrowserPage: class { inspect = fixture.inspect; submit = fixture.submit; } }));
vi.mock('playwright-core', () => ({ chromium: { connectOverCDP: fixture.connect } }));
import { BrowserBiddingService, connectExistingChrome, SharedChromeSession } from './browser-bidding.js';
const input = { operation: 'submit_bid' as const, projectId: 71, amount: 100, period: 14, milestonePercentage: 100, description: 'Proposal test' };
describe('browser bidding service', () => {
  let service: BrowserBiddingService; let directory: string;
  beforeEach(async () => {
    fixture.inspect.mockReset(); fixture.submit.mockReset();
    fixture.inspect.mockResolvedValue({ username: 'owner-fixture', remaining: 3, pageStatus: 200, checkedAt: new Date().toISOString(), challenge: false });
    fixture.submit.mockImplementation(async (_input, _identity, guard) => { await guard(); return { statusCode: 200, resultId: '9123', transport: 'browser' }; });
    directory = await mkdtemp(join(tmpdir(), 'fvh-browser-test-'));
    const connection = { page: { setDefaultTimeout: vi.fn() } as unknown as Page, onDisconnect: vi.fn(), disconnect: vi.fn(async () => undefined) };
    service = new BrowserBiddingService(directory, async () => ({ id: '42', username: 'owner-fixture' }), async () => connection);
  });
  afterEach(async () => { await service.close(); });
  it('never claims ready from persisted mode alone', async () => { await service.setMode('browser'); expect(service.readiness().ready).toBe(false); expect(service.status().username).toBeNull(); });
  it('does not reopen an old blank automation profile after restart', async () => {
    await writeFile(join(directory, 'browser-bid-settings.json'), JSON.stringify({ mode: 'api-fallback', autoStart: true }));
    await service.restore(); expect(service.status().state).toBe('stopped'); expect(fixture.inspect).not.toHaveBeenCalled();
  });
  it('attaches to existing Chrome and closes only its worker tab when disconnected', async () => {
    const page = { close: vi.fn(async () => undefined), on: vi.fn() };
    const userTab = { close: vi.fn() };
    const network = { send: vi.fn(async () => undefined) };
    const browser = { contexts: () => [{ newPage: vi.fn(async () => page), newCDPSession: vi.fn(async () => network), pages: () => [userTab] }], close: vi.fn(async () => undefined), on: vi.fn() };
    fixture.connect.mockResolvedValue(browser);
    const connection = await connectExistingChrome();
    expect(fixture.connect).toHaveBeenCalledWith('chrome', { noDefaults: true, timeout: 15_000 });
    expect(network.send).toHaveBeenCalledWith('Network.setBypassServiceWorker', { bypass: true });
    await connection.disconnect(); expect(page.close).toHaveBeenCalledOnce(); expect(browser.close).toHaveBeenCalledOnce(); expect(userTab.close).not.toHaveBeenCalled();
  });
  it('shares one Chrome connection across workers and disconnects only after the last worker leaves', async () => {
    const pages = [0, 1].map(() => ({ close: vi.fn(async () => undefined), on: vi.fn() }));
    const newPage = vi.fn().mockResolvedValueOnce(pages[0]).mockResolvedValueOnce(pages[1]);
    const browser = { contexts: () => [{ newPage, newCDPSession: vi.fn(async () => ({ send: vi.fn(async () => undefined) })) }], close: vi.fn(async () => undefined), on: vi.fn() };
    const connect = vi.fn(async () => browser as never);
    const session = new SharedChromeSession(connect);
    const [first, second] = await Promise.all([session.acquire(), session.acquire()]);
    expect(connect).toHaveBeenCalledOnce(); expect(first.page).not.toBe(second.page);
    await first.disconnect(); await first.disconnect();
    expect(pages[0]!.close).toHaveBeenCalled(); expect(browser.close).not.toHaveBeenCalled();
    await second.disconnect(); expect(browser.close).toHaveBeenCalledOnce();
    connect.mockRejectedValueOnce(new Error('Owner cancelled'));
    await expect(session.acquire()).rejects.toThrow('Owner cancelled');
    newPage.mockResolvedValue(pages[0]); await session.acquire(); expect(connect).toHaveBeenCalledTimes(3);
  });
  it('auto-connects once per server launch, not again after a file-watch restart', async () => {
    await writeFile(join(directory, 'browser-bid-settings.json'), JSON.stringify({ mode: 'api-fallback', autoStart: true, connection: 'existing-chrome' }));
    await service.restore(111); expect(fixture.inspect).toHaveBeenCalledTimes(1); await service.close();
    const restarted = new BrowserBiddingService(directory, async () => ({ id: '42', username: 'owner-fixture' }), async () => ({ page: { setDefaultTimeout: vi.fn() } as unknown as Page, onDisconnect: vi.fn(), disconnect: vi.fn(async () => undefined) }));
    await restarted.restore(111); expect(fixture.inspect).toHaveBeenCalledTimes(1); expect(restarted.status().state).toBe('stopped');
    await restarted.restore(222); expect(fixture.inspect).toHaveBeenCalledTimes(2); await restarted.close();
  });
  it('reports actual account and quota and blocks mismatched identities', async () => {
    await service.open(); expect(service.status()).toMatchObject({ state: 'ready', remaining: 3, pageStatus: 200 });
    fixture.inspect.mockResolvedValue({ username: 'other-fixture', remaining: 3, pageStatus: 200, checkedAt: new Date().toISOString(), challenge: false });
    await service.check(); expect(service.status().state).toBe('account_mismatch');
  });
  it('uses the browser directly with policy authorization in browser mode', async () => {
    await service.open(); await service.setMode('browser'); const api = vi.fn(); const guard = vi.fn(async () => undefined);
    expect(await service.submit(input, guard, api)).toMatchObject({ statusCode: 200, resultId: '9123' }); expect(api).not.toHaveBeenCalled(); expect(guard).toHaveBeenCalled();
  });
  it('uses fallback after HTTP 429 but never after account quota or timeout', async () => {
    await service.open(); await service.setMode('api-fallback');
    await service.submit(input, async () => undefined, async () => { throw new FreelancerWriteError(429, 'Rate limited'); }); expect(fixture.submit).toHaveBeenCalledTimes(1);
    await service.check();
    for (const error of [new FreelancerWriteError(400, 'BID_LIMIT_EXCEEDED'), new FreelancerWriteError(undefined, 'Timeout')]) await expect(service.submit(input, async () => undefined, async () => { throw error; })).rejects.toBe(error);
    expect(fixture.submit).toHaveBeenCalledTimes(1);
  });
  it('retains an uncertain result and does not retry the browser driver', async () => {
    await service.open(); await service.setMode('browser');
    const { BrowserBidError } = await import('../models/browser-bid-types.js'); fixture.submit.mockRejectedValue(new BrowserBidError('uncertain', 'Hasil belum pasti.', true));
    await expect(service.submit(input, async () => undefined, vi.fn())).rejects.toThrow();
    expect(fixture.submit).toHaveBeenCalledTimes(1); expect(service.status().lastResult?.outcome).toBe('uncertain');
  });
});
