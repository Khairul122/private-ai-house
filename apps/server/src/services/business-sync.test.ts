import { describe, expect, it } from 'vitest';
import { FreelancerPartialReadError, FreelancerReadError, type FreelancerLatestMessage } from '@fvh/adapter-freelancer';
import { WorkspaceRepository } from '@fvh/persistence';
import type { ThreadReadOptions } from './business-sync.js';
import { BusinessSync } from './business-sync.js';

async function repositoryWithBid() {
  const repository = await WorkspaceRepository.open();
  await repository.syncFreelancerProjects([{
    id: 'freelancer:71', title: 'API', description: 'Build API', clientName: 'Client', budgetMin: 100, budgetMax: 200,
    currency: 'USD', projectType: 'fixed', skills: ['Python'], deadlineDays: 7, briefQuality: 1, riskScore: 0,
    status: 'open', source: 'freelancer', createdAt: '2026-10-16T10:00:00.000Z',
  }]);
  await repository.recordSubmittedBid({ projectId: 'freelancer:71', bidId: '9001', amount: 150, currency: 'USD', submittedAt: '2026-10-16T10:00:00.000Z' });
  return repository;
}

describe('BusinessSync', () => {
  it('marks won bids, creates the active client project once, and keeps unknown statuses pending', async () => {
    const repository = await repositoryWithBid();
    let awardStatus = 'something_new';
    const sync = new BusinessSync({ repository, readOwnBids: async (bidIds) => {
      expect(bidIds).toEqual(['9001']);
      return [{ bidId: '9001', projectId: '71', awardStatus, retracted: false }];
    } });

    await sync.syncOutcomes();
    expect((await repository.listBidOutcomes())[0]).toMatchObject({ outcome: 'pending', awardStatus: 'something_new' });

    awardStatus = 'awarded';
    await sync.syncOutcomes();
    await sync.syncOutcomes();
    expect((await repository.listProjects())[0]?.pipelineStatus).toBe('won');
    expect((await repository.listBidOutcomes())[0]).toMatchObject({ outcome: 'won', awardStatus: 'awarded' });
    expect(await repository.listClientProjects()).toEqual([expect.objectContaining({ title: 'API', source: 'freelancer', value: 150, status: 'active' })]);
    expect(sync.getStatus()).toMatchObject({ step: null, outcomes: { ok: true, error: null } });
    await repository.close();
  });

  it('stores latest client threads and reports read failures without throwing', async () => {
    const repository = await repositoryWithBid();
    let fail = false;
    const sync = new BusinessSync({
      repository, readOwnBids: async () => [], readSelfId: async () => '7',
      readThreads: async () => {
        if (fail) throw new Error('HTTP 429 token=abc');
        return [{ threadId: 501, projectId: '71', messageId: 1, senderId: '42', message: 'Halo, bisa mulai besok?', createdAt: '2026-10-16T11:00:00.000Z' }];
      },
    });

    await sync.tick();
    expect(await repository.listClientThreads()).toEqual([expect.objectContaining({ threadId: '501', projectId: '71', lastSenderId: '42' })]);
    expect(sync.getStatus().messages).toMatchObject({ ok: true, threads: 1, selfId: '7' });

    fail = true;
    await sync.syncMessages('incremental');
    expect(sync.getStatus()).toMatchObject({ step: null, messages: { ok: false, error: 'HTTP 429 [redacted]' } });
    await repository.close();
  });

  const message = (threadId: number, threadUpdated: number): FreelancerLatestMessage => ({
    threadId, projectId: '40123456', messageId: threadId * 10, senderId: '31001', message: `Pesan ${threadId}`,
    createdAt: new Date(threadUpdated * 1_000).toISOString(), threadUpdated,
  });

  it('reads messages incrementally every minute and does a full sweep every 30 minutes', async () => {
    const repository = await WorkspaceRepository.open();
    const t0 = Date.parse('2026-10-20T01:00:00.000Z');
    let clock = t0;
    const calls: ThreadReadOptions[] = [];
    const readOwnBids = async () => [];
    const sync = new BusinessSync({
      repository, readOwnBids, now: () => new Date(clock), readSelfId: async () => '7', readRateLimit: () => null,
      readThreads: async (_selfId, options) => { calls.push({ ...options }); return [message(601, 1_760_000_000)]; },
    });

    await sync.tick();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.fromUpdatedTime).toBeUndefined();
    expect(sync.getStatus().messages).toMatchObject({ ok: true, mode: 'full', threads: 1, lastFullAt: new Date(t0).toISOString() });

    clock = t0 + 59_000;
    await sync.tick();
    expect(calls).toHaveLength(1);

    clock = t0 + 60_000;
    await sync.tick();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ fromUpdatedTime: Math.floor(t0 / 1_000) - 120 });
    expect(calls[1]!.known.get(601)).toBe(1_760_000_000);
    // Unchanged thread is not rewritten.
    expect(sync.getStatus().messages).toMatchObject({ ok: true, mode: 'incremental', threads: 0 });

    clock = t0 + 30 * 60_000;
    await sync.tick();
    expect(calls).toHaveLength(3);
    expect(calls[2]!.fromUpdatedTime).toBeUndefined();
    expect(sync.getStatus().messages.mode).toBe('full');
    expect(await repository.listClientThreads()).toHaveLength(1);
    await repository.close();
  });

  it('keeps threads read before a 429 and backs off the message job until a success', async () => {
    const repository = await WorkspaceRepository.open();
    const t0 = Date.parse('2026-10-20T01:00:00.000Z');
    let clock = t0;
    let limited = true;
    let reads = 0;
    const sync = new BusinessSync({
      repository, readOwnBids: async () => [], now: () => new Date(clock), readSelfId: async () => '7', readRateLimit: () => null,
      readThreads: async () => {
        reads += 1;
        if (limited) throw new FreelancerPartialReadError(new FreelancerReadError('rate_limited', 'Freelancer membatasi permintaan.', 429), [message(601, 1_760_000_000)]);
        return [message(602, 1_760_000_100)];
      },
    });

    await sync.tick();
    expect((await repository.listClientThreads()).map((thread) => thread.threadId)).toEqual(['601']);
    expect(sync.getStatus()).toMatchObject({ backoff: { messages: 2 }, messages: { ok: false, error: 'Freelancer membatasi permintaan. (1 thread tersimpan sebelum berhenti)' } });

    clock = t0 + 60_000;
    await sync.tick();
    expect(reads).toBe(1);
    clock = t0 + 120_000;
    await sync.tick();
    expect(reads).toBe(2);
    expect(sync.getStatus().backoff.messages).toBe(4);
    for (let step = 0; step < 5; step += 1) await sync.syncMessages('full');
    expect(sync.getStatus().backoff.messages).toBe(8);

    limited = false;
    clock = t0 + 60 * 60_000;
    await sync.tick();
    expect(sync.getStatus()).toMatchObject({ backoff: { messages: 1 }, messages: { ok: true, mode: 'full' } });
    await repository.close();
  });

  it('checks bid outcomes every 5 minutes and doubles that interval after a 429', async () => {
    const repository = await repositoryWithBid();
    const t0 = Date.parse('2026-10-20T01:00:00.000Z');
    let clock = t0;
    let limited = false;
    let reads = 0;
    const sync = new BusinessSync({ repository, now: () => new Date(clock), readRateLimit: () => null, readOwnBids: async () => {
      reads += 1;
      if (limited) throw new FreelancerReadError('rate_limited', 'Freelancer membatasi permintaan.', 429);
      return [];
    } });

    await sync.tick();
    clock = t0 + 4 * 60_000;
    await sync.tick();
    expect(reads).toBe(1);
    limited = true;
    clock = t0 + 5 * 60_000;
    await sync.tick();
    expect(reads).toBe(2);
    expect(sync.getStatus()).toMatchObject({ backoff: { outcomes: 2 }, outcomes: { ok: false } });
    clock = t0 + 14 * 60_000;
    await sync.tick();
    expect(reads).toBe(2);
    clock = t0 + 15 * 60_000;
    await sync.tick();
    expect(reads).toBe(3);
    await repository.close();
  });
});
