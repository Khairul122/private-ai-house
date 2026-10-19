import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../controllers/shared.js';
import { workController } from '../controllers/work.js';

export function registerWorkRoutes(app: FastifyInstance, ctx: AppContext) {
  const c = workController(ctx);
  app.get('/api/work', c.summary);
  app.post('/api/work/projects', c.createProject);
  app.put('/api/work/projects/:id', c.updateProject);
  app.post('/api/work/payments', c.createPayment);
  app.post('/api/work/payments/:id/received', c.markPaymentReceived);
}
