import type { FastifyInstance } from 'fastify';
import { capabilitiesController } from '../controllers/capabilities.js';
import type { AppContext } from '../controllers/shared.js';

export function registerCapabilitiesRoutes(app: FastifyInstance, ctx: AppContext) {
  const c = capabilitiesController(ctx);
  app.get('/api/capabilities', c.capabilities);
  app.post('/api/integrations/check', c.checkIntegrations);
}
