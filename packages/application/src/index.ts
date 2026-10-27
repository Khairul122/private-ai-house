import { createHash, randomUUID } from 'node:crypto';
import { evaluatePolicy, scoreProject } from '@fvh/domain';
import type { AutonomyPolicy, ProjectOpportunity } from '@fvh/domain';
export * from './drafting.js';
export * from './message-analysis.js';

export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function assessProject(project: ProjectOpportunity, specializations: string[]) {
  return scoreProject(project, specializations);
}

export function decideBid(input: {
  policy: AutonomyPolicy;
  project: ProjectOpportunity;
  confidence: number;
  proposedPrice: number;
  dailyUsed: number;
  weeklyUsed: number;
  now: Date;
}) {
  return evaluatePolicy({ ...input, action: 'bid.submit', capability: 'unknown', executionMode: 'simulated' });
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
