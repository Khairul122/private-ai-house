import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceRepository } from '@fvh/persistence';
import { OfficeLearningService } from './office-learning.js';
import type { OfficeDiscussionInput, OfficeDiscussionOutput } from '@fvh/adapter-hermes';

describe('OfficeLearningService', () => {
  let repository: WorkspaceRepository;
  let now: Date;
  const employees = [{ id: 'qa', name: 'QA', role: 'Pengujian' }, { id: 'scout', name: 'Scout', role: 'Riset' }];
  const answer = { message: 'Mari definisikan keluaran dan bukti sebelum mulai bekerja.', lesson: 'Tentukan bukti selesai sebelum menyusun langkah kerja.' };
  beforeAll(async () => { repository = await WorkspaceRepository.open(); }, 30_000);
  afterAll(async () => { await repository.close(); });
  beforeEach(async () => { await repository.sql.query('DELETE FROM office_learning_state'); now = new Date('2026-10-21T01:00:00Z'); });
  const make = (overrides: { discuss?: (input: OfficeDiscussionInput) => Promise<OfficeDiscussionOutput>; busy?: () => boolean; available?: () => boolean } = {}) => new OfficeLearningService({ repository, employees, discuss: async () => answer, available: () => true, busy: () => false, now: () => now, ...overrides });

  it('stores actual turns and personal memory, then recalls it after restart', async () => {
    const discuss = vi.fn(async () => answer);
    const first = make({ discuss });
    const status = await first.run();
    expect(status.sessions[0]?.state).toBe('completed');
    expect(status.memories).toHaveLength(2);
    expect(discuss.mock.calls).toHaveLength(2);
    const second = make({ discuss });
    expect((await second.status()).sessions).toEqual(status.sessions);
    now = new Date(now.getTime() + 30 * 60_000);
    await second.run();
    expect(discuss.mock.calls[2]?.[0]).toMatchObject({ memories: [answer.lesson] });
    expect(discuss.mock.calls[3]?.[0]).toMatchObject({ previousMessage: answer.message });
  });

  it('waits for real work, requires consent availability, and never overlaps sessions', async () => {
    let busy = true;
    let available = true;
    let release!: (output: OfficeDiscussionOutput) => void;
    const discuss = vi.fn<(input: OfficeDiscussionInput) => Promise<OfficeDiscussionOutput>>().mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue(answer);
    const service = make({ discuss, busy: () => busy, available: () => available });
    await service.run(); expect(discuss).not.toHaveBeenCalled();
    busy = false; available = false;
    await service.run(); expect(discuss).not.toHaveBeenCalled();
    available = true;
    const pending = service.run();
    await vi.waitFor(() => expect(discuss).toHaveBeenCalledTimes(1));
    expect(service.run()).toBe(pending);
    expect(service.peek()).toMatchObject({ busy: true, phase: 'learning', activeSpeakerId: 'qa' });
    busy = true; release(answer);
    const status = await pending;
    expect(discuss).toHaveBeenCalledTimes(1);
    expect(status.sessions[0]?.state).toBe('failed');
  });

  it('reserves failed attempts, enforces 30 minutes and 12 sessions across restart, then resets at Jakarta midnight', async () => {
    const discuss = vi.fn(async () => { throw new Error('secret provider error'); });
    let service = make({ discuss });
    for (let i = 0; i < 12; i++) {
      await service.run();
      await service.run();
      now = new Date(now.getTime() + 30 * 60_000);
      service = make({ discuss });
    }
    expect(discuss).toHaveBeenCalledTimes(12);
    await service.run(); expect(discuss).toHaveBeenCalledTimes(12);
    expect((await service.status()).reason).toContain('12 sesi');
    now = new Date('2026-10-21T17:00:00Z');
    const next = await service.run();
    expect(next.sessionsToday).toBe(1);
    expect(JSON.stringify(next)).not.toContain('secret provider error');
  });

  it('persists pause and treats unfinished requests as failed without retrying', async () => {
    const service = make();
    await service.setEnabled(false);
    expect((await make().run()).sessions).toEqual([]);
    await service.setEnabled(true);
    const status = await service.run();
    const stored = (await repository.sql.query<{document: Record<string, unknown>}>('SELECT document FROM office_learning_state'))[0]!.document;
    const session = status.sessions[0]!;
    await repository.sql.query('UPDATE office_learning_state SET document=$1::jsonb', [JSON.stringify({ ...stored, sessions: [{ ...session, state: 'running', completedAt: null }] })]);
    const recovered = await make().run();
    expect(recovered.sessions).toHaveLength(1);
    expect(recovered.sessions[0]).toMatchObject({ state: 'failed', error: 'Server berhenti sebelum diskusi selesai.' });
  });

  it('fails closed on malformed output and corrupted persistent state', async () => {
    const discuss = vi.fn(async () => ({ message: 'x', lesson: 'x' }));
    const result = await make({ discuss }).run();
    expect(result.memories).toEqual([]);
    expect(result.sessions[0]?.turns).toEqual([]);
    await repository.sql.query("UPDATE office_learning_state SET document='{}'::jsonb");
    expect(await make({ discuss }).run()).toMatchObject({ available: false });
    expect(discuss).toHaveBeenCalledTimes(1);
  });
});
