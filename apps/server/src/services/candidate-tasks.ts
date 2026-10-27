import { createId } from '@fvh/application';
import type { WorkspaceRepository } from '@fvh/persistence';
import {
  buildCandidateTask, canConfirmCandidate, canConvertCandidate, canRejectCandidate, candidateMissionSourceId, messageMissionSourceId,
} from '@fvh/persistence';
import type { CandidateTask } from '@fvh/persistence';
import type { MissionItem } from '@fvh/domain';

export type CandidateTaskErrorCode = 'not_found' | 'conflict';

export class CandidateTaskError extends Error {
  constructor(public readonly code: CandidateTaskErrorCode, message: string) {
    super(message);
    this.name = 'CandidateTaskError';
  }
}

/** The employee that receives the converted mission: Manajer Operasional (lantai dua). */
const OWNER_PROFILE = 'fvh-delivery-manager';

const PRIORITY: Record<CandidateTask['classification'], MissionItem['priority']> = {
  bug: 'high',
  scope_change: 'high',
  feature: 'normal',
  question: 'low',
  unknown: 'normal',
};

type Dependencies = {
  repository: WorkspaceRepository;
  now?: () => Date;
};

/**
 * Turns a verified message analysis into an owner-reviewable candidate task.
 * Nothing here executes work, sends a message, or changes a policy: only the owner approves scope.
 */
export class CandidateTaskService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: Dependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async list(limit = 50): Promise<CandidateTask[]> {
    return this.dependencies.repository.listCandidateTasks(limit);
  }

  /** Idempotent per message version: a second request returns the stored candidate without a new audit row. */
  async createFromAnalysis(sourceVersion: string): Promise<{ candidate: CandidateTask; created: boolean }> {
    const { repository } = this.dependencies;
    const snapshot = await repository.getMessageSnapshot(sourceVersion);
    if (!snapshot) throw new CandidateTaskError('not_found', 'Pesan tersimpan tidak ditemukan.');
    const analysis = await repository.getMessageAnalysis(sourceVersion);
    if (!analysis || analysis.status !== 'succeeded') {
      throw new CandidateTaskError('conflict', analysis?.status === 'blocked'
        ? `Analisis pesan diblokir: ${analysis.error ?? 'alasan tidak tersimpan'}.`
        : 'Analisis pesan belum selesai, jadi calon tugas belum dapat dibuat.');
    }
    if (snapshot.linkStatus !== 'linked' || !snapshot.clientProjectId) {
      throw new CandidateTaskError('conflict', 'Pesan belum tertaut ke satu proyek aktif, jadi calon tugas belum dapat dibuat.');
    }
    if (!analysis.classification) {
      throw new CandidateTaskError('conflict', 'Analisis tidak memuat klasifikasi, jadi calon tugas belum dapat dibuat.');
    }
    const project = await repository.getClientProject(snapshot.clientProjectId);
    if (!project) throw new CandidateTaskError('conflict', 'Proyek aktif yang tertaut sudah tidak ada.');

    const analysisMission = await repository.getMissionBySource('inbox', messageMissionSourceId('analysis', sourceVersion));
    const candidate = buildCandidateTask({
      id: createId('candidate'),
      sourceVersion,
      clientProjectId: project.id,
      projectTitle: project.title,
      classification: analysis.classification,
      summary: analysis.summary,
      requirements: analysis.requirements,
      questions: analysis.questions,
      analysisMissionId: analysisMission?.id ?? null,
      now: this.now().toISOString(),
    });
    const stored = await repository.createCandidateTask(candidate);
    if (stored.created) {
      await repository.appendAudit({
        type: 'inbox.candidate_task_created', resourceId: stored.candidate.id, status: 'recorded',
        reason: 'Calon tugas dibuat dari analisis pesan klien; lingkup menunggu konfirmasi pemilik.',
        policyVersion: null, payloadHash: sourceVersion,
      });
    }
    return stored;
  }

  /** The owner accepts the scope, optionally rewriting the title or objective. */
  async confirm(id: string, input: { title?: string | undefined; objective?: string | undefined }): Promise<CandidateTask> {
    const existing = await this.get(id);
    if (!canConfirmCandidate(existing.scopeStatus)) {
      throw new CandidateTaskError('conflict', this.statusReason(existing, 'dikonfirmasi'));
    }
    const updated = await this.dependencies.repository.confirmCandidateTask(id, {
      now: this.now().toISOString(), title: input.title, objective: input.objective,
    });
    if (!updated) throw new CandidateTaskError('conflict', 'Status calon tugas berubah bersamaan; muat ulang lalu coba lagi.');
    await this.dependencies.repository.appendAudit({
      type: 'inbox.candidate_task_confirmed', resourceId: id, status: 'recorded',
      reason: 'Lingkup calon tugas dikonfirmasi pemilik.', policyVersion: null, payloadHash: existing.sourceVersion,
    });
    return updated;
  }

  async reject(id: string, reason: string): Promise<CandidateTask> {
    const existing = await this.get(id);
    if (!canRejectCandidate(existing.scopeStatus)) {
      throw new CandidateTaskError('conflict', this.statusReason(existing, 'ditolak'));
    }
    const updated = await this.dependencies.repository.rejectCandidateTask(id, { now: this.now().toISOString(), reason });
    if (!updated) throw new CandidateTaskError('conflict', 'Status calon tugas berubah bersamaan; muat ulang lalu coba lagi.');
    await this.dependencies.repository.appendAudit({
      type: 'inbox.candidate_task_rejected', resourceId: id, status: 'blocked', reason,
      policyVersion: null, payloadHash: existing.sourceVersion,
    });
    return updated;
  }

  /**
   * Creates one local mission for a confirmed candidate. A repeated call returns the mission already
   * recorded for this message version instead of creating a second one.
   */
  async convert(id: string): Promise<{ candidate: CandidateTask; mission: MissionItem; created: boolean }> {
    const { repository } = this.dependencies;
    const existing = await this.get(id);
    if (existing.scopeStatus === 'converted') {
      const mission = await repository.getMissionBySource('inbox', candidateMissionSourceId(existing.sourceVersion));
      if (!mission) throw new CandidateTaskError('conflict', 'Calon tugas sudah ditandai terkonversi, tetapi tiket lokalnya tidak ditemukan.');
      return { candidate: existing, mission, created: false };
    }
    if (!canConvertCandidate(existing.scopeStatus)) {
      throw new CandidateTaskError('conflict', this.statusReason(existing, 'dijadikan tiket lokal'));
    }

    const sourceId = candidateMissionSourceId(existing.sourceVersion);
    let mission = await repository.getMissionBySource('inbox', sourceId);
    let created = false;
    if (!mission) {
      mission = await repository.createMission({
        source: 'inbox',
        sourceId,
        kind: 'client.candidate_task',
        title: existing.title,
        priority: PRIORITY[existing.classification],
        dueAt: null,
        assignedTo: OWNER_PROFILE,
        payload: { projectId: existing.clientProjectId },
      });
      created = Boolean(mission);
      // A concurrent convert may have won the unique (source, source_id) insert: reuse its mission.
      mission ??= await repository.getMissionBySource('inbox', sourceId);
    }
    if (!mission) throw new CandidateTaskError('conflict', 'Tiket lokal tidak dapat dibuat dari calon tugas ini.');

    const updated = await repository.markCandidateConverted(id, { now: this.now().toISOString(), missionId: mission.id })
      ?? await this.get(id);
    if (updated.scopeStatus !== 'converted' || updated.convertedMissionId !== mission.id) {
      // The candidate changed under us: never leave a queued mission the owner did not convert.
      if (created) await repository.updateMissionStatus(mission.id, { status: 'canceled' }).catch(() => undefined);
      throw new CandidateTaskError('conflict', 'Status calon tugas berubah bersamaan; muat ulang lalu coba lagi.');
    }
    if (created) {
      await repository.appendAudit({
        type: 'inbox.candidate_task_converted', resourceId: id, status: 'recorded',
        reason: `Calon tugas dikonversi menjadi tiket lokal ${mission.id}; tidak ada pekerjaan yang dijalankan otomatis.`,
        policyVersion: null, payloadHash: existing.sourceVersion,
      });
    }
    return { candidate: updated, mission, created };
  }

  private async get(id: string): Promise<CandidateTask> {
    const candidate = await this.dependencies.repository.getCandidateTask(id);
    if (!candidate) throw new CandidateTaskError('not_found', 'Calon tugas tidak ditemukan.');
    return candidate;
  }

  private statusReason(candidate: CandidateTask, action: string): string {
    if (candidate.scopeStatus === 'converted') return `Calon tugas ini sudah menjadi tiket lokal, jadi tidak dapat ${action} lagi.`;
    if (candidate.scopeStatus === 'rejected') return `Calon tugas ini sudah ditolak${candidate.scopeNote ? `: ${candidate.scopeNote}` : ''}.`;
    if (candidate.scopeStatus === 'confirmed') return 'Lingkup calon tugas sudah dikonfirmasi; lanjutkan dengan membuat tiket lokal.';
    return 'Konfirmasi lingkup calon tugas terlebih dahulu.';
  }
}
