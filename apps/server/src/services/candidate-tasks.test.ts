import { afterEach, describe, expect, it } from 'vitest';
import type { AiMessageAnalysisPort } from '@fvh/application';
import type { MessageAnalysisOutput } from '@fvh/contracts';
import { WorkspaceRepository, candidateMissionSourceId, messageMissionSourceId } from '@fvh/persistence';
import { CandidateTaskService } from './candidate-tasks.js';
import { MessageAnalysisService, captureMessageSnapshots } from './message-analysis.js';

const NOW = new Date('2026-10-28T02:00:00.000Z');
const SYNCED_AT = '2026-10-28T01:05:00.000Z';
const BODY = 'Ekspor CSV selalu gagal saat kolom tanggal kosong.';

const GOOD: MessageAnalysisOutput = {
  classification: 'bug',
  summary: 'Ekspor CSV gagal bila kolom tanggal kosong.',
  requirements: [{ text: 'Perbaiki ekspor CSV', quote: 'Ekspor CSV selalu gagal' }],
  questions: ['Browser apa yang dipakai?'],
  replyDraft: 'Saya periksa ekspor CSV-nya hari ini.',
};

function port(output: MessageAnalysisOutput = GOOD): AiMessageAnalysisPort {
  return { async analyzeMessage() { return output; } };
}

async function linkedFixture() {
  const repository = await WorkspaceRepository.open();
  const project = (await repository.createClientProject({
    title: 'Situs klien', client: 'Klien A', source: 'freelancer', externalProjectId: 'freelancer:71',
    status: 'active', deadline: null, value: null, currency: 'USD',
  }))!;
  await captureMessageSnapshots(repository, [{
    threadId: 501, projectId: '71', messageId: 1, senderId: '42', message: BODY,
    createdAt: '2026-10-28T01:00:00.000Z', messageLength: BODY.length,
  }], '7', SYNCED_AT);
  const [snapshot] = await repository.listMessageSnapshots();
  return { repository, project, snapshot: snapshot! };
}

async function analysedFixture() {
  const fixture = await linkedFixture();
  await new MessageAnalysisService({ repository: fixture.repository, analyze: port(), now: () => NOW }).analyze(fixture.snapshot.sourceVersion);
  return fixture;
}

describe('CandidateTaskService', () => {
  let repository: WorkspaceRepository | undefined;
  afterEach(async () => { await repository?.close(); });

  it('creates one candidate per analysed message and audits it once', async () => {
    const { repository: repo, project, snapshot } = await analysedFixture();
    repository = repo;
    const analysisMission = await repo.getMissionBySource('inbox', messageMissionSourceId('analysis', snapshot.sourceVersion));
    const service = new CandidateTaskService({ repository: repo, now: () => NOW });

    const first = await service.createFromAnalysis(snapshot.sourceVersion);
    expect(first.created).toBe(true);
    expect(first.candidate).toMatchObject({
      sourceVersion: snapshot.sourceVersion,
      clientProjectId: project.id,
      projectTitle: 'Situs klien',
      classification: 'bug',
      title: 'Laporan masalah: Situs klien',
      objective: GOOD.summary,
      scopeStatus: 'needs_confirmation',
      scopeNote: null,
      convertedMissionId: null,
      dependencies: [analysisMission?.id],
    });
    expect(first.candidate.acceptanceCriteria).toEqual([{
      id: 'req_1', text: 'Kebutuhan klien terpenuhi: Perbaiki ekspor CSV', quote: 'Ekspor CSV selalu gagal',
    }]);
    expect(first.candidate.questions).toEqual(GOOD.questions);

    const second = await service.createFromAnalysis(snapshot.sourceVersion);
    expect(second.created).toBe(false);
    expect(second.candidate.id).toBe(first.candidate.id);
    const created = (await repo.listAudit(50)).filter((event) => event.type === 'inbox.candidate_task_created');
    expect(created).toHaveLength(1);
  });

  it('refuses a message that is not linked to exactly one active project', async () => {
    const repo = await WorkspaceRepository.open();
    repository = repo;
    await captureMessageSnapshots(repo, [{
      threadId: 502, projectId: '999', messageId: 2, senderId: '42', message: BODY,
      createdAt: '2026-10-28T01:00:00.000Z', messageLength: BODY.length,
    }], '7', SYNCED_AT);
    const [snapshot] = await repo.listMessageSnapshots();
    await new MessageAnalysisService({ repository: repo, analyze: port(), now: () => NOW }).analyze(snapshot!.sourceVersion);

    await expect(new CandidateTaskService({ repository: repo, now: () => NOW }).createFromAnalysis(snapshot!.sourceVersion))
      .rejects.toMatchObject({ code: 'conflict', message: expect.stringMatching(/belum tertaut/) });
  });

  it('refuses unknown messages and messages without a finished analysis', async () => {
    const { repository: repo, snapshot } = await linkedFixture();
    repository = repo;
    const service = new CandidateTaskService({ repository: repo, now: () => NOW });

    await expect(service.createFromAnalysis('b'.repeat(64))).rejects.toMatchObject({ code: 'not_found' });
    await expect(service.createFromAnalysis(snapshot.sourceVersion)).rejects.toMatchObject({ code: 'conflict', message: expect.stringMatching(/belum selesai/) });
  });

  it('requires scope confirmation before converting and creates one local mission', async () => {
    const { repository: repo, project, snapshot } = await analysedFixture();
    repository = repo;
    const service = new CandidateTaskService({ repository: repo, now: () => NOW });
    const { candidate } = await service.createFromAnalysis(snapshot.sourceVersion);

    await expect(service.convert(candidate.id)).rejects.toMatchObject({ code: 'conflict', message: expect.stringMatching(/Konfirmasi lingkup/) });

    const confirmed = await service.confirm(candidate.id, { title: 'Ekspor CSV saat tanggal kosong' });
    expect(confirmed).toMatchObject({ scopeStatus: 'confirmed', title: 'Ekspor CSV saat tanggal kosong', confirmedAt: NOW.toISOString() });
    await expect(service.confirm(candidate.id, {})).rejects.toMatchObject({ code: 'conflict' });

    const converted = await service.convert(candidate.id);
    expect(converted.created).toBe(true);
    expect(converted.mission).toMatchObject({
      source: 'inbox',
      kind: 'client.candidate_task',
      title: 'Ekspor CSV saat tanggal kosong',
      status: 'queued',
      priority: 'high',
      assignedTo: 'fvh-delivery-manager',
      payload: { projectId: project.id },
    });
    expect(converted.candidate).toMatchObject({
      scopeStatus: 'converted', convertedMissionId: converted.mission.id, convertedAt: NOW.toISOString(),
    });

    const again = await service.convert(candidate.id);
    expect(again.created).toBe(false);
    expect(again.mission.id).toBe(converted.mission.id);
    const missions = (await repo.listMissions({ source: 'inbox' })).filter((mission) => mission.kind === 'client.candidate_task');
    expect(missions).toHaveLength(1);
    const convertedEvents = (await repo.listAudit(50)).filter((event) => event.type === 'inbox.candidate_task_converted');
    expect(convertedEvents).toHaveLength(1);
  });

  it('reuses the mission left by an interrupted convert instead of creating a second one', async () => {
    const { repository: repo, snapshot } = await analysedFixture();
    repository = repo;
    const service = new CandidateTaskService({ repository: repo, now: () => NOW });
    const { candidate } = await service.createFromAnalysis(snapshot.sourceVersion);
    await service.confirm(candidate.id, {});
    // Simulates a crash between creating the mission and marking the candidate converted.
    const orphan = await repo.createMission({
      source: 'inbox', sourceId: candidateMissionSourceId(snapshot.sourceVersion), kind: 'client.candidate_task',
      title: candidate.title, priority: 'high', dueAt: null, assignedTo: 'fvh-delivery-manager',
      payload: { projectId: candidate.clientProjectId },
    });

    const converted = await service.convert(candidate.id);
    expect(converted.created).toBe(false);
    expect(converted.mission.id).toBe(orphan?.id);
    expect(converted.candidate).toMatchObject({ scopeStatus: 'converted', convertedMissionId: orphan?.id });
    expect((await repo.listMissions({ source: 'inbox' })).filter((mission) => mission.kind === 'client.candidate_task')).toHaveLength(1);
    expect((await repo.listAudit(50)).filter((event) => event.type === 'inbox.candidate_task_converted')).toHaveLength(0);
  });

  it('records a rejection reason and refuses to convert a rejected candidate', async () => {
    const { repository: repo, snapshot } = await analysedFixture();
    repository = repo;
    const service = new CandidateTaskService({ repository: repo, now: () => NOW });
    const { candidate } = await service.createFromAnalysis(snapshot.sourceVersion);

    const rejected = await service.reject(candidate.id, 'Bukan bagian kontrak');
    expect(rejected).toMatchObject({ scopeStatus: 'rejected', scopeNote: 'Bukan bagian kontrak' });
    await expect(service.reject(candidate.id, 'Sekali lagi')).rejects.toMatchObject({ code: 'conflict' });
    await expect(service.convert(candidate.id)).rejects.toMatchObject({ code: 'conflict', message: expect.stringMatching(/sudah ditolak/) });
    expect(await repo.listMissions({ source: 'inbox' })).toHaveLength(1);
  });
});
