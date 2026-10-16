import { describe, expect, it } from 'vitest';
import { parseLinkedInEnvironment } from './linkedin-env.js';

describe('parseLinkedInEnvironment', () => {
  it('reads only the LinkedIn credentials from an environment file', async () => {
    expect(parseLinkedInEnvironment('FVH_LINKEDIN_CLIENT_ID=client-id\nFVH_LINKEDIN_CLIENT_SECRET=client-secret\nGITHUB_TOKEN=unrelated')).toEqual({
      declared: true,
      credentials: { clientId: 'client-id', clientSecret: 'client-secret' },
    });
  });

  it('marks a partial or invalid LinkedIn configuration as declared but unusable', async () => {
    expect(parseLinkedInEnvironment('FVH_LINKEDIN_CLIENT_ID=client-id')).toEqual({ declared: true, credentials: null });
    expect(parseLinkedInEnvironment('FVH_LINKEDIN_CLIENT_ID=\nFVH_LINKEDIN_CLIENT_SECRET=')).toEqual({ declared: true, credentials: null });
  });

  it('leaves DPAPI credentials as the fallback when no LinkedIn keys are present', async () => {
    expect(parseLinkedInEnvironment('FVH_PORT=3001\nGITHUB_TOKEN=unrelated')).toEqual({ declared: false, credentials: null });
  });
});
