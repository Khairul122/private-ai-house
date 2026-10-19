import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { WorkspaceRepository } from '@fvh/persistence';
import { createApp } from './app.js';
import type { BrowserBiddingService } from './browser-bidding.js';

describe('browser controls API', () => {
  let app: FastifyInstance; let repo: WorkspaceRepository;
  afterEach(async () => { await app?.close(); await repo?.close(); });
  it('keeps Host/Origin protection, validates fixed controls and exposes no arbitrary submit route', async () => {
    repo = await WorkspaceRepository.open();
    const controls = { status: vi.fn(() => ({ mode: 'api', state: 'stopped', busy: false })), setMode: vi.fn(async () => undefined), open: vi.fn(async () => undefined), check: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    app = await createApp({ repository: repo, browserBidding: controls as unknown as BrowserBiddingService });
    expect((await app.inject({ url: '/api/browser-bidding', headers: { host: 'evil.example' } })).statusCode).toBe(403);
    expect((await app.inject('/api/browser-bidding')).headers['cache-control']).toBe('no-store');
    expect((await app.inject({ method: 'POST', url: '/api/browser-bidding/open' })).statusCode).toBe(403);
    const headers = { origin: 'http://127.0.0.1:5174' };
    expect((await app.inject({ method: 'PUT', url: '/api/browser-bidding/mode', headers, payload: { mode: 'browser', url: 'https://evil.example' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: '/api/browser-bidding/mode', headers, payload: { mode: 'browser' } })).statusCode).toBe(200);
    expect(controls.setMode).toHaveBeenCalledWith('browser');
    expect((await app.inject({ method: 'POST', url: '/api/browser-bidding/open', headers })).statusCode).toBe(202);
    expect(controls.open).toHaveBeenCalledTimes(1);
    expect((await app.inject({ method: 'POST', url: '/api/browser-bidding/submit', headers, payload: { projectId: 71 } })).statusCode).toBe(404);
  });
});
