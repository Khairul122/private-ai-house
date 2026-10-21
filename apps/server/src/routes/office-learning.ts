import type { FastifyInstance } from 'fastify';
import { officeLearningController } from '../controllers/office-learning.js';
import type { OfficeLearningService } from '../services/office-learning.js';

export function registerOfficeLearningRoutes(app: FastifyInstance, service: OfficeLearningService | undefined) {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/office-learning')) return;
    reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method) && !req.headers.origin) return reply.code(403).send({ error: 'Header Origin diperlukan.' });
  });
  const c = officeLearningController(service);
  app.get('/api/office-learning', c.status);
  app.post('/api/office-learning/run', c.run);
  app.put('/api/office-learning/enabled', c.enabled);
}
