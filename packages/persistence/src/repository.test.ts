import { afterEach, describe, expect, it } from 'vitest';
import { prepareKnowledgeFile } from '@fvh/knowledge';
import { createDatabase } from './database.js';
import { WorkspaceRepository } from './repository.js';

describe('WorkspaceRepository', () => {
  let repository: WorkspaceRepository | undefined;
  afterEach(async () => { await repository?.close(); });

  it('preserves a previous source when replacement fails and compares policy versions atomically', async () => {
    repository = await WorkspaceRepository.open();
    const prepared = prepareKnowledgeFile({ sourceId: 'atomic', provider: 'github', label: 'owner/repo', referenceUrl: 'https://github.com/owner/repo', sourceRef: 'ref', updatedAt: '2026-10-16T00:00:00Z', path: 'README.md', content: 'Original documented portfolio evidence' });
    if (!prepared.ok) throw new Error('Fixture must pass.');
    const source = { id: 'atomic', provider: 'github' as const, label: 'owner/repo', referenceUrl: 'https://github.com/owner/repo', updatedAt: '2026-10-16T00:00:00Z' };
    await repository.createKnowledgeSource(source, prepared.chunks);
    await expect(repository.replaceKnowledgeSource({ ...source, label: 'replacement' }, [...prepared.chunks, ...prepared.chunks])).rejects.toThrow();
    expect(await repository.listKnowledgeSources()).toMatchObject([{ label: 'owner/repo', chunkCount: 1 }]);
    expect(await repository.knowledgeSourceRef('atomic')).toBe('ref');
    const policy = await repository.getPolicy();
    expect(await repository.savePolicyIfVersion({ ...policy, version: policy.version + 1 }, policy.version)).toBe(true);
    expect(await repository.savePolicyIfVersion({ ...policy, keywords: ['stale'] }, policy.version)).toBe(false);
    expect((await repository.getPolicy()).keywords).not.toContain('stale');
  });

  it('counts audit rows by status while leaving out excluded event types', async () => {
    const repo = repository = await WorkspaceRepository.open();
    const event = (type: string) => repo.appendAudit({ type, resourceId: 'r', status: 'blocked', reason: 'x', policyVersion: null, payloadHash: null });
    await event('autopilot.bid_skipped'); await event('projects_co_id.write_blocked'); await event('projects_co_id.write_blocked');
    expect(await repository.countAuditByStatus('blocked')).toBe(3);
    expect(await repository.countAuditByStatus('blocked', ['projects_co_id.write_blocked'])).toBe(1);
  });
  it('creates an empty local workspace with an inactive policy', async () => {
    repository = await WorkspaceRepository.open();

    expect(await repository.listProjects()).toEqual([]);
    expect((await repository.getPolicy()).state).toBe('draft');
    expect((await repository.getProfile()).facts).toEqual([]);
  });

  it('stores submitted bids and updates outcomes', async () => {
    repository = await WorkspaceRepository.open();
    const submittedAt = '2026-10-16T10:00:00.000Z';

    expect(await repository.recordSubmittedBid({ projectId: 'freelancer:71', bidId: '9001', amount: 25, currency: 'USD', submittedAt })).toMatchObject({ projectId: 'freelancer:71', bidId: '9001', outcome: 'pending', submittedAt });
    expect(await repository.recordSubmittedBid({ projectId: 'freelancer:71', bidId: '9002', amount: 30, currency: 'USD', submittedAt })).toMatchObject({ bidId: '9001' });
    expect(await repository.updateBidOutcome('freelancer:71', { awardStatus: 'won', outcome: 'won', checkedAt: submittedAt })).toMatchObject({ outcome: 'won', awardStatus: 'won' });
    expect(await repository.listBidOutcomes()).toHaveLength(1);
  });

  it('claims a live operation once across concurrent workers', async () => {
    repository = await WorkspaceRepository.open();
    const claim = {
      type: 'marketplace.production.submit_bid', resourceId: 'freelancer:71', policyVersion: 1,
      payloadHash: 'a'.repeat(64), reason: 'Operation in progress.',
    };

    expect(await repository.claimAudit(claim)).toBe(true);
    expect(await repository.claimAudit(claim)).toBe(false);
    expect(await repository.listAudit(5)).toHaveLength(1);
  });

  it('removes legacy fixture opportunities when an existing workspace opens', async () => {
    const database = await createDatabase();
    repository = await WorkspaceRepository.open(database);
    const project = {
      id: 'demo-project-01', title: 'Old demo', description: 'Fixture data from an older version.', clientName: 'Example',
      budgetMin: 1, budgetMax: 2, currency: 'USD', skills: [], deadlineDays: 1, briefQuality: 0.1,
      riskScore: 0.1, status: 'open', source: 'fixture', createdAt: '2026-01-01T00:00:00.000Z',
    };
    await repository.sql.query(`
      INSERT INTO projects (id, platform, external_id, project_json, pipeline_status, score, score_factors_json, created_at)
      VALUES ($1, 'fixture', $2, $3, 'new', 0, '[]', $4)
    `, [project.id, project.id, JSON.stringify(project), project.createdAt]);

    repository = await WorkspaceRepository.open(database);
    expect(await repository.listProjects()).toEqual([]);
  });

  it('indexes evidence with provenance and removes all chunks on source deletion', async () => {
    repository = await WorkspaceRepository.open();
    const prepared = prepareKnowledgeFile({
      sourceId: 'source-test', provider: 'manual', label: 'Project notes', referenceUrl: 'https://example.test/work',
      sourceRef: 'import-1', updatedAt: '2026-10-14T00:00:00.000Z', path: 'notes.md',
      content: '# API migration\n\nMigrated the inventory API to TypeScript with cursor pagination and audit events.',
    });
    if (!prepared.ok) throw new Error('Fixture should pass the content scan.');

    await repository.createKnowledgeSource({ id: 'source-test', provider: 'manual', label: 'Project notes', referenceUrl: 'https://example.test/work', updatedAt: '2026-10-14T00:00:00.000Z' }, prepared.chunks);

    expect(await repository.knowledgeCoverage()).toEqual({ sources: 1, chunks: 1 });
    expect((await repository.searchKnowledge('cursor pagination'))[0]).toMatchObject({ sourceId: 'source-test', path: 'notes.md', url: 'https://example.test/work#notes.md' });
    expect(await repository.deleteKnowledgeSource('source-test')).toBe(true);
    expect(await repository.searchKnowledge('cursor pagination')).toEqual([]);
    expect(await repository.knowledgeCoverage()).toEqual({ sources: 0, chunks: 0 });
  });

  it('stores client threads, dedupes won projects by external id, and tracks payments', async () => {
    repository = await WorkspaceRepository.open();
    await repository.upsertClientThreads([{ threadId: '501', projectId: '77', lastSenderId: '42', lastMessageAt: '2026-10-15T01:00:00.000Z', preview: 'Halo', syncedAt: '2026-10-15T02:00:00.000Z' }]);
    await repository.upsertClientThreads([{ threadId: '501', projectId: '77', lastSenderId: '7', lastMessageAt: '2026-10-15T03:00:00.000Z', preview: 'Balasan', syncedAt: '2026-10-15T04:00:00.000Z' }]);
    expect(await repository.listClientThreads()).toEqual([expect.objectContaining({ threadId: '501', lastSenderId: '7', preview: 'Balasan' })]);

    const input = { title: 'API', client: 'Acme', source: 'freelancer' as const, externalProjectId: 'freelancer:77', status: 'active' as const, deadline: null, value: 300, currency: 'USD' };
    const project = (await repository.createClientProject(input))!;
    expect(await repository.createClientProject(input)).toBeUndefined();
    expect(await repository.updateClientProject(project.id, { status: 'delivered' })).toMatchObject({ status: 'delivered', value: 300 });

    const payment = await repository.createPayment({ projectId: project.id, amount: 150, currency: 'USD', status: 'expected', dueDate: '2026-10-20', receivedAt: null, note: '' });
    expect(await repository.markPaymentReceived(payment.id, '2026-10-16T00:00:00.000Z')).toMatchObject({ status: 'received', receivedAt: '2026-10-16T00:00:00.000Z' });
    expect(await repository.markPaymentReceived('missing', '2026-10-16T00:00:00.000Z')).toBeUndefined();
  });
});
