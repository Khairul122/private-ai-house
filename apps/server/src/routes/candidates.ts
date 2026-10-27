import type { FastifyInstance } from 'fastify';
import { candidatesController } from '../controllers/candidates.js';
import type { AppContext } from '../controllers/shared.js';

export function registerCandidateRoutes(app: FastifyInstance, ctx: AppContext) {
  const c = candidatesController(ctx);
  app.get('/api/candidates', c.list);
  app.post('/api/candidates', c.create);
  app.post('/api/candidates/:id/confirm', c.confirm);
  app.post('/api/candidates/:id/reject', c.reject);
  app.post('/api/candidates/:id/convert', c.convert);
}
