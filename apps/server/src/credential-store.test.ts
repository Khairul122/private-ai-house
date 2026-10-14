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
  writeFileSync(path, JSON.stringify(contents), 'utf8');
  return path;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('encrypted credential status', () => {
  it('defaults to unconfigured when no local store exists', () => {
    expect(readCredentialStatus(join(tmpdir(), 'fvh-missing-credentials.dpapi.json'), 'win32')).toEqual({
      freelancerAccessTokenConfigured: false,
      linkedinClientConfigured: false,
    });
  });

  it('returns only booleans for DPAPI ciphertext fields', () => {
    const path = createStore({
      version: 1,
      freelancerAccessToken: '01000000d08c9ddf-ciphertext',
      linkedinClientId: '01000000d08c9ddf-ciphertext',
      linkedinClientSecret: '01000000d08c9ddf-ciphertext',
    });

    expect(readCredentialStatus(path, 'win32')).toEqual({
      freelancerAccessTokenConfigured: true,
      linkedinClientConfigured: true,
    });
  });

  it('does not report Windows-encrypted credentials as usable on another platform', () => {
    const path = createStore({
      version: 1,
      freelancerAccessToken: '01000000d08c9ddf-ciphertext',
      linkedinClientId: '01000000d08c9ddf-ciphertext',
      linkedinClientSecret: '01000000d08c9ddf-ciphertext',
    });

    expect(readCredentialStatus(path, 'linux')).toEqual({
      freelancerAccessTokenConfigured: false,
      linkedinClientConfigured: false,
    });
  });
});
