import { describe, expect, it } from 'vitest';
import { bidOutcome } from './bid-outcome.js';

describe('bidOutcome', () => {
  it.each([
    ['awarded', false, 'won'],
    ['rejected', false, 'lost'],
    [null, true, 'lost'],
    ['awarded', true, 'lost'],
    [null, false, 'pending'],
    ['pending', false, 'pending'],
    ['Accepted', false, 'won'],
    ['revoked', false, 'lost'],
    ['cancelled', false, 'lost'],
    ['something_new', false, 'pending'],
  ] as const)('maps award status %s and retracted %s to %s', (status, retracted, expected) => {
    expect(bidOutcome(status, retracted)).toBe(expected);
  });
});
