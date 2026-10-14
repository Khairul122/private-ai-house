import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { LinkedInClientCredentials } from './credential-store.js';

type LinkedInOAuthOptions = {
  getClientCredentials: () => Promise<LinkedInClientCredentials>;
  redirectUri: string;
  storeAccessToken: (accessToken: string, expiresAt: string) => Promise<void>;
  fetcher?: typeof fetch;
};

type PendingFlow = {
  credentials: LinkedInClientCredentials;
  state: string;
  redirectUri: string;
  returnUrl: string;
  expiresAt: number;
  timer: NodeJS.Timeout;
  handling: boolean;
};

export type LinkedInCallbackResult = {
  statusCode: number;
  title: string;
  message: string;
  returnUrl: string;
};

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isLoopback(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]';
}

function validateRedirectUri(redirectUri: string): string {
  const url = new URL(redirectUri);
  if (url.protocol !== 'http:' || !isLoopback(url.hostname) || url.pathname !== '/api/linkedin/callback' || url.username || url.password || url.search || url.hash) {
    throw new Error('LinkedIn callback must be the fixed local callback URL.');
  }
  return url.toString();
}

export function validateLinkedInCallback(returnedState: string, expectedState: string, expiresAt: number, now = Date.now()): 'invalid_state' | 'expired' | 'valid' {
  if (!safeEqual(returnedState, expectedState)) return 'invalid_state';
  return now > expiresAt ? 'expired' : 'valid';
}

export function buildLinkedInAuthorizationUrl(input: { clientId: string; redirectUri: string; state: string }): string {
  const authorization = new URL('https://www.linkedin.com/oauth/v2/authorization');
  authorization.search = new URLSearchParams({
    response_type: 'code',
    client_id: input.clientId,
    redirect_uri: validateRedirectUri(input.redirectUri),
    state: input.state,
    scope: 'openid profile',
  }).toString();
  return authorization.toString();
}

export async function completeLinkedInAuthorization(input: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetcher: typeof fetch;
  storeAccessToken: (accessToken: string, expiresAt: string) => Promise<void>;
  now?: () => number;
}): Promise<void> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: validateRedirectUri(input.redirectUri),
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });
  const tokenResponse = await input.fetcher('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  if (!tokenResponse.ok) throw new Error('LinkedIn token exchange failed.');
  const tokenPayload: unknown = await tokenResponse.json();
  if (typeof tokenPayload !== 'object' || tokenPayload === null || !('access_token' in tokenPayload) || !('expires_in' in tokenPayload)) {
    throw new Error('LinkedIn token response was invalid.');
  }
  const accessToken = tokenPayload.access_token;
  const expiresIn = tokenPayload.expires_in;
  if (typeof accessToken !== 'string' || accessToken.length < 100 || accessToken.length > 3000 || typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 31_536_000) {
    throw new Error('LinkedIn token response was invalid.');
  }
  const profileResponse = await input.fetcher('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!profileResponse.ok) throw new Error('LinkedIn profile verification failed.');
  const profile: unknown = await profileResponse.json();
  if (typeof profile !== 'object' || profile === null || !('sub' in profile) || typeof profile.sub !== 'string' || profile.sub.length === 0) {
    throw new Error('LinkedIn profile verification failed.');
  }
  const now = input.now ?? Date.now;
  const expiresAt = new Date(now() + expiresIn * 1000).toISOString();
  await input.storeAccessToken(accessToken, expiresAt);
}

export class LinkedInOAuthService {
  private pending: PendingFlow | null = null;
  private readonly fetcher: typeof fetch;
  readonly redirectUri: string;

  constructor(private readonly options: LinkedInOAuthOptions) {
    this.fetcher = options.fetcher ?? fetch;
    this.redirectUri = validateRedirectUri(options.redirectUri);
  }

  async start(returnUrl: string): Promise<{ authorizationUrl: string }> {
    if (this.pending?.handling) throw new Error('LinkedIn authorization callback is being processed.');
    const returnTarget = new URL(returnUrl);
    const allowedReturnHost = isLoopback(returnTarget.hostname);
    if (!allowedReturnHost || returnTarget.protocol !== 'http:' || returnTarget.pathname !== '/capabilities' || returnTarget.username || returnTarget.password) {
      throw new Error('LinkedIn return address is not allowed.');
    }
    if (this.pending) this.finish(this.pending);
    const credentials = await this.options.getClientCredentials();
    const state = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const flowRef: { current?: PendingFlow } = {};
    const timer = setTimeout(() => {
      if (flowRef.current) this.finish(flowRef.current);
    }, 10 * 60 * 1000);
    timer.unref();
    const flow: PendingFlow = { credentials, state, redirectUri: this.redirectUri, returnUrl: returnTarget.toString(), expiresAt, timer, handling: false };
    flowRef.current = flow;
    this.pending = flow;

    try {
      return { authorizationUrl: buildLinkedInAuthorizationUrl({ clientId: credentials.clientId, redirectUri: flow.redirectUri, state }) };
    } catch (error) {
      this.finish(flow);
      throw error;
    }
  }

  async handleCallback(input: { state?: string; code?: string; error?: string }): Promise<LinkedInCallbackResult> {
    const flow = this.pending;
    if (!flow) return { statusCode: 410, title: 'Alur OAuth tidak ditemukan', message: 'Mulai koneksi LinkedIn kembali dari dashboard.', returnUrl: 'http://127.0.0.1:5173/capabilities' };
    const callbackState = validateLinkedInCallback(input.state ?? '', flow.state, flow.expiresAt);
    if (callbackState === 'invalid_state') return { statusCode: 401, title: 'Otorisasi tidak valid', message: 'Pemeriksaan keamanan OAuth gagal. Mulai koneksi lagi dari dashboard.', returnUrl: flow.returnUrl };
    if (callbackState === 'expired') {
      this.finish(flow);
      return { statusCode: 410, title: 'Permintaan kedaluwarsa', message: 'Waktu untuk menyelesaikan koneksi LinkedIn telah habis.', returnUrl: flow.returnUrl };
    }
    if (flow.handling) return { statusCode: 409, title: 'Permintaan sudah diproses', message: 'Callback ini sudah diterima.', returnUrl: flow.returnUrl };
    flow.handling = true;
    if (input.error || !input.code || input.code.length > 4096) {
      this.finish(flow);
      return { statusCode: 400, title: 'LinkedIn belum terhubung', message: 'Persetujuan dibatalkan atau aplikasi LinkedIn belum memiliki akses yang diperlukan.', returnUrl: flow.returnUrl };
    }

    try {
      await completeLinkedInAuthorization({
        clientId: flow.credentials.clientId,
        clientSecret: flow.credentials.clientSecret,
        code: input.code,
        redirectUri: flow.redirectUri,
        fetcher: this.fetcher,
        storeAccessToken: this.options.storeAccessToken,
      });
      return { statusCode: 200, title: 'LinkedIn terhubung', message: 'Akses profil ringan berhasil diverifikasi dan disimpan terenkripsi di perangkat ini.', returnUrl: flow.returnUrl };
    } catch {
      return { statusCode: 502, title: 'LinkedIn belum terhubung', message: 'LinkedIn tidak dapat menyelesaikan otorisasi. Periksa izin aplikasi lalu mulai koneksi lagi.', returnUrl: flow.returnUrl };
    } finally {
      this.finish(flow);
    }
  }

  close() {
    if (this.pending) this.finish(this.pending);
  }

  private finish(flow: PendingFlow) {
    if (this.pending !== flow) return;
    this.pending = null;
    clearTimeout(flow.timer);
  }
}
