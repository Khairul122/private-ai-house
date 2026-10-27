import { messageMissionSourceId } from './message-intel.js';
import type { MessageClassification, MessageRequirement } from './message-intel.js';

export const CANDIDATE_CONTRACT_VERSION = 'inbox-candidate-v1';

export type CandidateScopeStatus = 'needs_confirmation' | 'confirmed' | 'rejected' | 'converted';

/** A criterion is the client's own request, kept together with the quote that proves it. */
export type CandidateAcceptanceCriterion = { id: string; text: string; quote: string };

/**
 * The owner-reviewable step between one analysed message and one local mission.
 * `origin` is fixed: nothing but a stored, verified analysis can produce a candidate.
 */
export type CandidateTask = {
  id: string;
  sourceVersion: string;
  clientProjectId: string;
  projectTitle: string;
  classification: MessageClassification;
  title: string;
  objective: string;
  requirements: MessageRequirement[];
  acceptanceCriteria: CandidateAcceptanceCriterion[];
  questions: string[];
  /** Mission ids this candidate waits on. Informational only: no scheduling edge is created. */
  dependencies: string[];
  scopeStatus: CandidateScopeStatus;
  scopeNote: string | null;
  analysisMissionId: string | null;
  convertedMissionId: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  convertedAt: string | null;
};

const TITLE_LABEL: Record<MessageClassification, string> = {
  feature: 'Permintaan fitur',
  bug: 'Laporan masalah',
  question: 'Pertanyaan klien',
  scope_change: 'Perubahan lingkup',
  unknown: 'Tindak lanjut klien',
};

/** Deterministic: the title comes from the classification and the linked project, never from free model text. */
export function candidateTitle(classification: MessageClassification, projectTitle: string): string {
  const title = `${TITLE_LABEL[classification]}: ${projectTitle.trim() || 'proyek tanpa judul'}`;
  return title.length <= 200 ? title : `${title.slice(0, 197)}...`;
}

/**
 * The analysis lists what the client asked for; the criterion restates that ask so it can be checked.
 * It stays a proposal: only the owner can accept or rewrite it.
 */
export function acceptanceCriteriaFor(requirements: MessageRequirement[]): CandidateAcceptanceCriterion[] {
  return requirements.map((requirement) => ({
    id: requirement.id,
    text: `Kebutuhan klien terpenuhi: ${requirement.text}`,
    quote: requirement.quote,
  }));
}

/** Duplicate ids would make a dependency list lie about how many blockers exist. */
export function dedupeDependencies(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))];
}

/** One candidate mission per message version; the missions table is unique on (source, source_id). */
export function candidateMissionSourceId(sourceVersion: string): string {
  return messageMissionSourceId('candidate', sourceVersion);
}

export function canConfirmCandidate(status: CandidateScopeStatus): boolean {
  return status === 'needs_confirmation';
}

export function canRejectCandidate(status: CandidateScopeStatus): boolean {
  return status === 'needs_confirmation' || status === 'confirmed';
}

export function canConvertCandidate(status: CandidateScopeStatus): boolean {
  return status === 'confirmed';
}

export function buildCandidateTask(input: {
  id: string;
  sourceVersion: string;
  clientProjectId: string;
  projectTitle: string;
  classification: MessageClassification;
  summary: string | null;
  requirements: MessageRequirement[];
  questions: string[];
  analysisMissionId: string | null;
  now: string;
}): CandidateTask {
  return {
    id: input.id,
    sourceVersion: input.sourceVersion,
    clientProjectId: input.clientProjectId,
    projectTitle: input.projectTitle,
    classification: input.classification,
    title: candidateTitle(input.classification, input.projectTitle),
    objective: input.summary?.trim() || 'Tidak ada ringkasan analisis tersimpan; periksa kutipan klien.',
    requirements: input.requirements,
    acceptanceCriteria: acceptanceCriteriaFor(input.requirements),
    questions: input.questions,
    dependencies: dedupeDependencies([input.analysisMissionId]),
    scopeStatus: 'needs_confirmation',
    scopeNote: null,
    analysisMissionId: input.analysisMissionId,
    convertedMissionId: null,
    createdAt: input.now,
    updatedAt: input.now,
    confirmedAt: null,
    convertedAt: null,
  };
}
