import { describe, expect, it } from 'vitest';
import { FreelancerWriteError } from '@fvh/adapter-freelancer';
import { canFallbackToBrowser } from '../services/browser-bidding.js';
import { confirmedBrowserBid, isBidEndpoint, matchesBrowserBid, readRemainingBids } from './browser-bid-types.js';
const input = { operation: 'submit_bid' as const, projectId: 71, amount: 100, period: 14, milestonePercentage: 100, description: 'Proposal fixture' };
const identity = { id: '42', username: 'owner-fixture' };
const body = { project_id: 71, bidder_id: 42, amount: 100, period: 14, milestone_percentage: 100, description: input.description };
describe('browser bid boundaries', () => {
  it('reads quota only from explicit dashboard counter lines, including zero', () => {
    expect(readRemainingBids('Test\n0 penawaran tersisa dari 100 \n')).toBe(0);
    expect(readRemainingBids('3 bids left out of 100')).toBe(3);
    expect(readRemainingBids('100 bids monthly')).toBeNull();
    expect(readRemainingBids('3 bids left out of 100\n0 bids left out of 100')).toBeNull();
  });
  it('accepts only the exact bidding endpoint on the configured origin', () => {
    expect(isBidEndpoint('https://www.freelancer.com/api/projects/0.1/bids/')).toBe(true);
    expect(isBidEndpoint('https://www.freelancer.com.evil.test/api/projects/0.1/bids/')).toBe(false);
    expect(isBidEndpoint('https://www.freelancer-sandbox.com/api/projects/0.1/bids/')).toBe(false);
    expect(isBidEndpoint('https://www.freelancer.com/api/projects/0.1/bids/71/')).toBe(false);
  });
  it('requires exact request identity, pricing, period, proposal and no upgrade', () => {
    expect(matchesBrowserBid(body, input, identity)).toBe(true);
    for (const patch of [{ bidder_id: 99 }, { project_id: 72 }, { amount: 101 }, { period: 15 }, { description: 'Changed' }, { sponsored: true }, { unknown_upgrade: true }]) expect(matchesBrowserBid({ ...body, ...patch }, input, identity)).toBe(false);
  });
  it('requires a numeric bid ID plus matching response facts', () => {
    const payload = { status: 'success', result: { ...body, id: 9123 } };
    expect(confirmedBrowserBid(payload, input, identity)).toBe('9123');
    expect(confirmedBrowserBid({ status: 'success' }, input, identity)).toBeNull();
    expect(confirmedBrowserBid({ ...payload, result: { ...payload.result, bidder_id: 99 } }, input, identity)).toBeNull();
  });
  it('falls back only after explicit API rejection and never for account quota or ambiguous outcomes', () => {
    expect(canFallbackToBrowser(new FreelancerWriteError(429, 'Rate limit'))).toBe(true);
    expect(canFallbackToBrowser(new FreelancerWriteError(403, 'Scope denied'))).toBe(true);
    for (const error of [new FreelancerWriteError(400, 'BID_LIMIT_EXCEEDED'), new FreelancerWriteError(429, 'BID_LIMIT_EXCEEDED'), new FreelancerWriteError(500, 'Unavailable'), new FreelancerWriteError(undefined, 'Timeout'), new Error('Timeout')]) expect(canFallbackToBrowser(error)).toBe(false);
  });
});
