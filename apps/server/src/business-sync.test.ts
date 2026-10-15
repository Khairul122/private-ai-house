import { describe, expect, it } from 'vitest';
import { WorkspaceRepository } from '@fvh/persistence';
import { BusinessSync } from './business-sync.js';

describe('BusinessSync', () => {
  it('syncs pending outcomes by Freelancer bid ID', async () => {
    const repository = new WorkspaceRepository();
    repository.syncFreelancerProjects([{
      id: 'freelancer:71', title: 'API', description: 'Build API', clientName: 'Client', budgetMin: 100, budgetMax: 200,
      currency: 'USD', projectType: 'fixed', skills: ['Python'], deadlineDays: 7, briefQuality: 1, riskScore: 0,
      status: 'open', source: 'freelancer', createdAt: '2026-10-16T10:00:00.000Z',
    }]);
    repository.recordSubmittedBid({ projectId: 'freelancer:71', bidId: '9001', amount: 150, currency: 'USD', submittedAt: '2026-10-16T10:00:00.000Z' });
    const sync = new BusinessSync({ repository, readOwnBids: async (bidIds) => {
      expect(bidIds).toEqual(['9001']);
      return [{ bidId: '9001', projectId: '71', awardStatus: 'awarded', retracted: false }];
    } });

    await sync.syncOutcomes();

    expect(repository.listProjects()[0]?.pipelineStatus).toBe('won');
    expect(repository.listBidOutcomes()[0]).toMatchObject({ outcome: 'won', awardStatus: 'awarded', checkedAt: expect.any(String) });
    expect(sync.getStatus()).toMatchObject({ state: 'idle', outcomes: { state: 'idle', checked: 1, error: null }, step: null });
    repository.close();
  });
});
