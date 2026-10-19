import type { FastifyReply, FastifyRequest } from 'fastify';
import { createClientProjectSchema, createPaymentSchema, updateClientProjectSchema } from '@fvh/contracts';
import { localDateKey } from '../services/autopilot.js';
import { paramsSchema, parseBody, type AppContext } from './shared.js';

const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function workController({ repository, now }: AppContext) {
  return {
    summary: async () => {
      const policy = await repository.getPolicy();
      const today = localDateKey(now(), policy.timezone);
      const month = today.slice(0, 7);
      const projectsById = new Map((await repository.listClientProjects()).map((project) => [project.id, project]));
      const projects = [...projectsById.values()]
        .map((project) => ({ ...project, daysToDeadline: project.deadline ? dayDiff(today, project.deadline) : null }))
        .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || (a.daysToDeadline ?? Infinity) - (b.daysToDeadline ?? Infinity));
      const payments = await repository.listPayments();
      const received = new Map<string, { currency: string; total: number; bySource: Record<string, number> }>();
      const expected = new Map<string, { currency: string; total: number }>();
      for (const payment of payments) {
        if (payment.status === 'expected') {
          const entry = expected.get(payment.currency) ?? { currency: payment.currency, total: 0 };
          entry.total += payment.amount;
          expected.set(payment.currency, entry);
        } else if (payment.receivedAt && localDateKey(new Date(payment.receivedAt), policy.timezone).startsWith(month)) {
          const entry = received.get(payment.currency) ?? { currency: payment.currency, total: 0, bySource: {} };
          const source = projectsById.get(payment.projectId)?.source ?? 'other';
          entry.total += payment.amount;
          entry.bySource[source] = (entry.bySource[source] ?? 0) + payment.amount;
          received.set(payment.currency, entry);
        }
      }
      return {
        projects, payments, income: { month, received: [...received.values()], expected: [...expected.values()] },
        dueSoon: projects.filter((project) => project.status === 'active' && project.daysToDeadline !== null && project.daysToDeadline >= 0 && project.daysToDeadline <= 2).length,
      };
    },

    createProject: async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = parseBody(createClientProjectSchema, request.body);
      if ('issues' in parsed) return reply.code(400).send({ error: 'Data proyek tidak valid.', issues: parsed.issues });
      const project = await repository.createClientProject({ ...parsed.value, externalProjectId: null });
      if (!project) return reply.code(409).send({ error: 'Proyek sudah ada.' });
      await repository.appendAudit({ type: 'work.project_created', resourceId: project.id, status: 'recorded', reason: `Proyek klien "${project.title}" ditambahkan.`, policyVersion: null, payloadHash: null });
      return reply.code(201).send(project);
    },

    updateProject: async (request: FastifyRequest, reply: FastifyReply) => {
      const params = paramsSchema.safeParse(request.params);
      const parsed = parseBody(updateClientProjectSchema, request.body);
      if (!params.success || 'issues' in parsed) return reply.code(400).send({ error: 'Perubahan proyek tidak valid.', ...('issues' in parsed ? { issues: parsed.issues } : {}) });
      const patch = Object.fromEntries(Object.entries(parsed.value).filter(([, value]) => value !== undefined));
      const project = await repository.updateClientProject(params.data.id, patch);
      if (!project) return reply.code(404).send({ error: 'Proyek tidak ditemukan.' });
      await repository.appendAudit({ type: 'work.project_updated', resourceId: project.id, status: 'recorded', reason: `Proyek "${project.title}" diperbarui (status ${project.status}).`, policyVersion: null, payloadHash: null });
      return project;
    },

    createPayment: async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = parseBody(createPaymentSchema, request.body);
      if ('issues' in parsed) return reply.code(400).send({ error: 'Data pembayaran tidak valid.', issues: parsed.issues });
      if (!await repository.getClientProject(parsed.value.projectId)) return reply.code(404).send({ error: 'Proyek tidak ditemukan.' });
      const payment = await repository.createPayment({ ...parsed.value, receivedAt: parsed.value.status === 'received' ? now().toISOString() : null });
      await repository.appendAudit({ type: 'work.payment_recorded', resourceId: payment.id, status: 'recorded', reason: `Pembayaran ${payment.currency} ${payment.amount} dicatat (${payment.status === 'received' ? 'diterima' : 'diharapkan'}).`, policyVersion: null, payloadHash: null });
      return reply.code(201).send(payment);
    },

    markPaymentReceived: async (request: FastifyRequest, reply: FastifyReply) => {
      const params = paramsSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: 'ID pembayaran tidak valid.' });
      const payment = await repository.markPaymentReceived(params.data.id, now().toISOString());
      if (!payment) return reply.code(404).send({ error: 'Pembayaran tidak ditemukan.' });
      await repository.appendAudit({ type: 'work.payment_received', resourceId: payment.id, status: 'recorded', reason: `Pembayaran ${payment.currency} ${payment.amount} ditandai diterima.`, policyVersion: null, payloadHash: null });
      return payment;
    },
  };
}
