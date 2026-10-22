export type CapabilityStatus = 'supported' | 'unsupported' | 'unknown';

export type ProjectOpportunity = {
  id: string;
  title: string;
  description: string;
  clientName: string;
  clientCountry?: string | null;
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
  sourceSlug?: string | undefined;
  /** Listing close time as published by the source, when it gives an absolute date. */
  closesAt?: string | null | undefined;
  createdAt: string;
};

export type PipelineStatus =
  | 'new'
  | 'scored'
  | 'draft_ready'
  | 'policy_check'
  | 'submitted'
  | 'in_conversation'
  | 'won'
  | 'lost'
  | 'skipped'
  | 'expired'
  | 'reconciliation_required'
  | 'error';

export type ProjectsCoIdSettings = {
  username: string;
  minPrice: number;
  maxPrice: number;
  dailyBidLimit: number;
  weeklyBidLimit: number;
  mode: 'off' | 'scan-only' | 'drafts';
  /** Field ids from PROJECTS_CO_ID_FIELDS; their terms become listing searches. */
  fields: string[];
  keywords: string[];
  useProfileSkills: boolean;
  /** 0–100; replaces the Freelancer minimum confidence for projects.co.id drafts. */
  minimumScore: number;
};

// Owner's initial settings; existing workspaces persist these on the next policy save.
export const PROJECTS_CO_ID_DEFAULTS: ProjectsCoIdSettings = { username: 'KhairulHuda06', minPrice: 100_000, maxPrice: 10_000_000, dailyBidLimit: 4, weeklyBidLimit: 12, mode: 'scan-only', fields: [], keywords: [], useProfileSkills: true, minimumScore: 50 };

export type AutonomyPolicy = {
  projectsCoId?: ProjectsCoIdSettings | undefined;
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
  allowUnknownDeadline?: boolean | undefined;
  activeDays?: number[] | undefined;
  scanIntervalMinutes?: number | undefined;
  maxRiskScore?: number | undefined;
  requireSpecializationMatch?: boolean | undefined;
};

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
  /** Recorded since 19 Oct 2026; older drafts have no author. */
  author?: 'hermes' | 'template' | undefined;
};

export type AuditEvent = {
  id: string;
  type: string;
  resourceId: string;
  status: 'allowed' | 'blocked' | 'recorded' | 'failed' | 'uncertain';
  reason: string;
  policyVersion: number | null;
  payloadHash: string | null;
  createdAt: string;
};

export type PolicyDecision = {
  allowed: boolean;
  reasonCode: string;
  reason: string;
  policyVersion: number;
  simulationOnly: boolean;
};
