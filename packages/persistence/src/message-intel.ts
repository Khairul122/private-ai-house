import { createHash } from 'node:crypto';

export const MESSAGE_CONTRACT_VERSION = 'inbox-analysis-v1';

export type MessageCompleteness = 'complete' | 'truncated' | 'unknown';
export type MessageLinkStatus = 'linked' | 'unlinked' | 'ambiguous';
export type MessageClassification = 'feature' | 'bug' | 'question' | 'scope_change' | 'unknown';
export type MessageAnalysisStatus = 'queued' | 'running' | 'succeeded' | 'blocked';

export type MessageSnapshot = {
  id: string;
  threadId: string;
  messageId: string;
  senderId: string;
  /** Freelancer project id from the thread context, not a local project id. */
  projectId: string | null;
  clientProjectId: string | null;
  linkStatus: MessageLinkStatus;
  body: string;
  completeness: MessageCompleteness;
  completenessReason: string | null;
  sourceVersion: string;
  capturedAt: string;
  syncedAt: string;
};

export type MessageRequirement = { id: string; text: string; quote: string };

export type MessageAnalysis = {
  analysisId: string;
  sourceVersion: string;
  contractVersion: string;
  status: MessageAnalysisStatus;
  classification: MessageClassification | null;
  summary: string | null;
  requirements: MessageRequirement[];
  questions: string[];
  replyDraft: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
};

/** Identity is the message identity plus its exact text, completeness and cut point — never the sync timestamp. */
export function messageSourceVersion(input: {
  threadId: string;
  messageId: string;
  body: string;
  completeness: MessageCompleteness;
  truncatedAt?: number | null;
}): string {
  return createHash('sha256')
    .update(JSON.stringify([input.threadId, input.messageId, input.body, input.completeness, input.truncatedAt ?? null]))
    .digest('hex');
}

/** One mission per stage and source version; `missions` is unique on (source, source_id). */
export function messageMissionSourceId(stage: 'analysis' | 'candidate', sourceVersion: string): string {
  const value = `inbox-${stage}:v1:${sourceVersion}`;
  if (value.length > 200) throw new Error('sourceId melebihi batas 200 karakter.');
  return value;
}

/** A message belongs to a client project only through one exact external id match; titles are never matched. */
export function resolveMessageLink(
  projectId: string | null,
  clientProjects: Array<{ id: string; source: string; externalProjectId: string | null }>,
): { clientProjectId: string | null; linkStatus: MessageLinkStatus } {
  if (!projectId) return { clientProjectId: null, linkStatus: 'unlinked' };
  const matches = clientProjects.filter((project) => project.source === 'freelancer' && project.externalProjectId === `freelancer:${projectId}`);
  if (matches.length === 0) return { clientProjectId: null, linkStatus: 'unlinked' };
  if (matches.length > 1) return { clientProjectId: null, linkStatus: 'ambiguous' };
  return { clientProjectId: matches[0]!.id, linkStatus: 'linked' };
}

const MONEY = /(?:\b(?:USD|IDR|SGD|EUR)\b\s?\d[\d.,]*|\bRp\s?\d[\d.,]*|\$\s?\d[\d.,]*|\b\d[\d.,]*\s?(?:USD|IDR|juta|ribu)\b)/gi;

/** Money-like tokens in model text, used to reject figures the source never mentioned. */
export function mentionedAmounts(text: string): string[] {
  return [...new Set((text.match(MONEY) ?? []).map((value) => value.replace(/\s+/g, ' ').trim().toLowerCase()))];
}

/** Requirements must quote the snapshot verbatim; anything else means the model invented evidence. */
export function quoteViolation(requirements: Array<{ quote: string }>, body: string): string | null {
  for (const requirement of requirements) {
    if (!requirement.quote.trim()) return 'Kutipan kebutuhan kosong.';
    if (!body.includes(requirement.quote)) return `Kutipan tidak ditemukan pada sumber: "${requirement.quote.slice(0, 80)}"`;
  }
  return null;
}

/** Draft must not introduce amounts the message never stated. Returns the offending tokens. */
export function inventedAmounts(output: { requirements: Array<{ text: string; quote: string }>; replyDraft: string }, body: string): string[] {
  const source = body.toLowerCase();
  const text = [...output.requirements.map((requirement) => requirement.text), output.replyDraft].join(' ');
  return mentionedAmounts(text).filter((amount) => !source.includes(amount));
}
