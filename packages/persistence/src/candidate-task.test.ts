import { afterEach, describe, expect, it } from 'vitest';
import {
  acceptanceCriteriaFor, buildCandidateTask, canConfirmCandidate, canConvertCandidate, canRejectCandidate,
  candidateMissionSourceId, candidateTitle, dedupeDependencies,
} from './candidate-task.js';
import type { CandidateTask } from './candidate-task.js';
import { messageMissionSourceId } from './message-intel.js';
import { WorkspaceRepository } from './repository.js';

const NOW = '2026-10-28T01:00:00.000Z';
const SOURCE_VERSION = 'a'.repeat(64);
const requirements = [{ id: 'req_1', text: 'Ekspor CSV', quote: 'Tambahkan ekspor CSV.' }];

function candidate(overrides: Partial<CandidateTask> = {}): CandidateTask {
  return {
    ...buildCandidateTask({
      id: 'candidate-1', sourceVersion: SOURCE_VERSION, clientProjectId: 'client-1', projectTitle: 'Situs klien',
      classification: 'feature', summary: 'Klien meminta ekspor.', requirements, questions: ['Kolom apa saja?'],
      analysisMissionId: null, now: NOW,
    }),
    ...overrides,
  };
}

/** The migration keeps real references, so the fixture stores the message and analysis mission it points at. */
async function seedReferences(repository: WorkspaceRepository): Promise<string> {
  await repository.upsertMessageSnapshots([{
    id: 'msg-1', threadId: '501', messageId: '1', senderId: '42', projectId: '71', clientProjectId: 'client-1',
    linkStatus: 'linked', body: 'Tambahkan ekspor CSV.', completeness: 'complete', completenessReason: null,
    sourceVersion: SOURCE_VERSION, capturedAt: NOW, syncedAt: NOW,
  }]);
  const mission = await repository.createMission({
    source: 'inbox', sourceId: 'analysis-fixture', kind: 'inbox.message_analysis', title: 'Analisis pesan', priority: 'normal',
  });
  return mission!.id;
}

describe('candidate task domain', () => {
  it('derives the title from the classification and project, never from model text', () => {
    expect(candidateTitle('bug', 'Situs klien')).toBe('Laporan masalah: Situs klien');
    expect(candidateTitle('unknown', '   ')).toBe('Tindak lanjut klien: proyek tanpa judul');
    expect(candidateTitle('feature', 'x'.repeat(300))).toHaveLength(200);
  });

  it('keeps each criterion anchored to the client quote', () => {
    expect(acceptanceCriteriaFor(requirements)).toEqual([{
      id: 'req_1', text: 'Kebutuhan klien terpenuhi: Ekspor CSV', quote: 'Tambahkan ekspor CSV.',
    }]);
  });

  it('dedupes dependencies and drops empty ids', () => {
    expect(dedupeDependencies(['mission-1', 'mission-1', '', '  ', null, undefined, 'mission-2'])).toEqual(['mission-1', 'mission-2']);
  });

  it('keeps the candidate mission identity distinct from the analysis mission', () => {
    expect(candidateMissionSourceId(SOURCE_VERSION)).toBe(messageMissionSourceId('candidate', SOURCE_VERSION));
    expect(candidateMissionSourceId(SOURCE_VERSION)).not.toBe(messageMissionSourceId('analysis', SOURCE_VERSION));
  });

  it('only allows the reviewed status transitions', () => {
    expect(canConfirmCandidate('needs_confirmation')).toBe(true);
    expect(canConfirmCandidate('confirmed')).toBe(false);
    expect(canRejectCandidate('needs_confirmation')).toBe(true);
    expect(canRejectCandidate('confirmed')).toBe(true);
    expect(canRejectCandidate('converted')).toBe(false);
    expect(canConvertCandidate('confirmed')).toBe(true);
    expect(canConvertCandidate('needs_confirmation')).toBe(false);
    expect(canConvertCandidate('rejected')).toBe(false);
  });

  it('stores one candidate per message version and guards each transition in SQL', async () => {
    const repository = await WorkspaceRepository.open();
    try {
      const missionId = await seedReferences(repository);
      const stored = await repository.createCandidateTask(candidate({ analysisMissionId: missionId, dependencies: [missionId] }));
      expect(stored.created).toBe(true);
      expect(stored.candidate).toMatchObject({
        id: 'candidate-1', scopeStatus: 'needs_confirmation', acceptanceCriteria: acceptanceCriteriaFor(requirements),
        dependencies: [missionId], confirmedAt: null, convertedAt: null,
      });

      const duplicate = await repository.createCandidateTask(candidate({ id: 'candidate-2', title: 'Judul lain' }));
      expect(duplicate.created).toBe(false);
      expect(duplicate.candidate).toMatchObject({ id: 'candidate-1', title: 'Permintaan fitur: Situs klien' });
      expect(await repository.listCandidateTasks()).toHaveLength(1);
      expect(await repository.getCandidateTaskBySourceVersion(SOURCE_VERSION)).toMatchObject({ id: 'candidate-1' });

      expect(await repository.markCandidateConverted('candidate-1', { now: NOW, missionId })).toBeUndefined();
      const confirmed = await repository.confirmCandidateTask('candidate-1', { now: NOW, title: 'Ekspor CSV klien' });
      expect(confirmed).toMatchObject({ scopeStatus: 'confirmed', title: 'Ekspor CSV klien', confirmedAt: NOW });
      expect(await repository.confirmCandidateTask('candidate-1', { now: NOW })).toBeUndefined();

      const converted = await repository.markCandidateConverted('candidate-1', { now: NOW, missionId });
      expect(converted).toMatchObject({ scopeStatus: 'converted', convertedMissionId: missionId, convertedAt: NOW });
      expect(await repository.rejectCandidateTask('candidate-1', { now: NOW, reason: 'Terlambat' })).toBeUndefined();
      expect(await repository.getCandidateTask('missing')).toBeUndefined();
    } finally {
      await repository.close();
    }
  });
});

describe('candidate task persistence', () => {
  let repository: WorkspaceRepository | undefined;
  afterEach(async () => { await repository?.close(); });

  it('persists the rejection reason and keeps the newest decision first in the list', async () => {
    repository = await WorkspaceRepository.open();
    await seedReferences(repository);
    await repository.createCandidateTask(candidate());
    const rejected = await repository.rejectCandidateTask('candidate-1', { now: NOW, reason: 'Di luar lingkup kontrak' });
    expect(rejected).toMatchObject({ scopeStatus: 'rejected', scopeNote: 'Di luar lingkup kontrak', confirmedAt: null });
    expect(await repository.listCandidateTasks()).toMatchObject([{ id: 'candidate-1', scopeStatus: 'rejected' }]);
  });
});
