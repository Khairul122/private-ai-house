import type { PipelineStatus } from './types.js';

const transitions: Record<PipelineStatus, PipelineStatus[]> = {
  new: ['scored', 'draft_ready', 'in_conversation', 'won', 'lost', 'skipped', 'expired', 'error'],
  scored: ['draft_ready', 'skipped', 'expired', 'error'],
  draft_ready: ['policy_check', 'submitted', 'in_conversation', 'won', 'lost', 'skipped', 'error'],
  policy_check: ['submitted', 'skipped', 'reconciliation_required', 'error', 'draft_ready'],
  submitted: ['in_conversation', 'won', 'lost', 'reconciliation_required', 'error'],
  in_conversation: ['won', 'lost', 'reconciliation_required', 'error'],
  reconciliation_required: ['submitted', 'in_conversation', 'skipped', 'error'],
  won: [],
  lost: [],
  skipped: [],
  expired: [],
  error: [],
};

export function transitionPipeline(
  current: PipelineStatus,
  next: PipelineStatus,
  options: { marketplaceConfirmed?: boolean } = {},
): { ok: true; status: PipelineStatus } | { ok: false; reason: string } {
  if (next === 'submitted' && options.marketplaceConfirmed !== true) {
    return { ok: false, reason: 'marketplace_confirmation_required' };
  }
  if (!transitions[current].includes(next)) return { ok: false, reason: 'transition_not_allowed' };
  return { ok: true, status: next };
}
