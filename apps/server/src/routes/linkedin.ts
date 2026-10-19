import type { FastifyInstance } from 'fastify';
import { linkedinController } from '../controllers/linkedin.js';
import type { AppContext } from '../controllers/shared.js';

export function registerLinkedInRoutes(app: FastifyInstance, ctx: AppContext) {
  const c = linkedinController(ctx);
  app.post('/api/linkedin/connect', c.connect);
  app.get('/api/linkedin/callback', c.callback);
  app.post('/api/linkedin/sync', c.sync);
  app.post('/api/linkedin/disconnect', c.disconnect);
}
