import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../controllers/shared.js';
import { DailyPriorityService } from '../services/daily-priority.js';

export function registerDailyPriorityRoutes(app: FastifyInstance, ctx: AppContext) {
  const service = new DailyPriorityService({
    repository: ctx.repository,
    now: ctx.now,
    businessSync: ctx.options.businessSync,
  });
  app.get('/api/daily-priority', async () => service.current());
  app.post('/api/daily-priority/refresh', async () => service.current({ regenerate: true }));
}
