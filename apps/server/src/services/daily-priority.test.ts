import { describe, expect, it } from 'vitest';
import { WorkspaceRepository } from '@fvh/persistence';
import type { BusinessSync } from './business-sync.js';
import { DailyPriorityService } from './daily-priority.js';

const NOW = new Date('2026-10-27T02:00:00.000Z');

function fakeSync(selfId: string | null): BusinessSync {
  return {
    getStatus: () => ({
      step: null,
      outcomes: { lastRunAt: '2026-10-27T01:59:00.000Z', ok: true, error: null, checked: 0 },
      messages: { lastRunAt: '2026-10-27T01:59:00.000Z', ok: true, error: null, threads: 1, selfId, mode: 'incremental', lastFullAt: null },
      backoff: { outcomes: 1, messages: 1 }, rateLimit: null,
    }),
  } as unknown as BusinessSync;
}

async function seededRepository() {
  const repository = await WorkspaceRepository.open();
  const project = await repository.createClientProject({
    title: 'Situs klien', client: 'Klien A', source: 'freelancer', externalProjectId: 'freelancer:71',
    status: 'active', deadline: '2026-10-28', value: null, currency: 'USD',
  });
  await repository.createPayment({ projectId: project!.id, amount: 120, currency: 'USD', status: 'expected', dueDate: '2026-10-26', receivedAt: null, note: 'DP' });
  await repository.upsertClientThreads([{ threadId: '501', projectId: '71', lastSenderId: '42', lastMessageAt: '2026-10-25T00:00:00.000Z', preview: 'Halo', syncedAt: '2026-10-27T01:59:00.000Z' }]);
  return { repository, project: project! };
}

describe('DailyPriorityService', () => {
  it('ranks stored payments, waiting messages and deadlines for the WIB day', async () => {
    const { repository } = await seededRepository();
    const service = new DailyPriorityService({ repository, now: () => NOW, businessSync: fakeSync('7') });
    const summary = await service.current();
    expect(summary.day).toBe('2026-10-27');
    expect(summary.actions.map((action) => action.kind)).toEqual(['payment_due', 'message_waiting', 'project_deadline']);
    expect(summary.currencyTotals).toEqual([{ currency: 'USD', amount: 120, payments: 1 }]);
    expect(summary.sources.find((source) => source.name === 'Pembayaran')).toMatchObject({ status: 'ok' });
    await repository.close();
  });

  it('stores one summary per WIB day and only regenerates on explicit refresh', async () => {
    const { repository, project } = await seededRepository();
    const service = new DailyPriorityService({ repository, now: () => NOW, businessSync: fakeSync('7') });
    await service.current();
    await repository.createPayment({ projectId: project.id, amount: 80, currency: 'IDR', status: 'expected', dueDate: '2026-10-27', receivedAt: null, note: '' });
    const cached = await service.current();
    expect(cached.actions.filter((action) => action.kind === 'payment_due')).toHaveLength(1);
    const refreshed = await service.current({ regenerate: true });
    expect(refreshed.actions.filter((action) => action.kind === 'payment_due')).toHaveLength(2);
    expect(refreshed.currencyTotals).toEqual([
      { currency: 'IDR', amount: 80, payments: 1 },
      { currency: 'USD', amount: 120, payments: 1 },
    ]);
    expect(await repository.getDailyPriority('2026-10-27')).toMatchObject({ day: '2026-10-27' });
    await repository.close();
  });

  it('does not claim waiting messages when the owner id is unknown, and marks the source unknown', async () => {
    const { repository } = await seededRepository();
    const service = new DailyPriorityService({ repository, now: () => NOW, businessSync: fakeSync(null) });
    const summary = await service.current();
    expect(summary.actions.some((action) => action.kind === 'message_waiting')).toBe(false);
    expect(summary.sources.find((source) => source.name === 'Sinkronisasi pesan')).toMatchObject({ status: 'unknown' });
    await repository.close();
  });

  it('reports missing BusinessSync instead of pretending messages were checked', async () => {
    const { repository } = await seededRepository();
    const service = new DailyPriorityService({ repository, now: () => NOW });
    const summary = await service.current();
    expect(summary.actions.some((action) => action.kind === 'message_waiting')).toBe(false);
    expect(summary.sources.find((source) => source.name === 'Sinkronisasi pesan')).toMatchObject({ status: 'unknown' });
    await repository.close();
  });
});
