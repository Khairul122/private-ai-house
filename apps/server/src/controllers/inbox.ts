import type { FastifyReply, FastifyRequest } from 'fastify';
import type { MessageAnalysis, MessageSnapshot } from '@fvh/persistence';
import type { MessageAnalysisService } from '../services/message-analysis.js';
import { MessageAnalysisError } from '../services/message-analysis.js';
import { analyzeMessageSchema } from '@fvh/contracts';
import { parseBody, type AppContext } from './shared.js';
import { candidateView } from './candidates.js';

const FOLLOW_UP_DAYS = 3;

type MessageAnalysisView = {
  sourceVersion: string;
  contractVersion: string;
  status: MessageAnalysis['status'];
  classification: MessageAnalysis['classification'];
  summary: string | null;
  requirements: MessageAnalysis['requirements'];
  questions: string[];
  replyDraft: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

type MessageSnapshotView = {
  sourceVersion: string;
  messageId: string;
  capturedAt: string;
  completeness: MessageSnapshot['completeness'];
  completenessReason: string | null;
  linkStatus: MessageSnapshot['linkStatus'];
  clientProjectId: string | null;
  analysis: MessageAnalysisView | null;
};

export function analysisView(analysis: MessageAnalysis): MessageAnalysisView {
  return {
    sourceVersion: analysis.sourceVersion,
    contractVersion: analysis.contractVersion,
    status: analysis.status,
    classification: analysis.classification,
    summary: analysis.summary,
    requirements: analysis.requirements,
    questions: analysis.questions,
    replyDraft: analysis.replyDraft,
    error: analysis.error,
    startedAt: analysis.startedAt,
    finishedAt: analysis.finishedAt,
  };
}

function snapshotView(snapshot: MessageSnapshot, analysis: MessageAnalysis | undefined): MessageSnapshotView {
  return {
    sourceVersion: snapshot.sourceVersion,
    messageId: snapshot.messageId,
    capturedAt: snapshot.capturedAt,
    completeness: snapshot.completeness,
    completenessReason: snapshot.completenessReason,
    linkStatus: snapshot.linkStatus,
    clientProjectId: snapshot.clientProjectId,
    analysis: analysis ? analysisView(analysis) : null,
  };
}

function analyzeFailure(reply: FastifyReply, service: MessageAnalysisService | undefined, error: unknown) {
  if (!service) return reply.code(503).send({ error: 'Analisis pesan tidak tersedia di server ini.' });
  if (error instanceof MessageAnalysisError) {
    if (error.code === 'not_found') return reply.code(404).send({ error: error.message });
    if (error.code === 'busy') return reply.code(409).send({ error: error.message });
    return reply.code(503).send({ error: error.message });
  }
  return reply.code(500).send({ error: 'Analisis pesan tidak dapat diproses.' });
}

export function inboxController({ options, repository, now, threadProjectIds }: AppContext) {
  return {
    inbox: async () => {
      const sync = options.businessSync?.getStatus().messages ?? null;
      const selfId = sync?.selfId ?? null;
      const nowMs = now().getTime();
      // Snapshots are newest first; the first entry per thread is the message the thread list shows.
      const snapshots = await repository.listMessageSnapshots(200);
      const analyses = await repository.listMessageAnalyses(snapshots.map((snapshot) => snapshot.sourceVersion));
      const analysisByVersion = new Map(analyses.map((analysis) => [analysis.sourceVersion, analysis]));
      const latestByThread = new Map<string, MessageSnapshotView>();
      for (const snapshot of snapshots) {
        if (!latestByThread.has(snapshot.threadId)) latestByThread.set(snapshot.threadId, snapshotView(snapshot, analysisByVersion.get(snapshot.sourceVersion)));
      }
      const needsReply = selfId === null ? [] : await Promise.all((await repository.listClientThreads())
        .filter((thread) => thread.lastSenderId !== selfId)
        .sort((a, b) => a.lastMessageAt.localeCompare(b.lastMessageAt))
        .map(async (thread) => ({
          threadId: thread.threadId, projectId: thread.projectId, preview: thread.preview, lastMessageAt: thread.lastMessageAt,
          projectTitle: thread.projectId ? (await repository.getProject(`freelancer:${thread.projectId}`))?.title ?? null : null,
          waitingHours: Math.max(0, Math.floor((nowMs - Date.parse(thread.lastMessageAt)) / 3_600_000)),
          snapshot: latestByThread.get(thread.threadId) ?? null,
        })));
      const conversations = await threadProjectIds();
      const followUps = (await Promise.all((await repository.listBidOutcomes())
        .filter((row) => row.outcome === 'pending' && !conversations.has(row.projectId))
        .map(async (row) => ({ projectId: row.projectId, title: (await repository.getProject(row.projectId))?.title ?? row.projectId, submittedAt: row.submittedAt, daysSinceBid: Math.floor((nowMs - Date.parse(row.submittedAt)) / 86_400_000) }))))
        .filter((row) => row.daysSinceBid >= FOLLOW_UP_DAYS);
      return {
        sync: sync && { lastRunAt: sync.lastRunAt, ok: sync.ok, error: sync.error },
        needsReply, followUps,
        candidates: (await repository.listCandidateTasks(50)).map(candidateView),
        messageIntel: {
          available: options.messageAnalysis?.available ?? false,
          reason: options.messageAnalysis?.available ? null : options.draftingReason ?? 'Hermes belum aktif, jadi analisis pesan tidak tersedia.',
          counts: await repository.messageIntelCounts(),
        },
      };
    },

    analyze: async (request: FastifyRequest, reply: FastifyReply) => {
      const service = options.messageAnalysis;
      if (!service) return reply.code(503).send({ error: 'Analisis pesan tidak tersedia di server ini.' });
      if (!request.headers.origin) return reply.code(403).send({ error: 'Header Origin diperlukan.' });
      const parsed = parseBody(analyzeMessageSchema, request.body ?? {});
      if ('issues' in parsed) return reply.code(400).send({ error: 'Permintaan analisis tidak valid.', issues: parsed.issues });
      try {
        const results = parsed.value.sourceVersion
          ? [await service.analyze(parsed.value.sourceVersion)]
          : (await service.analyzePending(parsed.value.limit)).results;
        return reply.code(200).send({ analyses: results.map(analysisView), counts: await service.counts() });
      } catch (error) {
        return analyzeFailure(reply, service, error);
      }
    },
  };
}
