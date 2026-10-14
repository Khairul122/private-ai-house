import { describe, expect, it } from 'vitest';
import { transitionPipeline } from './pipeline.js';

describe('pipeline state transitions', () => {
  it('advances a draft through a policy check', () => {
    expect(transitionPipeline('draft_ready', 'policy_check')).toEqual({ ok: true, status: 'policy_check' });
  });

  it('never calls a local simulation an externally submitted bid', () => {
    expect(transitionPipeline('draft_ready', 'submitted')).toMatchObject({ ok: false, reason: 'marketplace_confirmation_required' });
    expect(transitionPipeline('policy_check', 'submitted', { marketplaceConfirmed: true })).toEqual({ ok: true, status: 'submitted' });
  });

  it('rejects impossible transitions', () => {
    expect(transitionPipeline('won', 'new')).toMatchObject({ ok: false, reason: 'transition_not_allowed' });
  });
});
