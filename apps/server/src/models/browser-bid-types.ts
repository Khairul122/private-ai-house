export type BrowserBidMode = 'api' | 'api-fallback' | 'browser';
export type BrowserBidInput = { operation: 'submit_bid'; projectId: number; amount: number; period: number; milestonePercentage: number; description: string };
export type BrowserIdentity = { id: string; username: string };
export type BrowserObservation = { username: string | null; remaining: number | null; pageStatus: number | null; checkedAt: string; challenge: boolean };
export type BrowserBidStatus = {
  mode: BrowserBidMode;
  state: 'stopped' | 'opening' | 'login_required' | 'challenge' | 'account_mismatch' | 'ready' | 'quota_exhausted' | 'checking' | 'submitting' | 'error';
  busy: boolean; reason: string; username: string | null; remaining: number | null;
  checkedAt: string | null; pageStatus: number | null; lastRunAt: string | null;
  lastResult: { projectId: number; statusCode: number | null; bidId: string | null; outcome: 'submitted' | 'blocked' | 'uncertain'; at: string } | null;
};
export class BrowserBidError extends Error {
  constructor(public readonly code: string, message: string, public readonly uncertain = false, public readonly statusCode?: number) { super(message); this.name = 'BrowserBidError'; }
}
export function readRemainingBids(text: string): number | null {
  const matches = [...text.matchAll(/^\s*(\d+)\s+(?:penawaran tersisa dari|bids? left out of|bids? remaining (?:out )?of)\s+\d+\s*$/gmi)].map(m => Number(m[1]));
  return matches.length && new Set(matches).size === 1 ? matches[0]! : null;
}
export function isBidEndpoint(url: string, origin = 'https://www.freelancer.com'): boolean {
  const value = new URL(url);
  return value.origin === origin && /^\/(?:api\/)?projects\/0\.1\/bids\/?$/.test(value.pathname);
}
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function matchesBrowserBid(value: unknown, input: BrowserBidInput, identity: BrowserIdentity): boolean {
  if (!record(value)) return false;
  const upgrades = ['highlighted', 'sponsored', 'sealed', 'upgrade', 'is_highlighted', 'is_sponsored', 'is_sealed'];
  const keys = ['project_id', 'bidder_id', 'amount', 'period', 'milestone_percentage', 'description', ...upgrades];
  if (Object.keys(value).some(key => !keys.includes(key)) || upgrades.some(k => value[k] !== undefined && value[k] !== false && value[k] !== 0)) return false;
  return Number(value.project_id) === input.projectId && String(value.bidder_id) === identity.id && Number(value.amount) === input.amount && Number(value.period) === input.period && Number(value.milestone_percentage) === input.milestonePercentage && value.description === input.description;
}
export function confirmedBrowserBid(payload: unknown, input: BrowserBidInput, identity: BrowserIdentity): string | null {
  if (!record(payload) || payload.status !== 'success' || !record(payload.result)) return null;
  const result = payload.result;
  return /^\d{1,30}$/.test(String(result.id)) && Number(result.project_id) === input.projectId && String(result.bidder_id) === identity.id && Number(result.amount) === input.amount && Number(result.period) === input.period ? String(result.id) : null;
}
