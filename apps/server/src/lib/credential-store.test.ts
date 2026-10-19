import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readCredentialStatus } from './credential-store.js';

const directories: string[] = [];

function createStore(contents: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), 'fvh-credentials-'));
  directories.push(directory);
  const path = join(directory, 'credentials.dpapi.json');
  writeFileSync(path, `\uFEFF${JSON.stringify(contents)}`, 'utf8');
  return path;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('encrypted credential status', () => {
  it('defaults to unconfigured when no local store exists', async () => {
    expect(readCredentialStatus(join(tmpdir(), 'fvh-missing-credentials.dpapi.json'), 'win32')).toEqual({
      freelancerAccessTokenConfigured: false,
      linkedinClientConfigured: false,
      linkedinAccessTokenConfigured: false,
      linkedinAccessTokenExpiresAt: null,
    });
  });

  it('returns only booleans for DPAPI ciphertext fields', async () => {
    const path = createStore({
      version: 1,
      freelancerAccessToken: '01000000d08c9ddf-ciphertext',
      linkedinClientId: '01000000d08c9ddf-ciphertext',
      linkedinClientSecret: '01000000d08c9ddf-ciphertext',
    });

    expect(readCredentialStatus(path, 'win32')).toEqual({
      freelancerAccessTokenConfigured: true,
      linkedinClientConfigured: true,
      linkedinAccessTokenConfigured: false,
      linkedinAccessTokenExpiresAt: null,
    });
  });

  it('does not report Windows-encrypted credentials as usable on another platform', async () => {
    const path = createStore({
      version: 1,
      freelancerAccessToken: '01000000d08c9ddf-ciphertext',
      linkedinClientId: '01000000d08c9ddf-ciphertext',
      linkedinClientSecret: '01000000d08c9ddf-ciphertext',
    });

    expect(readCredentialStatus(path, 'linux')).toEqual({
      freelancerAccessTokenConfigured: false,
      linkedinClientConfigured: false,
      linkedinAccessTokenConfigured: false,
      linkedinAccessTokenExpiresAt: null,
    });
  });

  it('reports a locally encrypted LinkedIn member token and its expiry without exposing it', async () => {
    const path = createStore({
      version: 1,
      linkedinAccessToken: '01000000d08c9ddf-encrypted-token',
      linkedinAccessTokenExpiresAt: '2026-10-15T00:00:00.000Z',
    });

    expect(readCredentialStatus(path, 'win32')).toMatchObject({
      linkedinAccessTokenConfigured: true,
      linkedinAccessTokenExpiresAt: '2026-10-15T00:00:00.000Z',
    });
  });

  it('treats a malformed local store as unconfigured without preventing server startup', async () => {
    const path = createStore({ version: 1, freelancerAccessToken: 'not encrypted' });
    writeFileSync(path, '{ invalid json', 'utf8');

    expect(readCredentialStatus(path, 'win32')).toEqual({
      freelancerAccessTokenConfigured: false,
      linkedinClientConfigured: false,
      linkedinAccessTokenConfigured: false,
      linkedinAccessTokenExpiresAt: null,
    });
  });
});
