import type { ProjectOpportunity } from '@fvh/domain';
import type { WorkspaceRepository } from '@fvh/persistence';

export const testOpportunity: ProjectOpportunity = {
  id: 'fixture:test-project-01',
  title: 'API inventori dengan TypeScript',
  description: 'Membangun API inventori dengan validasi, pagination, serta pencatatan audit untuk tim operasional.',
  clientName: 'Klien uji',
  budgetMin: 300,
  budgetMax: 600,
  currency: 'USD',
  skills: ['TypeScript', 'API', 'SQLite', 'Backend Engineer'],
  deadlineDays: 14,
  briefQuality: 0.9,
  riskScore: 0.1,
  status: 'open',
  source: 'fixture',
  createdAt: '2026-10-14T00:00:00.000Z',
};

export async function insertTestOpportunity(repository: WorkspaceRepository, project: ProjectOpportunity = testOpportunity) {
  await repository.sql.query(`
    INSERT INTO projects (id, platform, external_id, project_json, pipeline_status, score, score_factors_json, created_at)
    VALUES ($1, $2, $3, $4, 'new', 0, '[]', $5)
  `, [project.id, project.source, project.id, JSON.stringify(project), project.createdAt]);
}
