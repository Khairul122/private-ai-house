import type { FastifyInstance } from 'fastify';
import { policyController } from '../controllers/policy.js';
import type { AppContext } from '../controllers/shared.js';

export function registerPolicyRoutes(app: FastifyInstance, ctx: AppContext) {
  const c = policyController(ctx);
  app.get('/api/policy', c.get);
  app.get('/api/policy/presets', c.presets);
  app.put('/api/policy', c.update);
  app.post('/api/policy/activate', c.activate);
  app.post('/api/policy/pause', c.pause);
  app.post('/api/policy/resume', c.resume);
}
