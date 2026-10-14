import { existsSync, readFileSync } from 'node:fs';

export type CredentialStatus = {
  freelancerAccessTokenConfigured: boolean;
  linkedinClientConfigured: boolean;
};

const dpapiPrefix = '01000000d08c9ddf';

function isDpapiCiphertext(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(dpapiPrefix);
}

export function readCredentialStatus(storePath: string, platform = process.platform): CredentialStatus {
  if (!existsSync(storePath)) {
    return { freelancerAccessTokenConfigured: false, linkedinClientConfigured: false };
  }
  if (platform !== 'win32') return { freelancerAccessTokenConfigured: false, linkedinClientConfigured: false };

  try {
    const store = JSON.parse(readFileSync(storePath, 'utf8')) as Record<string, unknown>;
    if (store.version !== 1) throw new Error('Credential store version is unsupported.');
    return {
      freelancerAccessTokenConfigured: isDpapiCiphertext(store.freelancerAccessToken),
      linkedinClientConfigured: isDpapiCiphertext(store.linkedinClientId) && isDpapiCiphertext(store.linkedinClientSecret),
    };
  } catch {
    throw new Error('Could not read encrypted local credential status.');
  }
}
