import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { WorkspaceRepository } from '@fvh/persistence';
import type { BrowserBiddingService } from '../services/browser-bidding.js';

const modeSchema = z.object({ mode: z.enum(['api', 'api-fallback', 'browser']) }).strict();
export function registerBrowserBiddingRoutes(app: FastifyInstance, service: BrowserBiddingService | undefined, repo: WorkspaceRepository) {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/browser-bidding')) return;
    reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method) && !req.headers.origin) return reply.code(403).send({ error: 'Header Origin diperlukan.' });
  });
  app.get('/api/browser-bidding', async () => service?.status() ?? null);
  app.put('/api/browser-bidding/mode', async (req, reply) => {
    if (!service) return reply.code(503).send({ error: 'Worker browser tidak tersedia.' });
    const input = modeSchema.safeParse(req.body);
    if (!input.success) return reply.code(400).send({ error: 'Mode pengiriman tidak valid.' });
    try {
      await service.setMode(input.data.mode);
      await repo.appendAudit({ type: 'browser.mode_changed', resourceId: 'freelancer', status: 'recorded', reason: `Pemilik memilih jalur ${input.data.mode}. Kebijakan tetap diperiksa pada semua jalur.`, policyVersion: null, payloadHash: null });
      return service.status();
    } catch { return reply.code(409).send({ error: 'Mode belum disimpan. Tunggu pekerjaan browser selesai lalu coba lagi.' }); }
  });
  for (const action of ['open', 'check', 'close'] as const) app.post(`/api/browser-bidding/${action}`, async (_req, reply) => {
    if (!service) return reply.code(503).send({ error: 'Worker browser tidak tersedia.' });
    if (service.status().busy && action !== 'close') return reply.code(409).send({ error: 'Worker sedang bekerja. Tunggu hingga selesai.' });
    if (action === 'open') { void service.open().catch(() => undefined); return reply.code(202).send({ accepted: true }); }
    if (action === 'check') { void service.check(); return reply.code(202).send({ accepted: true }); }
    try { await service.close(true); return service.status(); }
    catch { return reply.code(409).send({ error: 'Browser belum dapat ditutup. Coba lagi.' }); }
  });
}
