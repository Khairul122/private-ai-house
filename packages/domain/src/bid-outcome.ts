export type BidOutcome = 'pending' | 'won' | 'lost';

// Unknown award_status values stay pending rather than being guessed.
export function bidOutcome(awardStatus: string | null, retracted: boolean): BidOutcome {
  const status = awardStatus?.toLowerCase() ?? null;
  if (retracted || (status && ['rejected', 'revoked', 'canceled', 'cancelled'].includes(status))) return 'lost';
  if (status && ['awarded', 'accepted'].includes(status)) return 'won';
  return 'pending';
}
