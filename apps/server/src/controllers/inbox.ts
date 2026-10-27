import type { AppContext } from './shared.js';
import type { InboxAnalysisResult } from '../services/inbox-analysis.js';

const FOLLOW_UP_DAYS = 3;

export function inboxController({ options, repository, now, threadProjectIds }: AppContext) {
  return {
    inbox: async () => {
      const sync = options.businessSync?.getStatus().messages ?? null;
      const selfId = sync?.selfId ?? null;
      const nowMs = now().getTime();
      const incoming = selfId === null ? [] : (await repository.listClientThreads())
        .filter((thread) => thread.lastSenderId !== selfId);
      const analyses = await repository.listInboxAnalyses(incoming.map(thread => thread.threadId));
      const needsReply = await Promise.all(incoming
        .sort((a, b) => a.lastMessageAt.localeCompare(b.lastMessageAt))
        .map(async (thread) => {
          const latest = analyses.find(item => item.snapshot.threadId === thread.threadId
            && Date.parse(item.snapshot.createdAt) === Date.parse(thread.lastMessageAt));
          return {
          threadId: thread.threadId, projectId: thread.projectId, preview: thread.preview, lastMessageAt: thread.lastMessageAt,
          projectTitle: thread.projectId ? (await repository.getProject(`freelancer:${thread.projectId}`))?.title ?? null : null,
          waitingHours: Math.max(0, Math.floor((nowMs - Date.parse(thread.lastMessageAt)) / 3_600_000)),
          analysis: latest ? { id: latest.analysis.id, status: latest.analysis.status, finishedAt: latest.analysis.finishedAt,
            error: latest.analysis.error, result: latest.analysis.resultJson as InboxAnalysisResult | null,
            source: { threadId: latest.snapshot.threadId, messageId: latest.snapshot.messageId, sourceVersion: latest.snapshot.sourceVersion,
              completeness: latest.snapshot.completeness, completenessReason: latest.snapshot.completenessReason,
              linkStatus: latest.snapshot.linkStatus, clientProjectId: latest.snapshot.clientProjectId } } : null,
          };
        }));
      const conversations = await threadProjectIds();
      const followUps = (await Promise.all((await repository.listBidOutcomes())
        .filter((row) => row.outcome === 'pending' && !conversations.has(row.projectId))
        .map(async (row) => ({ projectId: row.projectId, title: (await repository.getProject(row.projectId))?.title ?? row.projectId, submittedAt: row.submittedAt, daysSinceBid: Math.floor((nowMs - Date.parse(row.submittedAt)) / 86_400_000) }))))
        .filter((row) => row.daysSinceBid >= FOLLOW_UP_DAYS);
      return { sync: sync && { lastRunAt: sync.lastRunAt, ok: sync.ok, error: sync.error }, needsReply, followUps };
    },
  };
}
