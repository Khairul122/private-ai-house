import { describe, expect, it } from 'vitest';
import { parseFreelancerEnvironment } from './freelancer-env.js';

describe('parseFreelancerEnvironment', () => {
  it('reads the server-only Freelancer token from an env file', () => {
    expect(parseFreelancerEnvironment('FVH_FREELANCER_ACCESS_TOKEN=mock-freelancer-token-123456\nGITHUB_TOKEN=unrelated')).toEqual({
      declared: true,
      token: 'mock-freelancer-token-123456',
    });
  });

  it('prefers the inherited server environment when both sources declare a token', () => {
    expect(parseFreelancerEnvironment('FVH_FREELANCER_ACCESS_TOKEN=file-token-123456789', { FVH_FREELANCER_ACCESS_TOKEN: 'process-token-123456' })).toEqual({
      declared: true,
      token: 'process-token-123456',
    });
  });

  it('marks an explicitly empty or malformed token as unusable', () => {
    expect(parseFreelancerEnvironment('FVH_FREELANCER_ACCESS_TOKEN=')).toEqual({ declared: true, token: null });
    expect(parseFreelancerEnvironment('FVH_FREELANCER_ACCESS_TOKEN=short')).toEqual({ declared: true, token: null });
  });

  it('leaves the encrypted credential store as fallback when no env key is declared', () => {
    expect(parseFreelancerEnvironment('FVH_PORT=3001\nGITHUB_TOKEN=unrelated')).toEqual({ declared: false, token: null });
  });
});
