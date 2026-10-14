import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildLinkedInAuthorizationUrl, completeLinkedInAuthorization, LinkedInOAuthService, validateLinkedInCallback } from './linkedin-oauth.js';

const redirectUri = 'http://localhost:3001/api/linkedin/callback';

describe('LinkedIn authorization code connection', () => {
  it('builds an OIDC authorization URL without PKCE or secrets in the URL', () => {
    const state = randomBytes(32).toString('base64url');
    const authorizationUrl = new URL(buildLinkedInAuthorizationUrl({ clientId: 'client-id-for-test', redirectUri, state }));

    expect(authorizationUrl.origin).toBe('https://www.linkedin.com');
    expect(authorizationUrl.pathname).toBe('/oauth/v2/authorization');
    expect(authorizationUrl.searchParams.get('scope')).toBe('openid profile');
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(authorizationUrl.searchParams.get('state')).toBe(state);
    expect(authorizationUrl.searchParams.has('client_secret')).toBe(false);
    expect(authorizationUrl.searchParams.has('code_challenge')).toBe(false);
  });

  it('rejects a mismatched or expired callback state', () => {
    expect(validateLinkedInCallback('wrong', 'expected-state', 5_000, 1_000)).toBe('invalid_state');
    expect(validateLinkedInCallback('expected-state', 'expected-state', 5_000, 6_000)).toBe('expired');
    expect(validateLinkedInCallback('expected-state', 'expected-state', 5_000, 4_000)).toBe('valid');
  });

  it('exchanges the authorization code with the stored client secret and verifies only userinfo', async () => {
    const generatedToken = randomBytes(128).toString('base64url');
    let saved = false;
    let savedExpiry = '';
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://www.linkedin.com/oauth/v2/accessToken') {
        const body = new URLSearchParams(String(init?.body));
        expect(body.get('grant_type')).toBe('authorization_code');
        expect(body.get('client_id')).toBe('client-id-for-test');
        expect(body.get('client_secret')).toBe('test-secret');
        expect(body.get('redirect_uri')).toBe(redirectUri);
        expect(body.has('code_verifier')).toBe(false);
        return new Response(JSON.stringify({ access_token: generatedToken, expires_in: 3600 }), { status: 200 });
      }
      expect(url).toBe('https://api.linkedin.com/v2/userinfo');
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${generatedToken}`);
      return new Response(JSON.stringify({ sub: 'member-id' }), { status: 200 });
    });
    const storeAccessToken = vi.fn(async (token: string, expiresAt: string) => { saved = token.length >= 100; savedExpiry = expiresAt; });

    await completeLinkedInAuthorization({
      clientId: 'client-id-for-test',
      clientSecret: 'test-secret',
      code: 'temporary-authorization-code',
      redirectUri,
      fetcher,
      storeAccessToken,
      now: () => Date.parse('2026-10-14T00:00:00.000Z'),
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(saved).toBe(true);
    expect(savedExpiry).toBe('2026-10-14T01:00:00.000Z');
    expect(storeAccessToken).toHaveBeenCalledTimes(1);
  });

  it('requires matching state before accepting LinkedIn callback data', async () => {
    const generatedToken = randomBytes(128).toString('base64url');
    const fetcher = vi.fn(async (input: string | URL | Request) => String(input) === 'https://www.linkedin.com/oauth/v2/accessToken'
      ? new Response(JSON.stringify({ access_token: generatedToken, expires_in: 3600 }), { status: 200 })
      : new Response(JSON.stringify({ sub: 'member-id' }), { status: 200 }));
    const storeAccessToken = vi.fn(async () => {});
    const service = new LinkedInOAuthService({
      getClientCredentials: async () => ({ clientId: 'client-id-for-test', clientSecret: 'test-secret' }),
      redirectUri,
      storeAccessToken,
      fetcher,
    });
    const { authorizationUrl } = await service.start('http://127.0.0.1:5173/capabilities');
    const state = new URL(authorizationUrl).searchParams.get('state') ?? '';

    const invalid = await service.handleCallback({ state: 'wrong', code: 'one-time-code' });
    expect(invalid.statusCode).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();

    const valid = await service.handleCallback({ state, code: 'one-time-code' });
    expect(valid.statusCode).toBe(200);
    expect(storeAccessToken).toHaveBeenCalledOnce();
    expect(await service.handleCallback({ state, code: 'one-time-code' })).toMatchObject({ statusCode: 410 });
    service.close();
  });

  it('replaces an abandoned authorization flow when the user retries', async () => {
    const service = new LinkedInOAuthService({
      getClientCredentials: async () => ({ clientId: 'client-id-for-test', clientSecret: 'test-secret' }),
      redirectUri,
      storeAccessToken: async () => {},
    });
    const first = await service.start('http://127.0.0.1:5173/capabilities');
    const firstState = new URL(first.authorizationUrl).searchParams.get('state') ?? '';

    const second = await service.start('http://127.0.0.1:5173/capabilities');
    const secondState = new URL(second.authorizationUrl).searchParams.get('state') ?? '';

    expect(secondState).not.toBe(firstState);
    expect(await service.handleCallback({ state: firstState, code: 'stale-code' })).toMatchObject({ statusCode: 401 });
    expect(await service.handleCallback({ state: secondState, error: 'access_denied' })).toMatchObject({ statusCode: 400 });
    service.close();
  });
});
