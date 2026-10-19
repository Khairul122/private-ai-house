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
    const record = typeof body === 'object' && body !== null ? body as { error?: unknown; issues?: unknown } : {};
    const issues = Array.isArray(record.issues) ? record.issues.filter((issue): issue is string => typeof issue === 'string') : [];
    // Validation issues name the offending field; without them "tidak valid" gives the user nothing to fix.
    const message = typeof record.error === 'string'
      ? `${record.error}${issues.length ? ` ${issues.join('; ')}` : ''}`
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
  projectsCoId?: import('@fvh/domain').ProjectsCoIdSettings;
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
  allowUnknownDeadline?: boolean;
  activeDays?: number[];
  scanIntervalMinutes?: number;
  maxRiskScore?: number;
  requireSpecializationMatch?: boolean;
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
  source: 'fixture' | 'freelancer' | 'projects_co_id';
  createdAt?: string;
  closesAt?: string | null;
  pipelineStatus: string;
  score: number;
  factors: Array<{ key: string; label: string; points: number; value: string }>;
};

export type Capabilities = {
  marketplace: Array<{ operation: string; status: string; evidence: string; productionVerification?: { statusCode: number | null; checkedAt: string; resultId?: string; resultStatus?: string }; sandboxVerification?: { statusCode: number | null; checkedAt: string; resultId?: string; resultStatus?: string } }>;
  freelancerCredentials: { accessTokenConfigured: boolean; productionWriteConfigured: boolean; sandboxWriteTestConfigured: boolean; verificationStatus: string; readProfile: boolean; readProjects: boolean; readPortfolio: boolean; readMessages: boolean };
  github: { read: string; verificationStatus: string; scope: string; tokenConfigured: boolean };
  linkedin: { read: string; reason: string; redirectUri: string | null; clientConfigured: boolean; authorized: boolean; verificationStatus: string; accessTokenExpiresAt: string | null };
  hermes: { draft: string; active: boolean; reason: string; draftsInProgress?: number };
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
  author?: 'hermes' | 'template';
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

export type DashboardResponse = {
  mode: string;
  counts: { openProjects: number; drafts: number; submittedBids: number; policySkips: number; knowledgeSources: number };
  policy: { state: Policy['state']; version: number; simulationOnly: boolean };
  profileComplete: boolean;
  projects: Opportunity[];
  activity: AuditEvent[];
  externalWrites: boolean;
  bidUsage?: { today: number; week: number };
};

export type PipelineItem = Opportunity & { latestDraft: BidDraft | null };

type SyncRun = { lastRunAt: string | null; ok: boolean | null; error: string | null };

export type BusinessSyncStatus = {
  step: 'outcomes' | 'messages' | null;
  outcomes: SyncRun & { checked: number };
  messages: SyncRun & { threads: number; selfId: string | null };
};

export type Inbox = {
  sync: SyncRun | null;
  needsReply: Array<{ threadId: string; projectId: string | null; projectTitle: string | null; preview: string; lastMessageAt: string; waitingHours: number }>;
  followUps: Array<{ projectId: string; title: string; submittedAt: string; daysSinceBid: number }>;
};

export type ClientProject = {
  id: string; title: string; client: string; source: 'freelancer' | 'direct' | 'linkedin' | 'projects_co_id' | 'other'; externalProjectId: string | null;
  status: 'active' | 'delivered' | 'closed'; deadline: string | null; value: number | null; currency: string; createdAt: string; daysToDeadline: number | null;
};

export type Payment = {
  id: string; projectId: string; amount: number; currency: string; status: 'expected' | 'received';
  dueDate: string | null; receivedAt: string | null; note: string; createdAt: string;
};

export type Work = {
  projects: ClientProject[];
  payments: Payment[];
  income: { month: string; received: Array<{ currency: string; total: number; bySource: Record<string, number> }>; expected: Array<{ currency: string; total: number }> };
  dueSoon: number;
};

export type Insights = {
  outcomes: { submitted: number; won: number; lost: number; pending: number; withConversation: number; winRate: number | null };
  recent: Array<{ projectId: string; title: string | null; submittedAt: string; outcome: string; awardStatus: string | null; checkedAt: string | null }>;
  skips: { total: number; recent7d: number; reasons: Array<{ reason: string; total: number; recent: number }> };
  lastCheck: { at: string | null; ok: boolean | null; error: string | null };
};

export type Autopilot = {
  state: 'starting' | 'running' | 'paused' | 'blocked' | 'error';
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastMessage: string;
  lastImported: number;
  lastSubmitted: number;
  specializations: string[];
  cycleInProgress?: boolean;
  draftsInProgress?: number;
  intervalMinutes?: number;
  searchTerms?: string[];
  summary?: { considered: number; eligible: number; reasons: Record<string, number> } | null;
  waitingReason?: string | null;
  marketplaceNotice?: { at: string; quotaExhausted: boolean; reason: string; retryAt: string | null } | null;
};
