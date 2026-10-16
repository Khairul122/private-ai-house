import { createHash } from 'node:crypto';
import { prepareKnowledgeFile } from '@fvh/knowledge';
import type { WorkspaceRepository } from '@fvh/persistence';

export type LinkedInApiProfile = {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string | { country: string; language: string };
  email?: string;
  email_verified?: boolean;
};

function isProfile(value: unknown): value is LinkedInApiProfile {
  return typeof value === 'object' && value !== null && typeof (value as { sub?: unknown }).sub === 'string' && (value as { sub: string }).sub.length > 0;
}

export async function readLinkedInProfile(accessToken: string, fetcher: typeof fetch = fetch): Promise<LinkedInApiProfile> {
  const response = await fetcher('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`LinkedIn API userinfo merespons HTTP ${response.status}.`);
  const payload: unknown = await response.json();
  if (!isProfile(payload)) throw new Error('LinkedIn API userinfo mengembalikan data tidak valid.');
  return payload;
}

export async function syncLinkedInProfile(repository: WorkspaceRepository, profile: LinkedInApiProfile, now = new Date()): Promise<{ sourceId: string; chunks: number }> {
  const sourceId = `linkedin:${createHash('sha256').update(profile.sub).digest('hex').slice(0, 32)}`;
  const content = JSON.stringify({ provider: 'linkedin', endpoint: 'https://api.linkedin.com/v2/userinfo', fetchedAt: now.toISOString(), profile }, null, 2);
  const prepared = prepareKnowledgeFile({ sourceId, provider: 'linkedin', label: 'LinkedIn API userinfo', referenceUrl: 'https://api.linkedin.com/v2/userinfo', sourceRef: `api:userinfo:${profile.sub}`, updatedAt: now.toISOString(), path: 'userinfo.json', content });
  if (!prepared.ok) throw new Error(`Data LinkedIn ditolak: ${prepared.reason}`);
  await repository.replaceKnowledgeSource({ id: sourceId, provider: 'linkedin', label: 'LinkedIn API userinfo', referenceUrl: 'https://api.linkedin.com/v2/userinfo', updatedAt: now.toISOString() }, prepared.chunks);
  return { sourceId, chunks: prepared.chunks.length };
}
