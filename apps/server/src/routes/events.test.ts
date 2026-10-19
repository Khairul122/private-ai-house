import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { WorkspaceRepository } from '@fvh/persistence';
import { createApp } from '../app.js';
import { LiveEvents } from '../lib/live-events.js';
import { registerEventsRoutes } from './events.js';

async function listen(app: FastifyInstance) {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return `http://127.0.0.1:${address.port}`;
}

/** Reads SSE frames until one matches, so the test sees exactly what a browser would. */
async function nextFrame(reader: ReadableStreamDefaultReader<Uint8Array>, match: (frame: string) => boolean, state: { buffer: string }) {
  const decoder = new TextDecoder();
  for (;;) {
    const frames = state.buffer.split('\n\n');
    state.buffer = frames.pop() ?? '';
    const found = frames.find(match);
    if (found) return found;
    const { value, done } = await reader.read();
    if (done) throw new Error('stream ended');
    state.buffer += decoder.decode(value, { stream: true });
  }
}

describe('GET /api/events', () => {
  let app: FastifyInstance | undefined;
  let repository: WorkspaceRepository | undefined;
  afterEach(async () => { await app?.close(); await repository?.close(); app = repository = undefined; });

  it('streams a change event after a successful write and ends open streams on close', async () => {
    repository = await WorkspaceRepository.open();
    app = await createApp({ repository });
    const base = await listen(app);
    const response = await fetch(`${base}/api/events`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const reader = response.body!.getReader();
    const state = { buffer: '' };
    await nextFrame(reader, frame => frame.startsWith('retry:'), state);

    const paused = await fetch(`${base}/api/policy/pause`, { method: 'POST', headers: { origin: 'http://127.0.0.1:5174' } });
    expect(paused.status).toBe(200);
    const frame = await nextFrame(reader, frame => frame.startsWith('event: change'), state);
    const topics = JSON.parse(frame.split('data: ')[1]!).topics as string[];
    expect(topics).toEqual(expect.arrayContaining(['policy', 'activity', 'dashboard']));

    await app.close();
    app = undefined;
    await expect(reader.read()).resolves.toMatchObject({ done: true });
  });

  it('keeps the Host check, caps concurrent clients and sends heartbeats', async () => {
    app = Fastify();
    app.addHook('onRequest', async (request, reply) => { if (!request.headers.host?.startsWith('127.0.0.1')) return reply.code(403).send(); });
    registerEventsRoutes(app, new LiveEvents(), { maxClients: 1, heartbeatMs: 20 });
    const base = await listen(app);
    expect((await app.inject({ url: '/api/events', headers: { host: 'evil.example' } })).statusCode).toBe(403);
    const first = await fetch(`${base}/api/events`);
    const reader = first.body!.getReader();
    await nextFrame(reader, frame => frame.startsWith(': ping'), { buffer: '' });
    const second = await fetch(`${base}/api/events`);
    expect(second.status).toBe(503);
    await reader.cancel();
    await new Promise(resolve => setTimeout(resolve, 50));
    const third = await fetch(`${base}/api/events`);
    expect(third.status).toBe(200);
    await third.body!.cancel();
  });
});
