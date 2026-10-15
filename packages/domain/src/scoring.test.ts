import { describe, expect, it } from 'vitest';
import { scoreProject } from './scoring.js';
import type { ProjectOpportunity } from './types.js';

const project: ProjectOpportunity = {
  id: 'p-1', title: 'TypeScript API', description: 'Build an API with TypeScript.', clientName: 'Acme',
  budgetMin: 200, budgetMax: 700, currency: 'USD', skills: ['TypeScript', 'Backend Engineer'],
  deadlineDays: 10, briefQuality: 0.9, riskScore: 0.1, status: 'open', source: 'fixture', createdAt: '2026-10-14T00:00:00Z',
};

describe('scoreProject', () => {
  it('returns a bounded, explainable score using the selected specialties', () => {
    const result = scoreProject(project, ['Backend Engineer']);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.factors.map((factor) => factor.key)).toEqual(['skills', 'budget', 'deadline', 'brief', 'risk']);
    expect(result.score).toBeGreaterThan(70);
  });

  it('gives expired projects a zero score and clear reason', () => {
    const result = scoreProject({ ...project, status: 'expired' }, ['Backend Engineer']);

    expect(result.score).toBe(0);
    expect(result.factors.some((factor) => factor.key === 'availability' && factor.value === 'expired')).toBe(true);
  });

  it('does not invent a deadline when the source did not provide one', () => {
    const result = scoreProject({ ...project, deadlineDays: null }, ['Backend Engineer']);

    expect(result.factors.find((factor) => factor.key === 'deadline')).toMatchObject({ points: 0, value: 'belum dicantumkan' });
  });
});
