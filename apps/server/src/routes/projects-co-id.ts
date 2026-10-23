import type { FastifyInstance } from 'fastify';
import { projectsCoIdOwnerActionSchema } from '@fvh/contracts';
import type { ProjectsCoIdService } from '../services/projects-co-id.js';
import { z } from 'zod';

const projectParams = z.object({ id: z.string().regex(/^projects_co_id:[a-f0-9]{6}$/) });
const disabled = { error: 'Pemindaian projects.co.id dinonaktifkan. Proyek tersimpan, draf lokal, dan aksi pemilik tetap tersedia.' };
export function registerProjectsCoIdRoutes(app: FastifyInstance, service: ProjectsCoIdService | undefined) {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/projects-co-id')) return;
    reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method) && !req.headers.origin) return reply.code(403).send({ error: 'Header Origin diperlukan.' });
  });
  app.get('/api/projects-co-id', async () => service ? service.status() : null);
  app.get('/api/projects-co-id/drafts', async (_req, reply) => service ? service.drafts() : reply.code(503).send(disabled));
  app.put('/api/projects-co-id/mode', async (_req, reply) => reply.code(410).send(disabled));
  for (const action of ['draft', 'mark-sent', 'skip', 'won'] as const) app.post(`/api/projects-co-id/projects/:id/${action}`, async (req, reply) => {
    if (!service) return reply.code(503).send(disabled);
    const params = projectParams.safeParse(req.params);
    const body = (action === 'draft' ? z.object({}).strict() : projectsCoIdOwnerActionSchema).safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: 'ID atau konfirmasi pemilik tidak valid.' });
    try {
      if (action === 'draft') return reply.code(201).send(await service.createDraft(params.data.id));
      await service.ownerAction(params.data.id, action); return { ok: true };
    } catch { return reply.code(409).send({ error: action === 'draft' ? 'Draf belum dibuat. Periksa kebijakan, kuota dan Aktivitas.' : 'Proyek tidak ditemukan, sudah diproses, atau belum memiliki draf.' }); }
  });
  for (const action of ['open', 'check', 'close', 'scan'] as const) app.post(`/api/projects-co-id/${action}`, async (_req, reply) => reply.code(410).send(disabled));
}
