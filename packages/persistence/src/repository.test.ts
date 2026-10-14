import { afterEach, describe, expect, it } from 'vitest';
import { prepareKnowledgeFile } from '@fvh/knowledge';
import { WorkspaceRepository } from './repository.js';

describe('WorkspaceRepository', () => {
  let repository: WorkspaceRepository | undefined;
  afterEach(() => repository?.close());

  it('creates a local workspace with clearly labeled fixtures and inactive policy', () => {
    repository = new WorkspaceRepository();

    expect(repository.listProjects()).toHaveLength(4);
    expect(repository.listProjects().every((project) => project.source === 'fixture')).toBe(true);
    expect(repository.getPolicy().state).toBe('draft');
    expect(repository.getProfile().facts).toEqual([]);
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
