import { createHash } from 'node:crypto';
import { prepareKnowledgeFile } from '@fvh/knowledge';
import type { WorkspaceRepository } from '@fvh/persistence';
import { z } from 'zod';

const profileSchema = z.object({ sub: z.string().min(1).max(300), name: z.string().max(500).optional(), given_name: z.string().max(300).optional(), family_name: z.string().max(300).optional(), picture: z.string().url().startsWith('https://').optional(), locale: z.union([z.string().max(100), z.object({ country: z.string().max(100), language: z.string().max(100) })]).optional(), email: z.string().email().max(320).optional(), email_verified: z.boolean().optional() });
export type LinkedInApiProfile = z.infer<typeof profileSchema>;

export async function readLinkedInProfile(accessToken: string, fetcher: typeof fetch = fetch): Promise<LinkedInApiProfile> {
  const response = await fetcher('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`LinkedIn API userinfo merespons HTTP ${response.status}.`);
  const payload: unknown = await response.json();
  const parsed = profileSchema.safeParse(payload);
  if (!parsed.success) throw new Error('LinkedIn API userinfo mengembalikan data tidak valid.');
  return parsed.data;
}

export async function syncLinkedInProfile(repository: WorkspaceRepository, profile: LinkedInApiProfile, now = new Date()): Promise<{ sourceId: string; chunks: number }> {
  const sourceId = `linkedin:${createHash('sha256').update(profile.sub).digest('hex').slice(0, 32)}`;
  const content = JSON.stringify({ provider: 'linkedin', endpoint: 'https://api.linkedin.com/v2/userinfo', fetchedAt: now.toISOString(), profile }, null, 2);
  const prepared = prepareKnowledgeFile({ sourceId, provider: 'linkedin', label: 'LinkedIn API userinfo', referenceUrl: 'https://api.linkedin.com/v2/userinfo', sourceRef: `api:userinfo:${profile.sub}`, updatedAt: now.toISOString(), path: 'userinfo.json', content });
  if (!prepared.ok) throw new Error(`Data LinkedIn ditolak: ${prepared.reason}`);
  await repository.replaceKnowledgeSource({ id: sourceId, provider: 'linkedin', label: 'LinkedIn API userinfo', referenceUrl: 'https://api.linkedin.com/v2/userinfo', updatedAt: now.toISOString() }, prepared.chunks);
  await repository.appendAudit({ type: 'knowledge.linkedin_sync', resourceId: sourceId, status: 'recorded', reason: 'Profil ringan diperbarui dari LinkedIn API /userinfo. Riwayat kerja dan skill tidak disediakan oleh izin OIDC.', policyVersion: (await repository.getPolicy()).version, payloadHash: null });
  return { sourceId, chunks: prepared.chunks.length };
}
