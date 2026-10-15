import { describe, expect, it } from 'vitest';
import { evaluatePolicy } from './policy.js';
import type { AutonomyPolicy, ProjectOpportunity } from './types.js';

const policy: AutonomyPolicy = {
  version: 2,
  state: 'active',
  expiresAt: '2027-01-01T00:00:00.000Z',
  allowedActions: ['bid.submit'],
  primaryField: 'Software Engineering',
  specializations: ['Backend Engineer'],
  keywords: ['api', 'typescript'],
  minimumConfidence: 0.78,
  minPrice: 100,
  maxPrice: 800,
  dailyBidLimit: 4,
  weeklyBidLimit: 12,
  timezone: 'Asia/Jakarta',
  activeHours: { start: 8, end: 19 },
  noNegotiationTerms: ['crypto gambling'],
  simulationOnly: true,
};

const project: ProjectOpportunity = {
  id: 'p-1',
  title: 'Build a TypeScript API',
  description: 'Create a small REST API for the internal product.',
  clientName: 'Acme Studio',
  budgetMin: 250,
  budgetMax: 600,
  currency: 'USD',
  skills: ['TypeScript', 'Backend Engineer'],
  deadlineDays: 14,
  briefQuality: 0.9,
  riskScore: 0.1,
  status: 'open',
  source: 'fixture',
  createdAt: '2026-10-14T00:00:00.000Z',
};

const context = {
  policy,
  project,
  action: 'bid.submit' as const,
  confidence: 0.91,
  proposedPrice: 420,
  dailyUsed: 1,
  weeklyUsed: 3,
  now: new Date('2026-10-14T04:00:00.000Z'),
  capability: 'unknown' as const,
};

describe('evaluatePolicy', () => {
  it('blocks every external write while its capability is unknown', () => {
    const result = evaluatePolicy(context);

    expect(result.allowed).toBe(false);
    expect(result.reasonCode).toBe('capability_unverified');
  });

  it('allows only a policy-valid simulated action', () => {
    const result = evaluatePolicy({ ...context, executionMode: 'simulated' });

    expect(result).toMatchObject({ allowed: true, reasonCode: 'allowed', simulationOnly: true });
  });

  it('blocks projects with no published deadline and explains the missing information', () => {
    const result = evaluatePolicy({ ...context, capability: 'supported', executionMode: 'simulated', project: { ...project, deadlineDays: null } });

    expect(result).toMatchObject({ allowed: false, reasonCode: 'deadline_unknown' });
    expect(result.reason).toContain('belum dicantumkan');
  });

  it('allows the autopilot to bid with an explicit delivery period when the client deadline is unpublished', () => {
    const result = evaluatePolicy({
      ...context,
      capability: 'supported',
      policy: { ...policy, allowUnknownDeadline: true, simulationOnly: false },
      executionMode: 'external',
      project: { ...project, deadlineDays: null },
    });

    expect(result).toMatchObject({ allowed: true, reasonCode: 'allowed', simulationOnly: false });
  });

  it('fails closed when paused, expired, over budget, or outside active hours', () => {
    expect(evaluatePolicy({ ...context, capability: 'supported', policy: { ...policy, state: 'paused' } }).reasonCode).toBe('policy_paused');
    expect(evaluatePolicy({ ...context, capability: 'supported', policy: { ...policy, expiresAt: '2026-10-13T00:00:00.000Z' } }).reasonCode).toBe('policy_expired');
    expect(evaluatePolicy({ ...context, capability: 'supported', proposedPrice: 900 }).reasonCode).toBe('price_out_of_range');
    expect(evaluatePolicy({ ...context, capability: 'supported', now: new Date('2026-10-14T16:00:00.000Z') }).reasonCode).toBe('outside_active_hours');
  });

  it('enforces confidence, scope, risk, and frequency caps', () => {
    expect(evaluatePolicy({ ...context, capability: 'supported', confidence: 0.5 }).reasonCode).toBe('confidence_too_low');
    expect(evaluatePolicy({ ...context, capability: 'supported', project: { ...project, skills: ['Graphic Design'] } }).reasonCode).toBe('specialization_mismatch');
    expect(evaluatePolicy({ ...context, capability: 'supported', project: { ...project, riskScore: 0.9 } }).reasonCode).toBe('risk_too_high');
    expect(evaluatePolicy({ ...context, capability: 'supported', dailyUsed: 4 }).reasonCode).toBe('daily_limit_reached');
    expect(evaluatePolicy({ ...context, capability: 'supported', project: { ...project, title: 'Crypto gambling API' } }).reasonCode).toBe('non_negotiable_match');
  });
});
