import { afterEach, describe, expect, it } from 'vitest';
import { prepareKnowledgeFile } from '@fvh/knowledge';
import { createDatabase } from './database.js';
import { WorkspaceRepository } from './repository.js';

describe('WorkspaceRepository', () => {
  let repository: WorkspaceRepository | undefined;
  afterEach(() => repository?.close());

  it('creates an empty local workspace with an inactive policy', () => {
    repository = new WorkspaceRepository();

    expect(repository.listProjects()).toEqual([]);
    expect(repository.getPolicy().state).toBe('draft');
    expect(repository.getProfile().facts).toEqual([]);
  });

  it('stores submitted bids and updates outcomes', () => {
    repository = new WorkspaceRepository();
    const submittedAt = '2026-10-16T10:00:00.000Z';

    expect(repository.recordSubmittedBid({ projectId: 'freelancer:71', bidId: '9001', amount: 25, currency: 'USD', submittedAt })).toMatchObject({ projectId: 'freelancer:71', bidId: '9001', outcome: 'pending', submittedAt });
    expect(repository.recordSubmittedBid({ projectId: 'freelancer:71', bidId: '9002', amount: 30, currency: 'USD', submittedAt })).toMatchObject({ bidId: '9001' });
    expect(repository.updateBidOutcome('freelancer:71', { awardStatus: 'won', outcome: 'won', checkedAt: submittedAt })).toMatchObject({ outcome: 'won', awardStatus: 'won' });
    expect(repository.listBidOutcomes()).toHaveLength(1);
  });

  it('claims a live operation once across concurrent workers', () => {
    repository = new WorkspaceRepository();
    const claim = {
      type: 'marketplace.production.submit_bid', resourceId: 'freelancer:71', policyVersion: 1,
      payloadHash: 'a'.repeat(64), reason: 'Operation in progress.',
    };

    expect(repository.claimAudit(claim)).toBe(true);
    expect(repository.claimAudit(claim)).toBe(false);
    expect(repository.listAudit(5)).toHaveLength(1);
  });

  it('removes legacy fixture opportunities when an existing workspace opens', () => {
    const database = createDatabase();
    repository = new WorkspaceRepository(database);
    const project = {
      id: 'demo-project-01', title: 'Old demo', description: 'Fixture data from an older version.', clientName: 'Example',
      budgetMin: 1, budgetMax: 2, currency: 'USD', skills: [], deadlineDays: 1, briefQuality: 0.1,
      riskScore: 0.1, status: 'open', source: 'fixture', createdAt: '2026-01-01T00:00:00.000Z',
    };
    repository.sqlite.prepare(`
      INSERT INTO projects (id, platform, external_id, project_json, pipeline_status, score, score_factors_json, created_at)
      VALUES (?, 'fixture', ?, ?, 'new', 0, '[]', ?)
    `).run(project.id, project.id, JSON.stringify(project), project.createdAt);

    repository = new WorkspaceRepository(database);
    expect(repository.listProjects()).toEqual([]);
  });

  it('indexes evidence with provenance and removes all chunks on source deletion', () => {
    repository = new WorkspaceRepository();
    const prepared = prepareKnowledgeFile({
      sourceId: 'source-test', provider: 'manual', label: 'Project notes', referenceUrl: 'https://example.test/work',
      sourceRef: 'import-1', updatedAt: '2026-10-14T00:00:00.000Z', path: 'notes.md',
      content: '# API migration\n\nMigrated the inventory API to TypeScript with cursor pagination and audit events.',
    });
    if (!prepared.ok) throw new Error('Fixture should pass the content scan.');

    repository.createKnowledgeSource({ id: 'source-test', provider: 'manual', label: 'Project notes', referenceUrl: 'https://example.test/work', updatedAt: '2026-10-14T00:00:00.000Z' }, prepared.chunks);

    expect(repository.knowledgeCoverage()).toEqual({ sources: 1, chunks: 1 });
    expect(repository.searchKnowledge('cursor pagination')[0]).toMatchObject({ sourceId: 'source-test', path: 'notes.md', url: 'https://example.test/work#notes.md' });
    expect(repository.deleteKnowledgeSource('source-test')).toBe(true);
    expect(repository.searchKnowledge('cursor pagination')).toEqual([]);
    expect(repository.knowledgeCoverage()).toEqual({ sources: 0, chunks: 0 });
  });
});
