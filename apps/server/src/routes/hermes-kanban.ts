import type { FastifyInstance } from 'fastify';
import { hermesKanbanController } from '../controllers/hermes-kanban.js';
import type { HermesKanban } from '../services/hermes-kanban.js';

export function registerHermesKanbanRoutes(app: FastifyInstance, kanban: HermesKanban | undefined, now: () => Date) {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/hermes-kanban')) return;
    reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method) && !req.headers.origin) return reply.code(403).send({ error: 'Header Origin diperlukan.' });
  });
  const c = hermesKanbanController(app, kanban, now);
  app.get('/api/hermes-kanban', c.status);
  app.get('/api/hermes-kanban/tasks/:id', c.detail);
  app.post('/api/hermes-kanban/tasks', c.create);
  app.post('/api/hermes-kanban/tasks/:id/recover', c.recover);
  app.addHook('onReady', async () => { kanban?.start(); });
  app.addHook('onClose', async () => { await kanban?.stop(); });
}
