import type { FastifyInstance } from 'fastify';
import type { LiveEvents } from '../lib/live-events.js';

/** Server-sent change notices. Carries topic names only; the browser refetches the data through the normal routes. */
export function registerEventsRoutes(app: FastifyInstance, live: LiveEvents, options: { maxClients?: number; heartbeatMs?: number } = {}) {
  const maxClients = options.maxClients ?? 20;
  const open = new Set<() => void>();
  app.get('/api/events', (_request, reply) => {
    if (open.size >= maxClients) return reply.code(503).header('Retry-After', '30').send({ error: 'Terlalu banyak koneksi realtime.' });
    reply.hijack();
    const stream = reply.raw;
    // Hijacked replies skip the onSend hook, so its headers are set here.
    stream.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no',
    });
    stream.write('retry: 5000\n\n');
    const unsubscribe = live.subscribe(topics => { stream.write(`event: change\ndata: ${JSON.stringify({ topics })}\n\n`); });
    const heartbeat = setInterval(() => { stream.write(': ping\n\n'); }, options.heartbeatMs ?? 25_000);
    const end = () => {
      if (!open.delete(end)) return;
      clearInterval(heartbeat);
      unsubscribe();
      stream.end();
    };
    open.add(end);
    stream.on('close', end); // fires when the browser or proxy drops the connection
  });
  // preClose runs before the server waits for in-flight requests; open streams would otherwise keep close() waiting forever.
  app.addHook('preClose', async () => { for (const end of [...open]) end(); });
}
