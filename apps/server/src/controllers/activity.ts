import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from './shared.js';

const agendaSchema = z.object({ days: z.coerce.number().int().min(1).max(366).default(120), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const agendaCategory = (type: string, status: string): string | null => {
  if (type === 'marketplace.production.submit_bid') return status === 'recorded' ? 'bidSent' : status === 'failed' ? 'bidFailed' : null;
  if (type === 'autopilot.cycle') return 'cycles';
  if (type === 'autopilot.bid_skipped') return 'skipped';
  if (type.startsWith('policy.') || type === 'autopilot.policy_bootstrapped') return 'policy';
  if (type.startsWith('bid.draft') || type === 'autopilot.draft_fallback') return 'drafts';
  if (type.startsWith('knowledge.')) return 'knowledge';
  if (type.startsWith('business.') || type.startsWith('marketplace.')) return 'sync';
  return 'other';
};

export function activityController({ repository, now }: AppContext) {
  return {
    // Past activity for the calendar: per-day counts, or the events of one day when ?date= is given.
    agenda: async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = agendaSchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ error: 'Parameter agenda tidak valid.' });
      const timezone = (await repository.getPolicy()).timezone;
      if (parsed.data.date) return { date: parsed.data.date, events: await repository.auditForDay(timezone, parsed.data.date) };
      const rows = await repository.auditDailySummary(timezone, new Date(now().getTime() - parsed.data.days * 86_400_000).toISOString());
      const days: Record<string, Record<string, number>> = {};
      for (const row of rows) {
        const category = agendaCategory(row.type, row.status);
        if (!category) continue;
        const day = (days[row.day] ??= {});
        day[category] = (day[category] ?? 0) + row.total;
      }
      return { timezone, days };
    },

    list: async (request: FastifyRequest) => {
      const query = request.query as { limit?: string; type?: string };
      const limit = Math.max(1, Math.min(500, Number.parseInt(query.limit ?? '50', 10) || 50));
      return query.type ? await repository.listAuditForType(query.type.slice(0, 120), limit) : await repository.listAudit(limit);
    },
  };
}
