import type { AppContext } from './shared.js';

const FOLLOW_UP_DAYS = 3;

export function inboxController({ options, repository, now, threadProjectIds }: AppContext) {
  return {
    inbox: async () => {
      const sync = options.businessSync?.getStatus().messages ?? null;
      const selfId = sync?.selfId ?? null;
      const nowMs = now().getTime();
      const needsReply = selfId === null ? [] : await Promise.all((await repository.listClientThreads())
        .filter((thread) => thread.lastSenderId !== selfId)
        .sort((a, b) => a.lastMessageAt.localeCompare(b.lastMessageAt))
        .map(async (thread) => ({
          threadId: thread.threadId, projectId: thread.projectId, preview: thread.preview, lastMessageAt: thread.lastMessageAt,
          projectTitle: thread.projectId ? (await repository.getProject(`freelancer:${thread.projectId}`))?.title ?? null : null,
          waitingHours: Math.max(0, Math.floor((nowMs - Date.parse(thread.lastMessageAt)) / 3_600_000)),
        })));
      const conversations = await threadProjectIds();
      const followUps = (await Promise.all((await repository.listBidOutcomes())
        .filter((row) => row.outcome === 'pending' && !conversations.has(row.projectId))
        .map(async (row) => ({ projectId: row.projectId, title: (await repository.getProject(row.projectId))?.title ?? row.projectId, submittedAt: row.submittedAt, daysSinceBid: Math.floor((nowMs - Date.parse(row.submittedAt)) / 86_400_000) }))))
        .filter((row) => row.daysSinceBid >= FOLLOW_UP_DAYS);
      return { sync: sync && { lastRunAt: sync.lastRunAt, ok: sync.ok, error: sync.error }, needsReply, followUps };
    },
  };
}
