import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  confirmCandidateTaskSchema, convertCandidateTaskSchema, createCandidateTaskSchema, rejectCandidateTaskSchema,
} from '@fvh/contracts';
import type { CandidateTask } from '@fvh/persistence';
import { CandidateTaskError, CandidateTaskService } from '../services/candidate-tasks.js';
import { parseBody, paramsSchema, type AppContext } from './shared.js';

export function candidateView(candidate: CandidateTask) {
  return {
    id: candidate.id,
    sourceVersion: candidate.sourceVersion,
    clientProjectId: candidate.clientProjectId,
    projectTitle: candidate.projectTitle,
    classification: candidate.classification,
    title: candidate.title,
    objective: candidate.objective,
    requirements: candidate.requirements,
    acceptanceCriteria: candidate.acceptanceCriteria,
    questions: candidate.questions,
    dependencies: candidate.dependencies,
    scopeStatus: candidate.scopeStatus,
    scopeNote: candidate.scopeNote,
    convertedMissionId: candidate.convertedMissionId,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    confirmedAt: candidate.confirmedAt,
    convertedAt: candidate.convertedAt,
  };
}

function candidateFailure(reply: FastifyReply, error: unknown) {
  if (error instanceof CandidateTaskError) {
    return reply.code(error.code === 'not_found' ? 404 : 409).send({ error: error.message });
  }
  return reply.code(500).send({ error: 'Calon tugas tidak dapat diproses.' });
}

function candidateId(request: FastifyRequest, reply: FastifyReply): string | undefined {
  const parsed = paramsSchema.safeParse(request.params);
  if (!parsed.success) {
    void reply.code(400).send({ error: 'ID calon tugas tidak valid.' });
    return undefined;
  }
  return parsed.data.id;
}

export function candidatesController({ options, repository, now }: AppContext) {
  const service: CandidateTaskService = options.candidateTasks ?? new CandidateTaskService({ repository, now });

  return {
    list: async () => {
      return { candidates: (await service.list(50)).map(candidateView) };
    },

    create: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.headers.origin) return reply.code(403).send({ error: 'Header Origin diperlukan.' });
      const parsed = parseBody(createCandidateTaskSchema, request.body ?? {});
      if ('issues' in parsed) return reply.code(400).send({ error: 'Permintaan calon tugas tidak valid.', issues: parsed.issues });
      try {
        const result = await service.createFromAnalysis(parsed.value.sourceVersion);
        return reply.code(result.created ? 201 : 200).send({ candidate: candidateView(result.candidate), created: result.created });
      } catch (error) {
        return candidateFailure(reply, error);
      }
    },

    confirm: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.headers.origin) return reply.code(403).send({ error: 'Header Origin diperlukan.' });
      const id = candidateId(request, reply);
      if (!id) return reply;
      const parsed = parseBody(confirmCandidateTaskSchema, request.body ?? {});
      if ('issues' in parsed) return reply.code(400).send({ error: 'Konfirmasi lingkup tidak valid.', issues: parsed.issues });
      try {
        return { candidate: candidateView(await service.confirm(id, parsed.value)) };
      } catch (error) {
        return candidateFailure(reply, error);
      }
    },

    reject: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.headers.origin) return reply.code(403).send({ error: 'Header Origin diperlukan.' });
      const id = candidateId(request, reply);
      if (!id) return reply;
      const parsed = parseBody(rejectCandidateTaskSchema, request.body ?? {});
      if ('issues' in parsed) return reply.code(400).send({ error: 'Alasan penolakan tidak valid.', issues: parsed.issues });
      try {
        return { candidate: candidateView(await service.reject(id, parsed.value.reason)) };
      } catch (error) {
        return candidateFailure(reply, error);
      }
    },

    convert: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.headers.origin) return reply.code(403).send({ error: 'Header Origin diperlukan.' });
      const id = candidateId(request, reply);
      if (!id) return reply;
      const parsed = parseBody(convertCandidateTaskSchema, request.body ?? {});
      if ('issues' in parsed) return reply.code(400).send({ error: 'Konversi memerlukan konfirmasi pemilik.', issues: parsed.issues });
      try {
        const result = await service.convert(id);
        return reply.code(result.created ? 201 : 200).send({
          candidate: candidateView(result.candidate),
          mission: { id: result.mission.id, status: result.mission.status, title: result.mission.title },
          created: result.created,
        });
      } catch (error) {
        return candidateFailure(reply, error);
      }
    },
  };
}
