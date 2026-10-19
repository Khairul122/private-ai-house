import type { FastifyInstance } from 'fastify';
import { settingsController } from '../controllers/settings.js';
import type { AppContext } from '../controllers/shared.js';

export function registerSettingsRoutes(app: FastifyInstance, ctx: AppContext) {
  const c = settingsController(ctx);
  app.get('/api/settings', c.get);
}
