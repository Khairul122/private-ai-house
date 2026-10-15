import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

export type CredentialStatus = {
  freelancerAccessTokenConfigured: boolean;
  linkedinClientConfigured: boolean;
  linkedinAccessTokenConfigured: boolean;
  linkedinAccessTokenExpiresAt: string | null;
};

export type FreelancerVerification = {
  connected: boolean;
  readProfile: boolean;
  readProjects: boolean;
  readPortfolio?: boolean;
  readMessages?: boolean;
  profileError?: string;
  projectsError?: string;
  portfolioError?: string;
  messagesError?: string;
  reason: 'verified' | 'invalid_token' | 'scope_denied' | 'rate_limited' | 'project_scope_denied' | 'projects_unavailable' | 'verification_unavailable' | 'invalid_response' | 'profile_unavailable';
};

export type LinkedInClientCredentials = { clientId: string; clientSecret: string };

const dpapiPrefix = '01000000d08c9ddf';

function isDpapiCiphertext(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(dpapiPrefix);
}

export function readCredentialStatus(storePath: string, platform = process.platform): CredentialStatus {
  if (!existsSync(storePath)) {
    return { freelancerAccessTokenConfigured: false, linkedinClientConfigured: false, linkedinAccessTokenConfigured: false, linkedinAccessTokenExpiresAt: null };
  }
  if (platform !== 'win32') return { freelancerAccessTokenConfigured: false, linkedinClientConfigured: false, linkedinAccessTokenConfigured: false, linkedinAccessTokenExpiresAt: null };

  try {
    const serializedStore = readFileSync(storePath, 'utf8').replace(/^\uFEFF/, '');
    const store = JSON.parse(serializedStore) as Record<string, unknown>;
    if (store.version !== 1) throw new Error('Credential store version is unsupported.');
    return {
      freelancerAccessTokenConfigured: isDpapiCiphertext(store.freelancerAccessToken),
      linkedinClientConfigured: isDpapiCiphertext(store.linkedinClientId) && isDpapiCiphertext(store.linkedinClientSecret),
      linkedinAccessTokenConfigured: isDpapiCiphertext(store.linkedinAccessToken),
      linkedinAccessTokenExpiresAt: typeof store.linkedinAccessTokenExpiresAt === 'string' ? store.linkedinAccessTokenExpiresAt : null,
    };
  } catch {
    return { freelancerAccessTokenConfigured: false, linkedinClientConfigured: false, linkedinAccessTokenConfigured: false, linkedinAccessTokenExpiresAt: null };
  }
}

function runCredentialAction(action: string, storePath: string, scriptPath: string, input = ''): Promise<string> {
  if (process.platform !== 'win32') return Promise.reject(new Error('Windows credential store is unavailable.'));
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FVH_POWERSHELL_BIN ?? 'pwsh.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
      '-Action', action, '-StorePath', storePath,
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(stdout.trim());
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error('Secure credential operation timed out.'));
    }, 30_000);
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 1_000_000) {
        child.kill();
        finish(new Error('Secure credential operation returned too much data.'));
      }
    });
    child.on('error', () => finish(new Error('Secure credential operation failed.')));
    child.on('close', (code) => {
      if (code !== 0) finish(new Error('Secure credential operation failed.'));
      else finish();
    });
    child.stdin.end(input);
  });
}

export async function verifyFreelancerCredential(storePath: string, scriptPath: string): Promise<FreelancerVerification> {
  try {
    const output = await runCredentialAction('VerifyFreelancer', storePath, scriptPath);
    const result = JSON.parse(output) as Partial<FreelancerVerification>;
    const reasons = new Set<FreelancerVerification['reason']>([
      'verified', 'invalid_token', 'scope_denied', 'rate_limited', 'project_scope_denied',
      'projects_unavailable', 'verification_unavailable', 'invalid_response', 'profile_unavailable',
    ]);
    if (typeof result.connected !== 'boolean' || typeof result.readProfile !== 'boolean' || typeof result.readProjects !== 'boolean' || !result.reason || !reasons.has(result.reason)) {
      throw new Error('Invalid verification response.');
    }
    return { connected: result.connected, readProfile: result.readProfile, readProjects: result.readProjects, reason: result.reason };
  } catch {
    return { connected: false, readProfile: false, readProjects: false, reason: 'verification_unavailable' };
  }
}

export async function getLinkedInClientCredentials(storePath: string, scriptPath: string): Promise<LinkedInClientCredentials> {
  const output = await runCredentialAction('GetLinkedInClientCredentials', storePath, scriptPath);
  const credentials: unknown = JSON.parse(output);
  if (typeof credentials !== 'object' || credentials === null || !('clientId' in credentials) || !('clientSecret' in credentials)) {
    throw new Error('LinkedIn app is not configured.');
  }
  const { clientId, clientSecret } = credentials;
  if (typeof clientId !== 'string' || clientId.length < 3 || clientId.length > 512 || typeof clientSecret !== 'string' || clientSecret.length < 8 || clientSecret.length > 1024) {
    throw new Error('LinkedIn app is not configured.');
  }
  return { clientId, clientSecret };
}

export async function getFreelancerAccessToken(storePath: string, scriptPath: string): Promise<string> {
  const token = await runCredentialAction('GetFreelancerAccessToken', storePath, scriptPath);
  if (token.length < 16 || token.length > 4096 || /[\0\r\n]/.test(token)) {
    throw new Error('Freelancer token is not configured in the secure store.');
  }
  return token;
}

export async function storeLinkedInAccessToken(storePath: string, scriptPath: string, accessToken: string, expiresAt: string): Promise<void> {
  if (accessToken.length < 100 || accessToken.length > 3000 || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) {
    throw new Error('LinkedIn authorization response is invalid.');
  }
  const output = await runCredentialAction('StoreLinkedInAccessToken', storePath, scriptPath, JSON.stringify({ accessToken, expiresAt }));
  if (JSON.parse(output)?.stored !== true) throw new Error('LinkedIn token could not be stored securely.');
}

export async function deleteLinkedInAccessToken(storePath: string, scriptPath: string): Promise<void> {
  const output = await runCredentialAction('DeleteLinkedInAccessToken', storePath, scriptPath);
  if (JSON.parse(output)?.removed !== true) throw new Error('LinkedIn token could not be removed.');
}
