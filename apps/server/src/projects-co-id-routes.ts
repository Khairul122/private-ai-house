import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { projectsCoIdModeSchema, projectsCoIdOwnerActionSchema } from '@fvh/contracts';
import type { ProjectsCoIdService } from './projects-co-id.js';
import { PROJECTS_CO_ID_AUTO_REASON } from './projects-co-id-types.js';

const projectParams = z.object({ id: z.string().regex(/^projects_co_id:[a-f0-9]{6}$/) });
export function registerProjectsCoIdRoutes(app: FastifyInstance, service: ProjectsCoIdService | undefined) {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/projects-co-id')) return;
    reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method) && !req.headers.origin) return reply.code(403).send({ error: 'Header Origin diperlukan.' });
  });
  app.get('/api/projects-co-id', async () => service ? service.status() : null);
  app.put('/api/projects-co-id/mode', async (req, reply) => {
    if (!service) return reply.code(503).send({ error: 'Worker projects.co.id tidak tersedia.' });
    const input = projectsCoIdModeSchema.safeParse(req.body);
    if (!input.success) return reply.code(400).send({ error: `Mode tidak valid. ${PROJECTS_CO_ID_AUTO_REASON}` });
    try { await service.setMode(input.data.mode); return { mode: input.data.mode }; }
    catch { return reply.code(409).send({ error: 'Mode belum disimpan. Tunggu worker selesai atau muat ulang kebijakan.' }); }
  });
  app.get('/api/projects-co-id/drafts', async (_req, reply) => service ? service.drafts() : reply.code(503).send({ error: 'Worker tidak tersedia.' }));
  for (const action of ['draft', 'mark-sent', 'skip'] as const) app.post(`/api/projects-co-id/projects/:id/${action}`, async (req, reply) => {
    if (!service) return reply.code(503).send({ error: 'Worker tidak tersedia.' });
    const params = projectParams.safeParse(req.params);
    const body = (action === 'draft' ? z.object({}).strict() : projectsCoIdOwnerActionSchema).safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: 'ID atau konfirmasi pemilik tidak valid.' });
    try {
      if (action === 'draft') return reply.code(201).send(await service.createDraft(params.data.id));
      await service.ownerAction(params.data.id, action);
      return { ok: true };
    } catch { return reply.code(409).send({ error: action === 'draft' ? 'Draf belum dibuat. Periksa akun, kebijakan, kuota dan Aktivitas.' : 'Proyek tidak ditemukan, sudah diproses, atau belum memiliki draf.' }); }
  });
  for (const action of ['open', 'check', 'close', 'scan'] as const) app.post(`/api/projects-co-id/${action}`, async (req, reply) => {
    if (!service) return reply.code(503).send({ error: 'Worker projects.co.id tidak tersedia.' });
    if (!z.object({}).strict().safeParse(req.body ?? {}).success) return reply.code(400).send({ error: 'Kontrol ini tidak menerima payload.' });
    if (action !== 'close' && service.busy) return reply.code(409).send({ error: 'Worker sedang bekerja.' });
    try {
      if (action === 'close') { await service.close(); return { closed: true }; }
      void service[action]().catch(() => undefined);
      return reply.code(202).send({ accepted: true });
    } catch { return reply.code(409).send({ error: 'Permintaan worker belum dapat dijalankan.' }); }
  });
}
