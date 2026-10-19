import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../controllers/shared.js';

// Read-only status of the background workers; too small for a separate controller.
export function registerAutopilotRoutes(app: FastifyInstance, { options }: AppContext) {
  app.get('/api/autopilot', async () => await options.autopilot?.getStatus() ?? {
    state: 'blocked', lastRunAt: null, nextRunAt: null, lastMessage: 'Autopilot belum tersedia pada server ini.', lastImported: 0, lastSubmitted: 0, specializations: [],
  });
  app.get('/api/business-sync', async () => options.businessSync?.getStatus() ?? null);
}
