export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'Permintaan gagal. Coba lagi.';
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export function jsonRequest(method: 'POST' | 'PUT', value?: unknown): RequestInit {
  return { method, ...(value === undefined ? {} : { body: JSON.stringify(value) }) };
}

export type Profile = {
  primaryField: string;
  specializations: string[];
  language: string;
  currency: string;
  timezone: string;
  minPrice: number;
  maxPrice: number;
  facts: Array<{ label: string; value: string; source: string }>;
};

export type Policy = {
  version: number;
  state: 'draft' | 'active' | 'paused';
  expiresAt: string;
  allowedActions: string[];
  primaryField: string;
  specializations: string[];
  keywords: string[];
  minimumConfidence: number;
  minPrice: number;
  maxPrice: number;
  dailyBidLimit: number;
  weeklyBidLimit: number;
  timezone: string;
  activeHours: { start: number; end: number };
  noNegotiationTerms: string[];
  simulationOnly: boolean;
};

export type Opportunity = {
  id: string;
  title: string;
  description: string;
  clientName: string;
  budgetMin: number;
  budgetMax: number;
  currency: string;
  projectType?: 'fixed' | 'hourly' | 'unknown';
  skills: string[];
  deadlineDays: number | null;
  briefQuality: number;
  riskScore: number;
  status: 'open' | 'closed' | 'expired';
  source: 'fixture' | 'freelancer';
  pipelineStatus: string;
  score: number;
  factors: Array<{ key: string; label: string; points: number; value: string }>;
};

export type Capabilities = {
  marketplace: Array<{ operation: string; status: string; evidence: string; productionVerification?: { statusCode: number | null; checkedAt: string; resultId?: string; resultStatus?: string }; sandboxVerification?: { statusCode: number | null; checkedAt: string; resultId?: string; resultStatus?: string } }>;
  freelancerCredentials: { accessTokenConfigured: boolean; productionWriteConfigured: boolean; sandboxWriteTestConfigured: boolean; verificationStatus: string; readProfile: boolean; readProjects: boolean; readPortfolio: boolean; readMessages: boolean };
  github: { read: string; verificationStatus: string; scope: string; tokenConfigured: boolean };
  linkedin: { read: string; reason: string; redirectUri: string | null; clientConfigured: boolean; authorized: boolean; verificationStatus: string; accessTokenExpiresAt: string | null };
  hermes: { draft: string; active: boolean; reason: string };
};

export type FreelancerSandboxWriteInput =
  | { operation: 'submit_bid'; projectId: number; amount: number; period: number; milestonePercentage: number; description: string }
  | { operation: 'edit_profile'; jobIds: number[] }
  | { operation: 'send_message'; threadId: number; message: string };

export type FreelancerProductionWriteInput = FreelancerSandboxWriteInput & { confirmLive: true };

export type BidDraft = {
  id: string;
  projectId: string;
  proposal: string;
  proposedPrice: number;
  currency: string;
  durationDays: number;
  confidence: number;
  evidence: Array<{ label: string; source: string }>;
  assumptions: string[];
  status: 'draft_ready';
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  type: string;
  resourceId: string;
  status: 'allowed' | 'blocked' | 'recorded' | 'failed';
  reason: string;
  policyVersion: number | null;
  payloadHash: string | null;
  createdAt: string;
};

export type Autopilot = {
  state: 'starting' | 'running' | 'paused' | 'blocked' | 'error';
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastMessage: string;
  lastImported: number;
  lastSubmitted: number;
  specializations: string[];
};
