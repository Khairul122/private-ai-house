import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import type { LinkedInClientCredentials } from './credential-store.js';

export type LinkedInEnvironmentCredentials = {
  declared: boolean;
  credentials: LinkedInClientCredentials | null;
};

export function parseLinkedInEnvironment(content: string): LinkedInEnvironmentCredentials {
  let values: Record<string, string | undefined>;
  try {
    values = parseEnv(content);
  } catch {
    return { declared: true, credentials: null };
  }

  const hasClientId = Object.hasOwn(values, 'FVH_LINKEDIN_CLIENT_ID');
  const hasClientSecret = Object.hasOwn(values, 'FVH_LINKEDIN_CLIENT_SECRET');
  if (!hasClientId && !hasClientSecret) return { declared: false, credentials: null };

  const clientId = values.FVH_LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = values.FVH_LINKEDIN_CLIENT_SECRET?.trim();
  if (!clientId || clientId.length < 3 || clientId.length > 512 || !clientSecret || clientSecret.length < 8 || clientSecret.length > 1024) {
    return { declared: true, credentials: null };
  }

  return { declared: true, credentials: { clientId, clientSecret } };
}

export function readLinkedInEnvironment(projectRoot: string): LinkedInEnvironmentCredentials {
  const envPath = join(projectRoot, '.env');
  if (!existsSync(envPath)) return { declared: false, credentials: null };
  try {
    return parseLinkedInEnvironment(readFileSync(envPath, 'utf8'));
  } catch {
    return { declared: true, credentials: null };
  }
}
