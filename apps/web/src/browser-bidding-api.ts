export type BrowserBiddingStatus = {
  mode: 'api' | 'api-fallback' | 'browser';
  state: 'stopped' | 'opening' | 'login_required' | 'challenge' | 'account_mismatch' | 'ready' | 'quota_exhausted' | 'checking' | 'submitting' | 'error';
  busy: boolean; reason: string; username: string | null; remaining: number | null;
  checkedAt: string | null; pageStatus: number | null; lastRunAt: string | null;
  lastResult: { projectId: number; statusCode: number | null; bidId: string | null; outcome: 'submitted' | 'blocked' | 'uncertain'; at: string } | null;
};
