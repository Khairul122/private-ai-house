import type { FastifyInstance } from 'fastify';
import { healthController } from '../controllers/health.js';
import type { AppContext } from '../controllers/shared.js';

export function registerHealthRoutes(app: FastifyInstance, ctx: AppContext) {
  const c = healthController(ctx);
  app.get('/api/health', c.health);
  app.get('/api/insights/bids', c.bidInsights);
  app.get('/api/dashboard', c.dashboard);
}
