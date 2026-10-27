import { describe, expect, it } from 'vitest';
import type { AiMessageAnalysisPort, MessageAnalysisInput } from '@fvh/application';
import type { FreelancerLatestMessage } from '@fvh/adapter-freelancer';
import type { MessageAnalysisOutput } from '@fvh/contracts';
import { WorkspaceRepository } from '@fvh/persistence';
import { MessageAnalysisError, MessageAnalysisService, captureMessageSnapshots } from './message-analysis.js';

const NOW = new Date('2026-10-27T02:00:00.000Z');
const BODY = 'Tolong tambahkan filter tanggal di halaman laporan. Budget saya 100 USD.';

const GOOD: MessageAnalysisOutput = {
  classification: 'feature',
  summary: 'Klien meminta filter tanggal pada halaman laporan.',
  requirements: [{ text: 'Filter tanggal di halaman laporan', quote: 'filter tanggal di halaman laporan' }],
  questions: ['Format tanggal yang dipakai?'],
  replyDraft: 'Baik, saya tambahkan filter tanggal pada halaman laporan sesuai budget 100 USD.',
};

function message(overrides: Partial<FreelancerLatestMessage> = {}): FreelancerLatestMessage {
  return {
    threadId: 501, projectId: '71', messageId: 1, senderId: '42', message: BODY,
    createdAt: '2026-10-27T01:00:00.000Z', messageLength: BODY.length, ...overrides,
  };
}

function fakePort(outputs: Array<MessageAnalysisOutput | Error>) {
  const inputs: MessageAnalysisInput[] = [];
  const port: AiMessageAnalysisPort = {
    async analyzeMessage(input) {
      inputs.push(input);
      const next = outputs[Math.min(inputs.length - 1, outputs.length - 1)];
      if (!next) throw new Error('Tidak ada output uji.');
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { port, inputs };
}

async function repositoryWithProject() {
  const repository = await WorkspaceRepository.open();
  const project = await repository.createClientProject({
    title: 'Situs klien', client: 'Klien A', source: 'freelancer', externalProjectId: 'freelancer:71',
    status: 'active', deadline: null, value: null, currency: 'USD',
  });
  return { repository, project: project! };
}

function service(repository: WorkspaceRepository, port: AiMessageAnalysisPort) {
  return new MessageAnalysisService({ repository, analyze: port, now: () => NOW });
}

describe('captureMessageSnapshots', () => {
  it('stores inbound messages only and adds nothing when the same message syncs again', async () => {
    const { repository, project } = await repositoryWithProject();
    const syncedAt = '2026-10-27T01:05:00.000Z';
    const messages = [message(), message({ messageId: 2, senderId: '7', message: 'Baik, saya kerjakan.' })];

    expect(await captureMessageSnapshots(repository, messages, '7', syncedAt)).toBe(1);
    expect(await captureMessageSnapshots(repository, messages, '7', '2026-10-27T01:06:00.000Z')).toBe(0);
    const stored = await repository.listMessageSnapshots();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ body: BODY, completeness: 'complete', linkStatus: 'linked', clientProjectId: project.id });
    await repository.close();
  });

  it('records why a message cannot be analysed instead of treating an old preview as complete', async () => {
    const { repository } = await repositoryWithProject();
    await captureMessageSnapshots(repository, [
      message({ messageId: 11, messageLength: undefined }),
      message({ messageId: 12, message: 'x'.repeat(5_000), messageLength: 9_000, messageTruncated: true }),
    ], '7', '2026-10-27T01:05:00.000Z');
    const byId = new Map((await repository.listMessageSnapshots()).map((snapshot) => [snapshot.messageId, snapshot]));
    expect(byId.get('11')).toMatchObject({ completeness: 'unknown' });
    expect(byId.get('11')?.completenessReason).toMatch(/panjang pesan/);
    expect(byId.get('12')).toMatchObject({ completeness: 'truncated' });
    expect(byId.get('12')?.body).toHaveLength(4_000);
    await repository.close();
  });
});

describe('MessageAnalysisService', () => {
  it('never calls the model for an unlinked message and says why', async () => {
    const repository = await WorkspaceRepository.open();
    await captureMessageSnapshots(repository, [message()], '7', '2026-10-27T01:05:00.000Z');
    const { port, inputs } = fakePort([GOOD]);
    const [snapshot] = await repository.listMessageSnapshots();

    const result = await service(repository, port).analyze(snapshot!.sourceVersion);
    expect(result).toMatchObject({ status: 'blocked', classification: null, replyDraft: null });
    expect(result.error).toMatch(/belum tertaut/);
    expect(inputs).toHaveLength(0);
    await repository.close();
  });

  it('does not analyse an incomplete message and stores the reason', async () => {
    const { repository } = await repositoryWithProject();
    await captureMessageSnapshots(repository, [message({ messageLength: undefined })], '7', '2026-10-27T01:05:00.000Z');
    const { port, inputs } = fakePort([GOOD]);
    const [snapshot] = await repository.listMessageSnapshots();

    const result = await service(repository, port).analyze(snapshot!.sourceVersion);
    expect(result).toMatchObject({ status: 'blocked' });
    expect(result.error).toMatch(/panjang pesan/);
    expect(inputs).toHaveLength(0);
    await repository.close();
  });

  it('blocks model output whose quote is missing from the message or whose draft invents an amount', async () => {
    const { repository } = await repositoryWithProject();
    await captureMessageSnapshots(repository, [message()], '7', '2026-10-27T01:05:00.000Z');
    const [snapshot] = await repository.listMessageSnapshots();
    const { port } = fakePort([
      { ...GOOD, requirements: [{ text: 'Ekspor PDF', quote: 'fitur ekspor PDF' }] },
      { ...GOOD, replyDraft: 'Saya butuh USD 500 tambahan untuk ini.' },
    ]);
    const target = service(repository, port);

    expect(await target.analyze(snapshot!.sourceVersion)).toMatchObject({ status: 'blocked', requirements: [] });
    expect((await target.analyze(snapshot!.sourceVersion)).error).toMatch(/nominal/);
    await repository.close();
  });

  it('stores one verified reading and returns it again instead of paying for the model twice', async () => {
    const { repository } = await repositoryWithProject();
    await captureMessageSnapshots(repository, [message()], '7', '2026-10-27T01:05:00.000Z');
    const [snapshot] = await repository.listMessageSnapshots();
    const { port, inputs } = fakePort([GOOD]);
    const target = service(repository, port);

    const first = await target.analyze(snapshot!.sourceVersion);
    expect(first).toMatchObject({
      status: 'succeeded', classification: 'feature',
      requirements: [{ id: 'req_1', text: GOOD.requirements[0]!.text, quote: GOOD.requirements[0]!.quote }],
      questions: GOOD.questions, replyDraft: GOOD.replyDraft, error: null,
    });
    expect(first.finishedAt).toBe(NOW.toISOString());
    expect(inputs[0]).toMatchObject({ projectTitle: 'Situs klien', completeness: 'complete', body: BODY });

    const second = await target.analyze(snapshot!.sourceVersion);
    expect(second.analysisId).toBe(first.analysisId);
    expect(inputs).toHaveLength(1);
    expect(await target.counts()).toEqual({ snapshots: 1, analyzable: 0, succeeded: 1, blocked: 0 });
    expect((await repository.listAuditForType('inbox.message_analysis_succeeded'))).toHaveLength(1);
    await repository.close();
  });

  it('blocks a failed model call with a redacted error and allows a retry', async () => {
    const { repository } = await repositoryWithProject();
    await captureMessageSnapshots(repository, [message()], '7', '2026-10-27T01:05:00.000Z');
    const [snapshot] = await repository.listMessageSnapshots();
    const { port } = fakePort([new Error('HTTP 429 token=rahasia'), GOOD]);
    const target = service(repository, port);

    const blocked = await target.analyze(snapshot!.sourceVersion);
    expect(blocked).toMatchObject({ status: 'blocked', error: 'HTTP 429 [redacted]' });
    expect((await target.analyze(snapshot!.sourceVersion)).status).toBe('succeeded');
    await repository.close();
  });

  it('refuses a second run while a fresh row is running, then retries once it is stale', async () => {
    const { repository } = await repositoryWithProject();
    await captureMessageSnapshots(repository, [message()], '7', '2026-10-27T01:05:00.000Z');
    const [snapshot] = await repository.listMessageSnapshots();
    const base = { sourceVersion: snapshot!.sourceVersion, contractVersion: 'inbox-analysis-v1', classification: null, summary: null, requirements: [], questions: [], replyDraft: null, error: null, finishedAt: null };
    await repository.saveMessageAnalysis({ ...base, analysisId: 'running-now', status: 'running', startedAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
    const { port, inputs } = fakePort([GOOD]);
    const target = service(repository, port);

    await expect(target.analyze(snapshot!.sourceVersion)).rejects.toBeInstanceOf(MessageAnalysisError);
    expect(inputs).toHaveLength(0);

    await repository.saveMessageAnalysis({ ...base, analysisId: 'running-now', status: 'running', startedAt: new Date(NOW.getTime() - 11 * 60_000).toISOString(), updatedAt: NOW.toISOString() });
    expect((await target.analyze(snapshot!.sourceVersion)).status).toBe('succeeded');
    await repository.close();
  });

  it('processes the oldest pending messages first when the owner asks for a batch', async () => {
    const { repository } = await repositoryWithProject();
    await captureMessageSnapshots(repository, [
      message({ messageId: 21, createdAt: '2026-10-27T01:00:00.000Z' }),
      message({ messageId: 22, createdAt: '2026-10-27T01:01:00.000Z' }),
    ], '7', '2026-10-27T01:05:00.000Z');
    const { port, inputs } = fakePort([GOOD]);
    const target = service(repository, port);

    const first = await target.analyzePending(1);
    expect(first.results).toHaveLength(1);
    expect(inputs[0]?.messageId).toBe('21');
    expect((await target.analyzePending(1)).results).toHaveLength(1);
    expect(await target.counts()).toMatchObject({ snapshots: 2, analyzable: 0, succeeded: 2 });
    await repository.close();
  });
});
