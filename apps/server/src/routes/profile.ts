import type { FastifyInstance } from 'fastify';
import { profileController } from '../controllers/profile.js';
import type { AppContext } from '../controllers/shared.js';

export function registerProfileRoutes(app: FastifyInstance, ctx: AppContext) {
  const c = profileController(ctx);
  app.get('/api/profile', c.get);
  app.put('/api/profile', c.update);
}
