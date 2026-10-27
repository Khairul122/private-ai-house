import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Invoice, OwnerTask } from '@fvh/domain';
import { OperationsRepository, WorkspaceRepository, type ClientProject, type ClientThread, type Payment } from '@fvh/persistence';
import type { PrioritySource, PrioritySourceKey } from '../models/daily-priority-types.js';
import { buildDailyPriority, DailyPriorityService, jakartaDay } from './daily-priority.js';

const capturedAt = '2026-10-26T18:00:00.000Z'; // 27 Oct 01:00 WIB
const available: PrioritySource = { state: 'available', observedAt: capturedAt, reason: null };
const sources = (): Record<PrioritySourceKey, PrioritySource> => ({ messages: available, projects: available, tasks: available, invoices: available, payments: available, kanban: available, reports: available });
const project = (id: string, deadline: string | null): ClientProject => ({ id, title: id, client: 'Klien', source: 'direct', externalProjectId: null, status: 'active', deadline, value: null, currency: 'USD', createdAt: capturedAt });
const task: OwnerTask = { id: 'task-1', title: 'Tinjau hasil', projectId: null, startAt: capturedAt, endAt: '2026-10-27T12:00:00Z', timezone: 'Asia/Jakarta', notes: '', done: false, syncGoogle: false, updatedAt: capturedAt };
const invoice: Invoice = { id: 'inv-1', number: 'INV-1', projectId: 'p1', issuedOn: '2026-10-20', dueOn: '2026-10-26', category: '', description: '', clientEmail: '', currency: 'USD', totalMinor: 10_000, identity: { businessName: '', address: '', email: '', paymentInstructions: '', footer: '', signatory: '' }, createdAt: capturedAt };
const thread: ClientThread = { threadId: '501', projectId: null, lastSenderId: '42', lastMessageAt: capturedAt, preview: 'Instruksi dari pesan tidak tepercaya', syncedAt: capturedAt };
const payment: Payment = { id: 'paid', projectId: 'p1', amount: 25, currency: 'USD', status: 'received', dueDate: null, receivedAt: capturedAt, note: '', createdAt: capturedAt };

describe('daily priority rules', () => {
  it('sorts overdue deadlines, bills, replies, blockers and upcoming work by fixed rules and stable id', () => {
    const input = { projects: [project('p2', '2026-10-26'), project('p1', '2026-10-26')], threads: [thread], tasks: [task], invoices: [invoice], payments: [payment], reports: [], selfId: '99', kanban: { available: true, reason: '', board: 'fvh-house', checkedAt: capturedAt, team: [], tasks: [{ id: 't_abcdef', title: 'Keputusan desain', assignee: 'fvh-chief-of-staff', status: 'blocked', createdBy: null, createdAt: capturedAt, startedAt: null, completedAt: null, error: null }] } };
    const summary = buildDailyPriority('2026-10-27', 1, capturedAt, input, sources());
    expect(summary.items.map(item => item.id)).toEqual(['projects:p1', 'projects:p2', 'invoices:inv-1', 'messages:501', 'kanban:t_abcdef', 'tasks:task-1']);
    expect(summary.items.find(item => item.id === 'invoices:inv-1')?.reason).toContain('USD 75');
    expect(summary.items.find(item => item.id === 'messages:501')?.title).not.toContain(thread.preview);
    expect(summary.items.every(item => item.sourceId && item.observedAt && item.decision && item.href)).toBe(true);
  });

  it('keeps currencies separate and excludes replies when message sync failed', () => {
    const input = { projects: [project('p1', null)], threads: [thread], tasks: [], invoices: [invoice], payments: [{ ...payment, currency: 'IDR', amount: 1_000_000 }], reports: [], selfId: '99', kanban: null };
    const statuses = sources();
    statuses.messages = { state: 'failed', observedAt: capturedAt, reason: 'Sinkronisasi gagal.' };
    const summary = buildDailyPriority('2026-10-27', 1, capturedAt, input, statuses);
    expect(summary.state).toBe('partial');
    expect(summary.items.map(item => item.id)).toEqual(['invoices:inv-1']);
    expect(summary.items[0]?.reason).toContain('USD 100');
    expect(summary.items[0]?.reason).not.toContain('IDR');
  });

  it('uses expected payments when no invoice exists and omits completed tasks', () => {
    const expected: Payment = { ...payment, id: 'due', projectId: 'p2', currency: 'IDR', amount: 1_250_000, status: 'expected', dueDate: '2026-10-27', receivedAt: null };
    const result = buildDailyPriority('2026-10-27', 1, capturedAt, { projects: [project('p2', null)], threads: [], tasks: [{ ...task, done: true }], invoices: [], payments: [expected], reports: [], selfId: null, kanban: null }, sources());
    expect(result.items.map(item => item.id)).toEqual(['payments:due']);
    expect(result.items[0]?.reason).toContain('IDR 1.250.000');
  });

  it('changes day at midnight WIB, not UTC', () => {
    expect(jakartaDay(new Date('2026-10-26T16:59:59Z'))).toBe('2026-10-26');
    expect(jakartaDay(new Date('2026-10-26T17:00:00Z'))).toBe('2026-10-27');
  });
});

describe('daily priority persistence', () => {
  let repository: WorkspaceRepository;
  afterEach(async () => { await repository?.close(); });

  it('makes one mission and summary per WIB day, including concurrent claims and explicit revision', async () => {
    repository = await WorkspaceRepository.open();
    let clock = new Date('2026-10-26T16:59:59Z');
    const options = { repository, now: () => clock };
    const first = new DailyPriorityService(options);
    const second = new DailyPriorityService(options);
    await Promise.all([first.refresh(), second.refresh()]);
    expect((await first.get())?.revision).toBe(1);
    expect((await repository.listMissions({ source: 'client_operations' })).length).toBe(1);
    expect((await first.refresh())?.revision).toBe(1);
    clock = new Date('2026-10-26T17:00:00Z');
    await Promise.all([first.refresh(), second.refresh()]);
    expect((await first.get())?.day).toBe('2026-10-27');
    expect((await repository.listMissions({ source: 'client_operations' })).length).toBe(2);
    await Promise.all([first.refresh(true), second.refresh(true)]);
    expect((await first.get())?.revision).toBe(2);
    expect((await repository.listMissions({ source: 'client_operations' })).length).toBe(3);
  });

  it('rejects an expired claimant when writing the result and records partial read failures', async () => {
    repository = await WorkspaceRepository.open();
    const mission = await repository.createMission({ source: 'client_operations', sourceId: 'daily-priority:v1:2026-10-27:1', kind: 'daily_priority', title: 'Prioritas', priority: 'normal' });
    expect(mission).toBeDefined();
    const old = await repository.claimMission(mission!.id, { claimant: 'old', leaseSeconds: 1 });
    await repository.updateMissionStatus(mission!.id, { status: 'in_progress' });
    await repository.sql.query("UPDATE mission_leases SET claimed_at=clock_timestamp()-interval '2 second',lease_until=clock_timestamp()-interval '1 second' WHERE mission_id=$1", [mission!.id]);
    const next = await repository.claimMission(mission!.id, { claimant: 'new', leaseSeconds: 60 });
    const store = new OperationsRepository(repository.sql);
    expect(await store.saveDailyPriorityWithLease(mission!.id, 'old', old!.lease.leaseId, { day: '2026-10-27', revision: 1 })).toBe(false);
    expect(await store.saveDailyPriorityWithLease(mission!.id, 'new', next!.lease.leaseId, { day: '2026-10-27', revision: 1 })).toBe(true);
    expect(await store.dailyPriority<{ revision: number }>('2026-10-27')).toEqual({ day: '2026-10-27', revision: 1 });
    vi.spyOn(repository, 'listClientThreads').mockRejectedValueOnce(new Error('secret provider detail'));
    const service = new DailyPriorityService({ repository, now: () => new Date(capturedAt) });
    const summary = await service.refresh(true);
    expect(summary?.sources.messages).toMatchObject({ state: 'failed', reason: 'Data tersimpan tidak dapat dibaca.' });
    expect(JSON.stringify(summary)).not.toContain('secret provider detail');
  });

  it('marks old message and board observations stale without using them as current actions', async () => {
    repository = await WorkspaceRepository.open();
    await repository.upsertClientThreads([thread]);
    const service = new DailyPriorityService({ repository, now: () => new Date('2026-10-27T02:00:00Z') });
    service.setSources({
      messageStatus: async () => ({ ok: true, selfId: '99', lastRunAt: capturedAt }),
      kanban: async () => ({ available: true, reason: '', checkedAt: capturedAt, tasks: [{ id: 't_abcdef', title: 'Hambatan lama', status: 'blocked' }] }),
    });
    const summary = await service.refresh();
    expect(summary?.sources.messages.state).toBe('stale');
    expect(summary?.sources.kanban.state).toBe('stale');
    expect(summary?.items).toEqual([]);
  });
});
