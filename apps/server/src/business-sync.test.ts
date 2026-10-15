import { describe, expect, it } from 'vitest';
import { WorkspaceRepository } from '@fvh/persistence';
import { BusinessSync } from './business-sync.js';

function repositoryWithBid() {
  const repository = new WorkspaceRepository();
  repository.syncFreelancerProjects([{
    id: 'freelancer:71', title: 'API', description: 'Build API', clientName: 'Client', budgetMin: 100, budgetMax: 200,
    currency: 'USD', projectType: 'fixed', skills: ['Python'], deadlineDays: 7, briefQuality: 1, riskScore: 0,
    status: 'open', source: 'freelancer', createdAt: '2026-10-16T10:00:00.000Z',
  }]);
  repository.recordSubmittedBid({ projectId: 'freelancer:71', bidId: '9001', amount: 150, currency: 'USD', submittedAt: '2026-10-16T10:00:00.000Z' });
  return repository;
}

describe('BusinessSync', () => {
  it('marks won bids, creates the active client project once, and keeps unknown statuses pending', async () => {
    const repository = repositoryWithBid();
    let awardStatus = 'something_new';
    const sync = new BusinessSync({ repository, readOwnBids: async (bidIds) => {
      expect(bidIds).toEqual(['9001']);
      return [{ bidId: '9001', projectId: '71', awardStatus, retracted: false }];
    } });

    await sync.syncOutcomes();
    expect(repository.listBidOutcomes()[0]).toMatchObject({ outcome: 'pending', awardStatus: 'something_new' });

    awardStatus = 'awarded';
    await sync.syncOutcomes();
    await sync.syncOutcomes();
    expect(repository.listProjects()[0]?.pipelineStatus).toBe('won');
    expect(repository.listBidOutcomes()[0]).toMatchObject({ outcome: 'won', awardStatus: 'awarded' });
    expect(repository.listClientProjects()).toEqual([expect.objectContaining({ title: 'API', source: 'freelancer', value: 150, status: 'active' })]);
    expect(sync.getStatus()).toMatchObject({ step: null, outcomes: { ok: true, error: null } });
    repository.close();
  });

  it('stores latest client threads and reports read failures without throwing', async () => {
    const repository = repositoryWithBid();
    let fail = false;
    const sync = new BusinessSync({
      repository, readOwnBids: async () => [], readSelfId: async () => '7',
      readThreads: async () => {
        if (fail) throw new Error('HTTP 429 token=abc');
        return [{ threadId: 501, projectId: '71', messageId: 1, senderId: '42', message: 'Halo, bisa mulai besok?', createdAt: '2026-10-16T11:00:00.000Z' }];
      },
    });

    await sync.runAll();
    expect(repository.listClientThreads()).toEqual([expect.objectContaining({ threadId: '501', projectId: '71', lastSenderId: '42' })]);
    expect(sync.getStatus().messages).toMatchObject({ ok: true, threads: 1, selfId: '7' });

    fail = true;
    await sync.runAll();
    expect(sync.getStatus()).toMatchObject({ step: null, messages: { ok: false, error: 'HTTP 429 [redacted]' } });
    repository.close();
  });
});
