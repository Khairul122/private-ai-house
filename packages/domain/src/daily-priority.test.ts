import { describe, expect, it } from 'vitest';
import { buildDailyPriority, daysFromWibDay, wibDay, type DailyPriorityFacts } from './daily-priority.js';

const empty: DailyPriorityFacts = { payments: [], deadlines: [], missions: [], messages: [], followUps: [] };

describe('wibDay', () => {
  it('uses the Asia/Jakarta calendar day instead of the host day', () => {
    expect(wibDay(new Date('2026-10-26T16:59:00.000Z'))).toBe('2026-10-26');
    expect(wibDay(new Date('2026-10-26T17:00:00.000Z'))).toBe('2026-10-27');
    expect(wibDay(new Date('2026-10-27T03:30:00.000Z'))).toBe('2026-10-27');
  });
});

describe('daysFromWibDay', () => {
  it('counts calendar days in WIB and rejects unusable timestamps', () => {
    expect(daysFromWibDay('2026-10-27', '2026-10-26T17:30:00.000Z')).toBe(0);
    expect(daysFromWibDay('2026-10-27', '2026-10-26T16:30:00.000Z')).toBe(-1);
    expect(daysFromWibDay('2026-10-27', '2026-10-27T16:59:00.000Z')).toBe(0);
    expect(daysFromWibDay('2026-10-27', '2026-10-27T17:00:00.000Z')).toBe(1);
    expect(daysFromWibDay('2026-10-27', 'bukan-tanggal')).toBeNull();
  });
});

describe('buildDailyPriority', () => {
  it('ranks overdue money first and keeps payments separated per currency', () => {
    const result = buildDailyPriority({
      day: '2026-10-27',
      generatedAt: '2026-10-27T02:00:00.000Z',
      sources: [],
      facts: {
        ...empty,
        payments: [
          { id: 'p2', projectTitle: 'Klien B', amount: 40, currency: 'USD', dueDate: '2026-10-20', status: 'expected' },
          { id: 'p1', projectTitle: 'Klien A', amount: 900_000, currency: 'IDR', dueDate: '2026-10-26', status: 'expected' },
          { id: 'p3', projectTitle: 'Klien C', amount: 60, currency: 'USD', dueDate: '2026-10-30', status: 'expected' },
          { id: 'p4', projectTitle: 'Lunas', amount: 500, currency: 'USD', dueDate: '2026-10-01', status: 'received' },
        ],
        messages: [{ threadId: '501', projectTitle: 'Proyek A', waitingHours: 50, lastMessageAt: '2026-10-25T00:00:00.000Z' }],
      },
    });
    expect(result.actions[0]).toMatchObject({ kind: 'payment_due', id: 'payment:p2' });
    expect(result.actions[0]?.reason).toContain('lewat tenggat');
    expect(result.currencyTotals).toEqual([
      { currency: 'IDR', amount: 900_000, payments: 1 },
      { currency: 'USD', amount: 100, payments: 2 },
    ]);
  });

  it('interleaves deadlines, urgent missions and waiting messages by their explicit rules', () => {
    const result = buildDailyPriority({
      day: '2026-10-27',
      generatedAt: '2026-10-27T02:00:00.000Z',
      sources: [],
      facts: {
        ...empty,
        payments: [{ id: 'p1', projectTitle: 'A', amount: 10, currency: 'USD', dueDate: '2026-11-10', status: 'expected' }],
        deadlines: [{ id: 'c1', title: 'Situs klien', deadline: '2026-10-27', daysToDeadline: 0, status: 'active' }, { id: 'c2', title: 'Sudah selesai', deadline: '2026-10-01', daysToDeadline: -26, status: 'delivered' }],
        missions: [{ id: 'm1', title: 'Perbaiki login', priority: 'urgent', dueAt: '2026-10-26T17:00:00.000Z', status: 'queued' }, { id: 'm2', title: 'Rapikan dokumen', priority: 'low', dueAt: null, status: 'queued' }, { id: 'm3', title: 'Selesai', priority: 'urgent', dueAt: null, status: 'completed' }],
        messages: [{ threadId: '9', projectTitle: null, waitingHours: 2, lastMessageAt: '2026-10-27T00:00:00.000Z' }],
        followUps: [{ projectId: 'freelancer:8', title: 'Bid lama', daysSinceBid: 9, submittedAt: '2026-10-18T00:00:00.000Z' }],
      },
    });
    expect(result.actions.map((action) => action.id)).toEqual([
      'mission:m1', 'deadline:c1', 'follow-up:freelancer:8', 'payment:p1', 'message:9', 'mission:m2',
    ]);
    expect(result.actions.find((action) => action.id === 'mission:m1')?.reason).toContain('Tenggat tercapai');
  });

  it('is stable for identical facts and caps the list', () => {
    const facts: DailyPriorityFacts = {
      ...empty,
      messages: Array.from({ length: 20 }, (_, index) => ({ threadId: String(index + 1), projectTitle: `Thread ${index + 1}`, waitingHours: 30, lastMessageAt: '2026-10-26T00:00:00.000Z' })),
    };
    const first = buildDailyPriority({ facts, day: '2026-10-27', generatedAt: '2026-10-27T02:00:00.000Z', sources: [] });
    const second = buildDailyPriority({ facts, day: '2026-10-27', generatedAt: '2026-10-27T09:00:00.000Z', sources: [] });
    expect(first.actions).toHaveLength(12);
    expect(first.actions.map((action) => action.id)).toEqual(second.actions.map((action) => action.id));
    expect(first.actions[0]?.id).toBe('message:1');
    expect(first.currencyTotals).toEqual([]);
  });

  it('returns an empty list instead of inventing work when no source has data', () => {
    const result = buildDailyPriority({ facts: empty, day: '2026-10-27', generatedAt: '2026-10-27T02:00:00.000Z', sources: [{ name: 'Pesan klien', status: 'failed', lastRunAt: null, note: 'Sinkronisasi gagal.' }] });
    expect(result.actions).toEqual([]);
    expect(result.sources[0]).toMatchObject({ status: 'failed' });
  });
});
