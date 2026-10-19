import type { FastifyInstance } from 'fastify';
import { inboxController } from '../controllers/inbox.js';
import type { AppContext } from '../controllers/shared.js';

export function registerInboxRoutes(app: FastifyInstance, ctx: AppContext) {
  const c = inboxController(ctx);
  app.get('/api/inbox', c.inbox);
}
