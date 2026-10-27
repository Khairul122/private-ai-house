import { describe, expect, it, vi } from 'vitest';
import { WorkspaceRepository } from '@fvh/persistence';
import type { HermesKanban } from './hermes-kanban.js';
import { InboxAnalysisService, parseInboxAnalysis, sourceVersion } from './inbox-analysis.js';

const message = (text = 'Tambahkan ekspor CSV untuk transaksi bulan terpilih.') => ({
  threadId: 501, projectId: '71', messageId: 901, senderId: '42', message: text,
  completeness: 'complete' as const, completenessReason: null,
  createdAt: '2026-10-27T10:00:00.000Z', threadUpdated: 100,
});

const response = (quote = message().message, replyDraft = 'Terima kasih. Apakah format kolom yang Anda inginkan?') => JSON.stringify({
  classification: 'feature', summary: 'Klien meminta ekspor transaksi.', summaryQuote: quote,
  requirements: [{ text: 'Ekspor transaksi ke CSV.', quote }], questions: ['Kolom apa yang diperlukan?'], replyDraft,
});

describe('InboxAnalysisService', () => {
  it('stores one source and mission per version, maps only an exact active project, and never queues owner messages', async () => {
    const repository = await WorkspaceRepository.open();
    await repository.createClientProject({ title: 'API', client: 'Client', source: 'freelancer', externalProjectId: 'freelancer:71', status: 'active', deadline: null, value: null, currency: 'USD' });
    const service = new InboxAnalysisService(repository, undefined, () => new Date('2026-10-27T10:01:00Z'));
    await service.capture([message()], '7');
    await service.capture([message()], '7');
    const first = await repository.listInboxAnalyses(['501']);
    expect(first).toHaveLength(1);
    expect(first[0]?.snapshot).toMatchObject({ completeness: 'complete', linkStatus: 'verified', externalProjectId: 'freelancer:71' });
    expect((await repository.listMissions({ source: 'inbox' }))).toHaveLength(1);
    await service.capture([message('Tambahkan ekspor CSV dan PDF.')], '7');
    expect(await repository.listInboxAnalyses(['501'])).toHaveLength(2);
    await service.capture([{ ...message(), senderId: '7', messageId: 902 }], '7');
    await service.capture([{ ...message(), messageId: 903 }], 'unknown');
    expect(await repository.listInboxAnalyses(['501'])).toHaveLength(2);
    await repository.close();
  });

  it('treats legacy completeness as unknown and missing project context as ambiguous', async () => {
    const repository = await WorkspaceRepository.open();
    const service = new InboxAnalysisService(repository);
    await service.capture([{ ...message(), projectId: null, completeness: undefined, completenessReason: undefined }], '7');
    expect((await repository.listInboxAnalyses(['501']))[0]?.snapshot).toMatchObject({
      completeness: 'unknown', linkStatus: 'ambiguous', clientProjectId: null,
      completenessReason: 'Keutuhan pesan tidak dapat dibuktikan.',
    });
    await repository.close();
  });

  it('validates evidence and rejects unsupported draft terms or extra fields', () => {
    const base = { threadId: '501', messageId: '901', senderId: '42', externalProjectId: null,
      content: message().message, completeness: 'complete' as const, completenessReason: null, createdAt: message().createdAt };
    const snapshot = { ...base, sourceVersion: sourceVersion(base), source: 'freelancer' as const, opportunityId: null,
      clientProjectId: null, linkStatus: 'unlinked' as const, capturedAt: '2026-10-27T10:01:00.000Z' };
    expect(sourceVersion(base)).toBe(sourceVersion({ ...base }));
    expect(sourceVersion({ ...base, content: 'edited' })).not.toBe(snapshot.sourceVersion);
    expect(parseInboxAnalysis(response(), snapshot).requirements[0]?.evidenceRef).toMatchObject({ quote: message().message, sourceVersion: snapshot.sourceVersion });
    expect(() => parseInboxAnalysis(response('Kutipan palsu'), snapshot)).toThrow('Kutipan');
    expect(() => parseInboxAnalysis(response(message().message, 'Biayanya USD 50.'), snapshot)).toThrow('Draf');
    expect(() => parseInboxAnalysis(response(message().message, 'Saya akan mengirim hasilnya.'), snapshot)).toThrow('Draf');
    expect(() => parseInboxAnalysis('{', snapshot)).toThrow();
    expect(() => parseInboxAnalysis(JSON.stringify({ ...JSON.parse(response()), extra: true }), snapshot)).toThrow();
  });

  it('recovers an existing card after restart and stores one validated result', async () => {
    const repository = await WorkspaceRepository.open();
    const create = vi.fn(async () => ({ id: 't_123abc' }));
    let done = false;
    const detail = vi.fn(async () => ({ task: { status: done ? 'done' : 'running' }, summary: done ? response() : null }));
    const kanban = { create, detail } as unknown as HermesKanban;
    const service = new InboxAnalysisService(repository, kanban);
    await service.capture([message()], '7');
    await service.tick();
    expect((await repository.listInboxAnalyses(['501']))[0]?.analysis).toMatchObject({ status: 'running', cardId: 't_123abc' });
    done = true;
    await new InboxAnalysisService(repository, kanban).tick();
    const analysis = (await repository.listInboxAnalyses(['501']))[0]?.analysis;
    expect(analysis).toMatchObject({ status: 'succeeded', resultJson: { classification: 'feature' } });
    expect(create).toHaveBeenCalledTimes(1);
    expect(await repository.listPendingInboxAnalyses()).toHaveLength(0);
    await repository.close();
  });

  it('blocks invalid AI output and fences a replaced lease', async () => {
    const repository = await WorkspaceRepository.open();
    const kanban = { create: async () => ({ id: 't_123abc' }), detail: async () => ({ task: { status: 'done' }, summary: response('Kutipan palsu') }) } as unknown as HermesKanban;
    const service = new InboxAnalysisService(repository, kanban);
    await service.capture([message()], '7');
    const row = (await repository.listInboxAnalyses(['501']))[0]!.analysis;
    const old = await repository.claimMission(row.missionId, { claimant: 'old', leaseSeconds: 10 });
    expect(old).toBeDefined();
    await repository.sql.query("UPDATE mission_leases SET claimed_at=clock_timestamp()-interval '20 seconds', lease_until=clock_timestamp()-interval '1 second' WHERE mission_id=$1", [row.missionId]);
    const next = await repository.claimMission(row.missionId, { claimant: 'new', leaseSeconds: 10 });
    expect(next?.outcome).toBe('reclaimed');
    expect(await repository.writeInboxAnalysisWithLease({ id: row.id, missionId: row.missionId, claimant: 'old', leaseId: old!.lease.leaseId,
      status: 'succeeded', result: { forged: true } })).toBe(false);
    await repository.releaseMissionLease(row.missionId, { claimant: 'new', leaseId: next!.lease.leaseId });
    await service.tick();
    expect((await repository.listInboxAnalyses(['501']))[0]?.analysis).toMatchObject({ status: 'blocked', error: 'Kutipan tidak ada dalam pesan tersimpan.', resultJson: null });
    await service.tick();
    expect(await repository.listPendingInboxAnalyses()).toHaveLength(0);
    await repository.close();
  });

  it('records AI unavailability without inventing an analysis', async () => {
    const repository = await WorkspaceRepository.open();
    const service = new InboxAnalysisService(repository);
    await service.capture([message()], '7');
    await service.tick();
    const row = (await repository.listInboxAnalyses(['501']))[0]?.analysis;
    expect(row).toMatchObject({ status: 'blocked', resultJson: null, error: 'Analisis AI tidak tersedia.' });
    expect((await repository.listMissions({ source: 'inbox' }))[0]?.status).toBe('blocked');
    await repository.close();
  });

  it('blocks a Hermes timeout without storing a fabricated result', async () => {
    const repository = await WorkspaceRepository.open();
    const kanban = { create: async () => ({ id: 't_123abc' }), detail: async () => { throw new Error('timeout'); } } as unknown as HermesKanban;
    const service = new InboxAnalysisService(repository, kanban);
    await service.capture([message()], '7');
    await service.tick();
    expect((await repository.listInboxAnalyses(['501']))[0]?.analysis).toMatchObject({ status: 'blocked', resultJson: null,
      error: 'Analisis AI gagal atau waktunya habis.' });
    await repository.close();
  });
});
