import { createId } from '@fvh/application';
import type { AiMessageAnalysisPort, MessageAnalysisInput } from '@fvh/application';
import type { FreelancerLatestMessage } from '@fvh/adapter-freelancer';
import { messageAnalysisOutputSchema } from '@fvh/contracts';
import type { MessageAnalysisOutput } from '@fvh/contracts';
import type { WorkspaceRepository } from '@fvh/persistence';
import { MESSAGE_CONTRACT_VERSION, inventedAmounts, messageMissionSourceId, messageSourceVersion, quoteViolation, resolveMessageLink } from '@fvh/persistence';
import type { MessageAnalysis, MessageClassification, MessageCompleteness, MessageSnapshot } from '@fvh/persistence';

export type MessageAnalysisErrorCode = 'not_found' | 'busy' | 'unavailable';

export class MessageAnalysisError extends Error {
  constructor(public readonly code: MessageAnalysisErrorCode, message: string) {
    super(message);
    this.name = 'MessageAnalysisError';
  }
}

export type MessageIntelCounts = Awaited<ReturnType<WorkspaceRepository['messageIntelCounts']>>;

type Dependencies = {
  repository: WorkspaceRepository;
  analyze: AiMessageAnalysisPort;
  now?: () => Date;
  /** Lease and mission claimant for one analysis run. */
  claimant?: string;
  /** False when no AI adapter is configured: snapshots are still captured, analysis is refused clearly. */
  available?: boolean;
};

const LEASE_SECONDS = 300;
/** A `running` row older than this was abandoned by a crashed run and may be retried. */
const STALE_RUN_MS = 10 * 60_000;
const MAX_BODY = 4_000;

function safeError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message.replace(/\b(?:token|bearer|authorization)\b[^\s]*/gi, '[redacted]').slice(0, 200) : fallback;
}

function completenessOf(message: FreelancerLatestMessage): { completeness: MessageCompleteness; completenessReason: string | null; truncatedAt: number | null } {
  if (message.messageLength === undefined) {
    return { completeness: 'unknown', completenessReason: 'API tidak melaporkan panjang pesan asli, jadi kelengkapan teks tidak dapat dipastikan.', truncatedAt: null };
  }
  if (message.messageTruncated === true || message.messageLength > MAX_BODY) {
    return {
      completeness: 'truncated',
      completenessReason: `Pesan dipotong: panjang asli ${message.messageLength} karakter, tersimpan ${Math.min(message.messageLength, MAX_BODY)} karakter.`,
      truncatedAt: MAX_BODY,
    };
  }
  return { completeness: 'complete', completenessReason: null, truncatedAt: null };
}

/**
 * Stores each inbound message once per identity. A re-sync with identical text adds nothing;
 * a longer or differently cut message is a new version and becomes analyzable again.
 */
export async function captureMessageSnapshots(
  repository: WorkspaceRepository,
  messages: FreelancerLatestMessage[],
  selfId: string,
  syncedAt: string,
): Promise<number> {
  const inbound = messages.filter((message) => message.senderId !== selfId && message.message.trim().length > 0);
  if (!inbound.length) return 0;
  const projects = await repository.listClientProjects();
  const snapshots: MessageSnapshot[] = inbound.map((message) => {
    const { completeness, completenessReason, truncatedAt } = completenessOf(message);
    const body = message.message.slice(0, MAX_BODY);
    const link = resolveMessageLink(message.projectId, projects);
    return {
      id: createId('msg'),
      threadId: String(message.threadId),
      messageId: String(message.messageId),
      senderId: String(message.senderId),
      projectId: message.projectId,
      clientProjectId: link.clientProjectId,
      linkStatus: link.linkStatus,
      body,
      completeness,
      completenessReason,
      sourceVersion: messageSourceVersion({
        threadId: String(message.threadId), messageId: String(message.messageId), body, completeness, truncatedAt,
      }),
      capturedAt: message.createdAt,
      syncedAt,
    };
  });
  return repository.upsertMessageSnapshots(snapshots);
}

/**
 * Turns one stored client message into a structured reading only when the owner asks.
 * The model never sets a status, price or approval.
 */
export class MessageAnalysisService {
  private readonly now: () => Date;
  private readonly claimant: string;
  readonly available: boolean;

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.claimant = dependencies.claimant ?? 'inbox-analysis';
    this.available = dependencies.available ?? true;
  }

  /** Inbound messages only: a message the owner sent never becomes a work item. */
  async capture(messages: FreelancerLatestMessage[], selfId: string, syncedAt: string): Promise<number> {
    return captureMessageSnapshots(this.dependencies.repository, messages, selfId, syncedAt);
  }

  /** Idempotent per source version: a stored success is returned instead of calling the model again. */
  async analyze(sourceVersion: string): Promise<MessageAnalysis> {
    const { repository } = this.dependencies;
    const snapshot = await repository.getMessageSnapshot(sourceVersion);
    if (!snapshot) throw new MessageAnalysisError('not_found', 'Pesan tersimpan tidak ditemukan.');
    const existing = await repository.getMessageAnalysis(sourceVersion);
    if (existing?.status === 'succeeded') return existing;
    if (existing?.status === 'running' && this.now().getTime() - Date.parse(existing.startedAt) < STALE_RUN_MS) {
      throw new MessageAnalysisError('busy', 'Analisis pesan ini sedang berjalan.');
    }

    const startedAt = this.now().toISOString();
    const blocked = async (error: string, auditType = 'inbox.message_analysis_blocked') => {
      const saved = await repository.saveMessageAnalysis(this.result(snapshot, {
        status: 'blocked', classification: null, summary: null, requirements: [], questions: [], replyDraft: null, error, startedAt, finishedAt: this.now().toISOString(),
      }));
      await repository.appendAudit({ type: auditType, resourceId: snapshot.id, status: 'blocked', reason: error, policyVersion: null, payloadHash: snapshot.sourceVersion });
      return saved;
    };

    if (snapshot.completeness !== 'complete') return blocked(snapshot.completenessReason ?? 'Teks pesan tidak lengkap, jadi analisis tidak dijalankan.');
    if (snapshot.linkStatus !== 'linked') {
      return blocked(snapshot.linkStatus === 'ambiguous'
        ? 'Pesan cocok dengan lebih dari satu proyek aktif, jadi analisis dihentikan.'
        : 'Pesan belum tertaut ke satu proyek aktif, jadi analisis dihentikan.');
    }

    const missionId = await this.claimMission(snapshot);
    await repository.saveMessageAnalysis(this.result(snapshot, {
      status: 'running', classification: null, summary: null, requirements: [], questions: [], replyDraft: null, error: null, startedAt, finishedAt: null,
    }));
    try {
      const project = snapshot.clientProjectId ? await repository.getClientProject(snapshot.clientProjectId) : undefined;
      const output = await this.dependencies.analyze.analyzeMessage(this.input(snapshot, project?.title ?? null));
      const parsed = messageAnalysisOutputSchema.safeParse(output);
      if (!parsed.success) return await this.finishBlocked(snapshot, 'Output analisis tidak sesuai skema.', startedAt, missionId);
      const evidence = this.verify(parsed.data, snapshot.body);
      if (evidence) return await this.finishBlocked(snapshot, evidence, startedAt, missionId);
      const saved = await repository.saveMessageAnalysis(this.result(snapshot, {
        status: 'succeeded',
        classification: parsed.data.classification as MessageClassification,
        summary: parsed.data.summary,
        requirements: parsed.data.requirements.map((requirement, index) => ({ id: `req_${index + 1}`, text: requirement.text, quote: requirement.quote })),
        questions: parsed.data.questions,
        replyDraft: parsed.data.replyDraft,
        error: null,
        startedAt,
        finishedAt: this.now().toISOString(),
      }));
      await repository.appendAudit({ type: 'inbox.message_analysis_succeeded', resourceId: snapshot.id, status: 'recorded', reason: `Pesan dianalisis otomatis (${parsed.data.classification}); draf balasan menunggu tinjauan pemilik.`, policyVersion: null, payloadHash: snapshot.sourceVersion });
      await this.completeMission(missionId, 'completed');
      return saved;
    } catch (error) {
      return this.finishBlocked(snapshot, safeError(error, 'Analisis pesan gagal dan alasannya tidak diketahui.'), startedAt, missionId);
    } finally {
      if (missionId) await this.releaseMission(missionId);
    }
  }

  /** Oldest pending messages first; one blocked message never stops the rest. */
  async analyzePending(limit = 1): Promise<{ results: MessageAnalysis[]; skipped: number }> {
    const snapshots = await this.dependencies.repository.listAnalyzableSnapshots(limit);
    const results: MessageAnalysis[] = [];
    let skipped = 0;
    for (const snapshot of snapshots) {
      try {
        results.push(await this.analyze(snapshot.sourceVersion));
      } catch (error) {
        if (error instanceof MessageAnalysisError && error.code === 'busy') { skipped += 1; continue; }
        throw error;
      }
    }
    return { results, skipped };
  }

  async counts(): Promise<MessageIntelCounts> {
    return this.dependencies.repository.messageIntelCounts();
  }

  private input(snapshot: MessageSnapshot, projectTitle: string | null): MessageAnalysisInput {
    return {
      threadId: snapshot.threadId,
      messageId: snapshot.messageId,
      projectTitle,
      completeness: 'complete',
      completenessReason: null,
      body: snapshot.body,
    };
  }

  private verify(output: MessageAnalysisOutput, body: string): string | null {
    const quote = quoteViolation(output.requirements, body);
    if (quote) return quote;
    const invented = inventedAmounts(output, body);
    if (invented.length) return `Draf memuat nominal yang tidak disebut klien: ${invented.join(', ')}.`;
    return null;
  }

  private async finishBlocked(snapshot: MessageSnapshot, error: string, startedAt: string, missionId?: string): Promise<MessageAnalysis> {
    const saved = await this.dependencies.repository.saveMessageAnalysis(this.result(snapshot, {
      status: 'blocked', classification: null, summary: null, requirements: [], questions: [], replyDraft: null, error, startedAt, finishedAt: this.now().toISOString(),
    }));
    await this.dependencies.repository.appendAudit({ type: 'inbox.message_analysis_blocked', resourceId: snapshot.id, status: 'blocked', reason: error, policyVersion: null, payloadHash: snapshot.sourceVersion });
    await this.completeMission(missionId, 'blocked');
    return saved;
  }

  private result(snapshot: MessageSnapshot, input: {
    status: MessageAnalysis['status'];
    classification: MessageAnalysis['classification'];
    summary: string | null;
    requirements: MessageAnalysis['requirements'];
    questions: string[];
    replyDraft: string | null;
    error: string | null;
    startedAt: string;
    finishedAt: string | null;
  }): MessageAnalysis {
    return {
      analysisId: createId('analysis'),
      sourceVersion: snapshot.sourceVersion,
      contractVersion: MESSAGE_CONTRACT_VERSION,
      updatedAt: this.now().toISOString(),
      ...input,
    };
  }

  /** One mission per message and stage; a lease keeps two runs from calling the model at once. */
  private async claimMission(snapshot: MessageSnapshot): Promise<string | undefined> {
    const { repository } = this.dependencies;
    const sourceId = messageMissionSourceId('analysis', snapshot.sourceVersion);
    let mission = await repository.getMissionBySource('inbox', sourceId)
      ?? await repository.createMission({
        source: 'inbox', sourceId, kind: 'inbox.message_analysis', status: 'queued', priority: 'normal',
        title: `Analisis pesan ${snapshot.threadId}`, dueAt: null, assignedTo: this.claimant, payload: {},
      });
    if (!mission) return undefined;
    // A blocked attempt is closed; retrying it reopens the same mission instead of stranding a terminal row.
    if (mission.status === 'blocked') mission = await repository.updateMissionStatus(mission.id, { status: 'queued' }) ?? mission;
    const claim = await repository.claimMission(mission.id, { claimant: this.claimant, leaseSeconds: LEASE_SECONDS });
    if (!claim) throw new MessageAnalysisError('busy', 'Analisis pesan ini sedang berjalan di proses lain.');
    if (mission.status === 'queued') await repository.updateMissionStatus(mission.id, { status: 'in_progress' });
    return mission.id;
  }

  private async completeMission(missionId: string | undefined, status: 'completed' | 'blocked') {
    if (!missionId) return;
    try {
      await this.dependencies.repository.updateMissionStatus(missionId, status === 'completed'
        ? { status }
        : { status, blocker: 'Analisis pesan diblokir; lihat catatan analisis.' });
    } catch {
      // A mission in a terminal state is not an analysis failure.
    }
  }

  private async releaseMission(missionId: string) {
    const lease = await this.dependencies.repository.getMissionLease(missionId);
    if (lease) await this.dependencies.repository.releaseMissionLease(missionId, { claimant: lease.claimant, leaseId: lease.leaseId });
  }
}
