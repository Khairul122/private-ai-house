import { describe, expect, it } from 'vitest';
import { WorkspaceRepository } from '@fvh/persistence';
import { createApp } from './app.js';

describe('MVP smoke flow', () => {
  it('runs profile setup → policy activation → fixture draft → simulated send → audit → pause', async () => {
    const repository = new WorkspaceRepository();
    const app = createApp({ repository, clock: () => new Date('2026-10-14T04:00:00.000Z') });
    await app.ready();
    try {
      const profile = await app.inject({ method: 'PUT', url: '/api/profile', payload: {
        primaryField: 'Software Engineering', specializations: ['Backend Engineer'], language: 'id', currency: 'USD', timezone: 'Asia/Jakarta', minPrice: 100, maxPrice: 800, facts: [],
      } });
      const policy = await app.inject({ method: 'PUT', url: '/api/policy', payload: {
        allowedActions: ['bid.submit'], keywords: ['typescript'], minimumConfidence: 0.5, minPrice: 100, maxPrice: 800,
        dailyBidLimit: 3, weeklyBidLimit: 10, timezone: 'Asia/Jakarta', activeHours: { start: 8, end: 19 }, noNegotiationTerms: [],
      } });
      const activation = await app.inject({ method: 'POST', url: '/api/policy/activate', payload: { confirmSimulation: true } });
      const project = await app.inject({ method: 'GET', url: '/api/projects?search=inventori' });
      const draft = await app.inject({ method: 'POST', url: '/api/projects/demo-project-01/draft' });
      const simulation = await app.inject({ method: 'POST', url: '/api/projects/demo-project-01/simulate-submit' });
      repository.setPipelineStatus('demo-project-01', 'scored');
      await app.inject({ method: 'GET', url: '/api/projects' });
      const pipeline = await app.inject({ method: 'GET', url: '/api/pipeline' });
      const activity = await app.inject({ method: 'GET', url: '/api/activity?limit=10' });
      const pause = await app.inject({ method: 'POST', url: '/api/policy/pause' });

      expect(profile.statusCode).toBe(200);
      expect(policy.statusCode).toBe(200);
      expect(activation.json().externalWrites).toBe(false);
      expect(project.json()).toHaveLength(1);
      expect(draft.json().status).toBe('draft_ready');
      expect(simulation.json().decision.allowed).toBe(true);
      expect(pipeline.json().find((item: { id: string }) => item.id === 'demo-project-01')).toMatchObject({ pipelineStatus: 'draft_ready', latestDraft: { status: 'draft_ready' } });
      expect(activity.json().some((event: { type: string; payloadHash: string | null }) => event.type === 'bid.simulated' && event.payloadHash?.length === 64)).toBe(true);
      expect(pause.json().state).toBe('paused');
      expect(repository.listProjects().find((item) => item.id === 'demo-project-01')?.pipelineStatus).toBe('draft_ready');
    } finally {
      await app.close();
      repository.close();
    }
  });
});
