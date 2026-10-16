import { describe, expect, it } from 'vitest';
import { parseFreelancerEnvironment } from './freelancer-env.js';

describe('parseFreelancerEnvironment', () => {
  it('reads the server-only Freelancer token from an env file', async () => {
    expect(parseFreelancerEnvironment('FVH_FREELANCER_ACCESS_TOKEN=mock-freelancer-token-123456\nGITHUB_TOKEN=unrelated')).toEqual({
      declared: true,
      token: 'mock-freelancer-token-123456',
      sandboxTokenDeclared: false,
      sandboxToken: null,
    });
  });

  it('prefers the inherited server environment when both sources declare a token', async () => {
    expect(parseFreelancerEnvironment('FVH_FREELANCER_ACCESS_TOKEN=file-token-123456789', { FVH_FREELANCER_ACCESS_TOKEN: 'process-token-123456' })).toEqual({
      declared: true,
      token: 'process-token-123456',
      sandboxTokenDeclared: false,
      sandboxToken: null,
    });
  });

  it('marks an explicitly empty or malformed token as unusable', async () => {
    expect(parseFreelancerEnvironment('FVH_FREELANCER_ACCESS_TOKEN=')).toEqual({ declared: true, token: null, sandboxTokenDeclared: false, sandboxToken: null });
    expect(parseFreelancerEnvironment('FVH_FREELANCER_ACCESS_TOKEN=short')).toEqual({ declared: true, token: null, sandboxTokenDeclared: false, sandboxToken: null });
  });

  it('keeps the sandbox token separate and rejects reuse of the production token', async () => {
    expect(parseFreelancerEnvironment('FVH_FREELANCER_SANDBOX_ACCESS_TOKEN=sandbox-token-12345678')).toMatchObject({
      sandboxTokenDeclared: true,
      sandboxToken: 'sandbox-token-12345678',
    });
    expect(parseFreelancerEnvironment('FVH_FREELANCER_ACCESS_TOKEN=production-token-12345678\nFVH_FREELANCER_SANDBOX_ACCESS_TOKEN=production-token-12345678')).toMatchObject({
      declared: true,
      sandboxTokenDeclared: true,
      sandboxToken: null,
    });
  });

  it('leaves the encrypted credential store as fallback when no env key is declared', async () => {
    expect(parseFreelancerEnvironment('FVH_PORT=3001\nGITHUB_TOKEN=unrelated')).toEqual({ declared: false, token: null, sandboxTokenDeclared: false, sandboxToken: null });
  });
});
