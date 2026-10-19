import { z } from 'zod';
import type { FreelancerSandboxWriteOperation, FreelancerWriteOperation } from '@fvh/adapter-freelancer';
import type { AiDraftingPort } from '@fvh/application';
import type { WorkspaceRepository } from '@fvh/persistence';
import type { AppOptions } from '../app.js';
import type { CredentialStatus, FreelancerVerification } from '../lib/credential-store.js';

export const paramsSchema = z.object({ id: z.string().min(1).max(150) });
export const allowedDevOrigins = new Set(['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:5174', 'http://localhost:5174']);

export type FreelancerSandboxWriteCheck = { statusCode: number | null; checkedAt: string; resultId?: string; resultStatus?: string };
export type FreelancerProductionWriteCheck = FreelancerSandboxWriteCheck;

/** State shared by several controllers. createApp builds exactly one per app instance. */
export type AppContext = {
  options: AppOptions;
  repository: WorkspaceRepository;
  now: () => Date;
  drafting: AiDraftingPort;
  draftingMode: 'disabled' | 'fixture' | 'hermes';
  state: { draftsInProgress: number; freelancerVerification: FreelancerVerification | null };
  freelancerSandboxWriteChecks: Map<FreelancerSandboxWriteOperation, FreelancerSandboxWriteCheck>;
  freelancerProductionWriteChecks: Map<FreelancerWriteOperation, FreelancerProductionWriteCheck>;
  refreshProductionWriteChecks: () => Promise<void>;
  threadProjectIds: () => Promise<Set<string>>;
};

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): { value: T } | { issues: string[] } {
  const result = schema.safeParse(body);
  return result.success ? { value: result.data } : { issues: result.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`) };
}

export function linkedinVerification(credentialStatus: CredentialStatus | undefined, now: Date) {
  if (!credentialStatus?.linkedinAccessTokenConfigured) return { authorized: false, verificationStatus: 'unverified' as const };
  const expiresAt = credentialStatus.linkedinAccessTokenExpiresAt;
  if (!expiresAt) return { authorized: false, verificationStatus: 'unverified' as const };
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) return { authorized: false, verificationStatus: 'unverified' as const };
  if (expiry <= now.getTime()) return { authorized: false, verificationStatus: 'expired' as const };
  return { authorized: true, verificationStatus: 'connected' as const };
}
