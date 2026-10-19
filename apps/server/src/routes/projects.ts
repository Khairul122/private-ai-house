import type { FastifyInstance } from 'fastify';
import { projectsController } from '../controllers/projects.js';
import type { AppContext } from '../controllers/shared.js';

export function registerProjectsRoutes(app: FastifyInstance, ctx: AppContext) {
  const c = projectsController(ctx);
  app.get('/api/projects', c.list);
  app.get('/api/projects/:id', c.get);
  app.get('/api/projects/:id/draft', c.latestDraft);
  app.post('/api/projects/:id/draft', c.createDraft);
  app.put('/api/drafts/:id', c.updateDraft);
  app.get('/api/pipeline', c.pipeline);
}
