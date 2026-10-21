import { officeLearningEnabledSchema } from '@fvh/contracts';
import type { OfficeLearningService } from '../services/office-learning.js';
import type { FastifyReply, FastifyRequest } from 'fastify';

export function officeLearningController(service: OfficeLearningService | undefined) {
  return {
    status: async () => service ? service.status() : null,
    run: async (_req: FastifyRequest, reply: FastifyReply) => {
      if (!service) return reply.code(503).send({ error: 'Hermes belum tersedia untuk belajar.' });
      return service.run();
    },
    enabled: async (req: FastifyRequest, reply: FastifyReply) => {
      const { enabled } = officeLearningEnabledSchema.parse(req.body);
      if (!service) return reply.code(503).send({ error: 'Hermes belum tersedia untuk belajar.' });
      return service.setEnabled(enabled);
    },
  };
}
