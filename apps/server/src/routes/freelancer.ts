import type { FastifyInstance } from 'fastify';
import { freelancerController } from '../controllers/freelancer.js';
import type { AppContext } from '../controllers/shared.js';

export function registerFreelancerRoutes(app: FastifyInstance, ctx: AppContext) {
  const c = freelancerController(ctx);
  app.post('/api/freelancer/verify', c.verify);
  app.post('/api/freelancer/sandbox-write-test', c.sandboxWriteTest);
  app.post('/api/freelancer/projects/sync', c.syncProjects);
}
