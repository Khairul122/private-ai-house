import type { AppContext } from './shared.js';
import { bidAnalytics } from '@fvh/domain';

export function healthController({ options, repository, now, draftingMode, threadProjectIds }: AppContext) {
  return {
    health: async () => ({
      ok: true, mode: 'local', database: 'postgres', ai: draftingMode, liveWrites: (await options.autopilot?.getStatus())?.state === 'running',
      manualProductionWritesConfigured: (options.getCredentialStatus?.() ?? options.credentialStatus)?.freelancerAccessTokenConfigured ?? false,
      autopilot: (await options.autopilot?.getStatus())?.state ?? 'unavailable',
    }),

    bidInsights: async () => {
      const outcomes = await repository.listBidOutcomes();
      const won = outcomes.filter(({ outcome }) => outcome === 'won').length;
      const lost = outcomes.filter(({ outcome }) => outcome === 'lost').length;
      const pending = outcomes.filter(({ outcome }) => outcome === 'pending').length;
      const conversations = await threadProjectIds();
      const since = new Date(now().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const reasons = await repository.skipReasonSummary(since);
      const sync = options.businessSync?.getStatus().outcomes;
      const lastChecked = outcomes.map(({ checkedAt }) => checkedAt).filter((value): value is string => value !== null).sort().at(-1) ?? null;
      return {
        outcomes: { submitted: outcomes.length, won, lost, pending, withConversation: outcomes.filter((row) => conversations.has(row.projectId)).length, winRate: won + lost === 0 ? null : won / (won + lost) },
        recent: await Promise.all(outcomes.slice(0, 10).map(async (outcome) => ({ projectId: outcome.projectId, title: (await repository.getProject(outcome.projectId))?.title ?? null, submittedAt: outcome.submittedAt, outcome: outcome.outcome, awardStatus: outcome.awardStatus, checkedAt: outcome.checkedAt }))),
        skips: { total: reasons.reduce((total, reason) => total + Number(reason.total), 0), recent7d: reasons.reduce((total, reason) => total + Number(reason.recent), 0), reasons },
        // Only fields stored with each bid feed these groups; missing attributes are reported, never guessed.
        analytics: bidAnalytics(outcomes.map((row) => ({
          projectId: row.projectId, amount: row.amount, currency: row.currency,
          submittedAt: row.submittedAt, outcome: row.outcome, checkedAt: row.checkedAt,
        }))),
        lastCheck: sync?.lastRunAt ? { at: sync.lastRunAt, ok: sync.ok, error: sync.error } : { at: lastChecked, ok: lastChecked ? true : null, error: null },
      };
    },

    dashboard: async () => {
      const projects = await repository.listProjects();
      const draftCount = (await repository.latestDrafts()).size;
      const activity = await repository.listAudit(8);
      const sources = await repository.listKnowledgeSources();
      const policy = await repository.getPolicy();
      const profile = await repository.getProfile();
      return {
        mode: 'workspace lokal',
        counts: {
          openProjects: projects.filter((project) => project.status === 'open').length,
          drafts: draftCount,
          submittedBids: projects.filter((project) => project.source === 'freelancer' && project.pipelineStatus === 'submitted').length,
          // Read-only gate hits on the projects.co.id tab are safety events, not policy decisions.
          policySkips: await repository.countAuditByStatus('blocked', ['projects_co_id.write_blocked']),
          knowledgeSources: sources.length,
        },
        policy: { state: policy.state, version: policy.version, simulationOnly: policy.simulationOnly },
        bidUsage: await repository.bidUsage(now(), policy.timezone),
        profileComplete: Boolean(profile.primaryField && profile.specializations.length),
        projects: projects.slice(0, 4),
        activity,
        externalWrites: policy.state === 'active' && !policy.simulationOnly,
      };
    },
  };
}
