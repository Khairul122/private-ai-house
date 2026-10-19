import type { FastifyInstance } from 'fastify';
import { knowledgeController } from '../controllers/knowledge.js';
import type { AppContext } from '../controllers/shared.js';

export function registerKnowledgeRoutes(app: FastifyInstance, ctx: AppContext) {
  const c = knowledgeController(ctx);
  app.get('/api/knowledge', c.overview);
  app.post('/api/knowledge/import', c.importFiles);
  app.addHook('onClose', c.waitForSync);
  app.get('/api/knowledge/sync-status', c.syncStatus);
  ctx.live.watch(['knowledge'], c.currentJob);
  app.post('/api/knowledge/sync', c.startSync);
  app.post('/api/knowledge/github/sync', c.syncGitHub);
  app.post('/api/knowledge/github/sync-all', c.syncAllGitHub);
  app.post('/api/knowledge/search', c.search);
  app.delete('/api/knowledge/sources/:id', c.deleteSource);
}
