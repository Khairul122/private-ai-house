export type BidOutcome = 'pending' | 'won' | 'lost';

export function bidOutcome(awardStatus: string | null, retracted: boolean): BidOutcome {
  if (retracted || awardStatus === 'rejected') return 'lost';
  if (awardStatus === 'awarded') return 'won';
  return 'pending';
}
