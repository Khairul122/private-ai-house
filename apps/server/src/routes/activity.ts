import type { FastifyInstance } from 'fastify';
import { activityController } from '../controllers/activity.js';
import type { AppContext } from '../controllers/shared.js';

export function registerActivityRoutes(app: FastifyInstance, ctx: AppContext) {
  const c = activityController(ctx);
  app.get('/api/agenda/activity', c.agenda);
  app.get('/api/activity', c.list);
}
