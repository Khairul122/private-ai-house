import { randomUUID } from 'node:crypto';
import { eq, desc } from 'drizzle-orm';
import type { AuditEvent, AutonomyPolicy, BidDraft, PipelineStatus, ProjectOpportunity } from '@fvh/domain';
import { safeFtsQuery, type KnowledgeChunk, type KnowledgeProvider } from '@fvh/knowledge';
import { createDatabase, type WorkspaceDatabase } from './database.js';
import { auditEvents, autonomyPolicies, bidDrafts, knowledgeSources, projects, serviceProfiles, workspaces } from './schema.js';

export type ServiceProfile = {
  primaryField: string;
  specializations: string[];
  language: string;
  currency: string;
  timezone: string;
  minPrice: number;
  maxPrice: number;
  facts: Array<{ label: string; value: string; source: string }>;
};

export type StoredKnowledgeSource = {
  id: string;
  provider: KnowledgeProvider;
  label: string;
  referenceUrl: string;
  updatedAt: string;
  chunkCount: number;
};

const WORKSPACE_ID = 'workspace_local';

const initialPolicy = (): AutonomyPolicy => ({
  version: 1,
  state: 'draft',
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  allowedActions: [],
  primaryField: '',
  specializations: [],
  keywords: [],
  minimumConfidence: 0.78,
  minPrice: 100,
  maxPrice: 800,
  dailyBidLimit: 4,
  weeklyBidLimit: 12,
  timezone: 'Asia/Jakarta',
  activeHours: { start: 8, end: 19 },
  noNegotiationTerms: [],
  simulationOnly: true,
});

const initialProfile = (): ServiceProfile => ({
  primaryField: '',
  specializations: [],
  language: 'id',
  currency: 'USD',
  timezone: 'Asia/Jakarta',
  minPrice: 100,
  maxPrice: 800,
  facts: [],
});

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

export class WorkspaceRepository {
  private readonly db: WorkspaceDatabase['db'];
  readonly sqlite: WorkspaceDatabase['sqlite'];

  constructor(database: WorkspaceDatabase = createDatabase()) {
    this.db = database.db;
    this.sqlite = database.sqlite;
    this.seed();
  }

  close() {
    this.sqlite.close();
  }

  private seed() {
    const now = new Date().toISOString();
    this.db.insert(workspaces).values({ id: WORKSPACE_ID, name: 'Freelancer Virtual House', createdAt: now }).onConflictDoNothing().run();
    this.db.insert(serviceProfiles).values({ workspaceId: WORKSPACE_ID, profileJson: JSON.stringify(initialProfile()), updatedAt: now }).onConflictDoNothing().run();
    this.db.insert(autonomyPolicies).values({ workspaceId: WORKSPACE_ID, policyJson: JSON.stringify(initialPolicy()), updatedAt: now }).onConflictDoNothing().run();
    this.removeFixtureProjects();
  }

  private removeFixtureProjects() {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      this.sqlite.exec(`
        DELETE FROM audit_events
        WHERE resource_id IN (SELECT id FROM projects WHERE platform = 'fixture');
        DELETE FROM bid_drafts
        WHERE project_id IN (SELECT id FROM projects WHERE platform = 'fixture');
        DELETE FROM projects WHERE platform = 'fixture';
      `);
      this.sqlite.exec('COMMIT');
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  listProjects(): Array<ProjectOpportunity & { pipelineStatus: PipelineStatus; score: number; factors: Array<{ key: string; label: string; points: number; value: string }> }> {
    return this.db.select().from(projects).all().map((row) => ({
      ...parseJson<ProjectOpportunity>(row.projectJson),
      pipelineStatus: row.pipelineStatus as PipelineStatus,
      score: row.score,
      factors: parseJson(row.scoreFactorsJson),
    }));
  }

  getProject(id: string): ProjectOpportunity | undefined {
    const row = this.db.select().from(projects).where(eq(projects.id, id)).get();
    return row ? parseJson<ProjectOpportunity>(row.projectJson) : undefined;
  }

  syncFreelancerProjects(incoming: ProjectOpportunity[]) {
    if (incoming.length === 0) return { upserted: 0 };
    const upsert = this.sqlite.prepare(`
      INSERT INTO projects (id, platform, external_id, project_json, pipeline_status, score, score_factors_json, created_at)
      VALUES (?, 'freelancer', ?, ?, 'new', 0, '[]', ?)
      ON CONFLICT(id) DO UPDATE SET project_json = excluded.project_json
    `);
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      for (const project of incoming) {
        upsert.run(project.id, project.id.replace(/^freelancer:/, ''), JSON.stringify(project), project.createdAt);
      }
      this.sqlite.exec('COMMIT');
      return { upserted: incoming.length };
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  evaluateProject(id: string, score: number, factors: unknown) {
    const current = this.db.select({ pipelineStatus: projects.pipelineStatus }).from(projects).where(eq(projects.id, id)).get();
    const assessment = { score, scoreFactorsJson: JSON.stringify(factors) };
    const hasDraft = this.getLatestDraft(id) !== undefined;
    const evaluatedStatus = current?.pipelineStatus === 'new' ? 'scored' : current?.pipelineStatus === 'scored' && hasDraft ? 'draft_ready' : undefined;
    if (evaluatedStatus) {
      this.db.update(projects).set({ ...assessment, pipelineStatus: evaluatedStatus }).where(eq(projects.id, id)).run();
    } else {
      this.db.update(projects).set(assessment).where(eq(projects.id, id)).run();
    }
  }

  setPipelineStatus(id: string, status: PipelineStatus) {
    this.db.update(projects).set({ pipelineStatus: status }).where(eq(projects.id, id)).run();
  }

  createDraft(draft: BidDraft) {
    this.db.insert(bidDrafts).values({ id: draft.id, projectId: draft.projectId, draftJson: JSON.stringify(draft), createdAt: draft.createdAt }).run();
    this.setPipelineStatus(draft.projectId, 'draft_ready');
    return draft;
  }

  getLatestDraft(projectId: string): BidDraft | undefined {
    const row = this.db.select().from(bidDrafts).where(eq(bidDrafts.projectId, projectId)).orderBy(desc(bidDrafts.createdAt)).get();
    return row ? parseJson<BidDraft>(row.draftJson) : undefined;
  }

  getDraft(id: string): BidDraft | undefined {
    const row = this.db.select().from(bidDrafts).where(eq(bidDrafts.id, id)).get();
    return row ? parseJson<BidDraft>(row.draftJson) : undefined;
  }

  updateDraft(id: string, update: Pick<BidDraft, 'proposal' | 'proposedPrice'>): BidDraft | undefined {
    const draft = this.getDraft(id);
    if (!draft) return undefined;
    const updated = { ...draft, ...update };
    this.db.update(bidDrafts).set({ draftJson: JSON.stringify(updated) }).where(eq(bidDrafts.id, id)).run();
    return updated;
  }

  getPolicy(): AutonomyPolicy {
    const row = this.db.select().from(autonomyPolicies).where(eq(autonomyPolicies.workspaceId, WORKSPACE_ID)).get();
    return row ? parseJson<AutonomyPolicy>(row.policyJson) : initialPolicy();
  }

  savePolicy(policy: AutonomyPolicy) {
    this.db.insert(autonomyPolicies).values({ workspaceId: WORKSPACE_ID, policyJson: JSON.stringify(policy), updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: autonomyPolicies.workspaceId, set: { policyJson: JSON.stringify(policy), updatedAt: new Date().toISOString() } }).run();
  }

  getProfile(): ServiceProfile {
    const row = this.db.select().from(serviceProfiles).where(eq(serviceProfiles.workspaceId, WORKSPACE_ID)).get();
    return row ? parseJson<ServiceProfile>(row.profileJson) : initialProfile();
  }

  saveProfile(profile: ServiceProfile) {
    this.db.insert(serviceProfiles).values({ workspaceId: WORKSPACE_ID, profileJson: JSON.stringify(profile), updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: serviceProfiles.workspaceId, set: { profileJson: JSON.stringify(profile), updatedAt: new Date().toISOString() } }).run();
  }

  appendAudit(input: Omit<AuditEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): AuditEvent {
    const event: AuditEvent = { ...input, id: input.id ?? randomUUID(), createdAt: input.createdAt ?? new Date().toISOString() };
    this.db.insert(auditEvents).values(event).run();
    return event;
  }

  listAudit(limit = 50): AuditEvent[] {
    return this.db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(limit).all() as AuditEvent[];
  }

  hasAudit(type: string, resourceId: string): boolean {
    return Boolean(this.sqlite.prepare('SELECT 1 AS found FROM audit_events WHERE type = ? AND resource_id = ? LIMIT 1').get(type, resourceId));
  }

  hasAuditForPolicy(type: string, resourceId: string, policyVersion: number): boolean {
    return Boolean(this.sqlite.prepare('SELECT 1 AS found FROM audit_events WHERE type = ? AND resource_id = ? AND policy_version = ? LIMIT 1').get(type, resourceId, policyVersion));
  }

  claimAudit(input: { type: string; resourceId: string; policyVersion: number; payloadHash: string | null; reason: string }): boolean {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const exists = this.sqlite.prepare('SELECT 1 AS found FROM audit_events WHERE type = ? AND resource_id = ? LIMIT 1').get(input.type, input.resourceId);
      if (exists) {
        this.sqlite.exec('ROLLBACK');
        return false;
      }
      this.sqlite.prepare(`
        INSERT INTO audit_events (id, type, resource_id, status, reason, policy_version, payload_hash, created_at)
        VALUES (?, ?, ?, 'allowed', ?, ?, ?, ?)
      `).run(randomUUID(), input.type, input.resourceId, input.reason, input.policyVersion, input.payloadHash, new Date(Date.now() - 1_000).toISOString());
      this.sqlite.exec('COMMIT');
      return true;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  createKnowledgeSource(source: { id: string; provider: KnowledgeProvider; label: string; referenceUrl: string; updatedAt: string }, chunks: KnowledgeChunk[]) {
    const insertChunk = this.sqlite.prepare('INSERT INTO knowledge_chunks (id, source_id, path, source_ref, url, content_hash, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const insertFts = this.sqlite.prepare('INSERT INTO knowledge_search (chunk_id, source_id, content) VALUES (?, ?, ?)');
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      this.db.insert(knowledgeSources).values({ ...source }).run();
      for (const chunk of chunks) {
        insertChunk.run(chunk.id, chunk.sourceId, chunk.path, chunk.sourceRef, chunk.url, chunk.contentHash, chunk.content, new Date().toISOString());
        insertFts.run(chunk.id, chunk.sourceId, chunk.content);
      }
      this.sqlite.exec('COMMIT');
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
    return this.listKnowledgeSources().find((item) => item.id === source.id);
  }

  listKnowledgeSources(): StoredKnowledgeSource[] {
    return this.sqlite.prepare(`
      SELECT s.id, s.provider, s.label, s.reference_url AS referenceUrl, s.updated_at AS updatedAt, COUNT(c.id) AS chunkCount
      FROM knowledge_sources s LEFT JOIN knowledge_chunks c ON c.source_id = s.id
      GROUP BY s.id ORDER BY s.updated_at DESC
    `).all() as StoredKnowledgeSource[];
  }

  searchKnowledge(query: string, limit = 5): Array<{ sourceId: string; label: string; path: string; url: string; content: string; rank: number }> {
    const match = safeFtsQuery(query);
    if (!match) return [];
    return this.sqlite.prepare(`
      SELECT c.source_id AS sourceId, s.label, c.path, c.url, c.content, bm25(knowledge_search) AS rank
      FROM knowledge_search k
      JOIN knowledge_chunks c ON c.id = k.chunk_id
      JOIN knowledge_sources s ON s.id = c.source_id
      WHERE knowledge_search MATCH ?
      ORDER BY rank LIMIT ?
    `).all(match, limit) as Array<{ sourceId: string; label: string; path: string; url: string; content: string; rank: number }>;
  }

  deleteKnowledgeSource(id: string): boolean {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      this.sqlite.prepare('DELETE FROM knowledge_search WHERE source_id = ?').run(id);
      const deleted = this.sqlite.prepare('DELETE FROM knowledge_sources WHERE id = ?').run(id).changes > 0;
      this.sqlite.exec('COMMIT');
      return deleted;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  knowledgeCoverage() {
    const result = this.sqlite.prepare('SELECT COUNT(DISTINCT source_id) AS sources, COUNT(*) AS chunks FROM knowledge_chunks').get() as { sources: number; chunks: number };
    return result;
  }
}
