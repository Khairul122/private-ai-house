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

export type BidOutcome = {
  projectId: string;
  bidId: string;
  amount: number | null;
  currency: string | null;
  submittedAt: string;
  awardStatus: string | null;
  outcome: string;
  checkedAt: string | null;
};

export type SkipReasonSummary = { reason: string; total: number; recent: number };
export type ClientThread = { threadId: string; projectId: string | null; lastSenderId: string; lastMessageAt: string; preview: string; syncedAt: string };
export type ClientProjectSource = 'freelancer' | 'direct' | 'linkedin' | 'other';
export type ClientProjectStatus = 'active' | 'delivered' | 'closed';
export type ClientProject = {
  id: string; title: string; client: string; source: ClientProjectSource; externalProjectId: string | null;
  status: ClientProjectStatus; deadline: string | null; value: number | null; currency: string; createdAt: string;
};
export type Payment = {
  id: string; projectId: string; amount: number; currency: string; status: 'expected' | 'received';
  dueDate: string | null; receivedAt: string | null; note: string; createdAt: string;
};

const CLIENT_PROJECT_COLUMNS = 'id, title, client, source, external_project_id AS externalProjectId, status, deadline, value, currency, created_at AS createdAt';
const PAYMENT_COLUMNS = 'id, project_id AS projectId, amount, currency, status, due_date AS dueDate, received_at AS receivedAt, note, created_at AS createdAt';

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
    this.backfillBidOutcomes();
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

  recordSubmittedBid(input: { projectId: string; bidId: string; amount: number | null; currency: string | null; submittedAt: string }): BidOutcome {
    this.sqlite.prepare(`INSERT OR IGNORE INTO bid_results (project_id, bid_id, amount, currency, submitted_at)
      VALUES (?, ?, ?, ?, ?)`).run(input.projectId, input.bidId, input.amount, input.currency, input.submittedAt);
    return this.listBidOutcomes(input.projectId)[0]!;
  }

  listBidOutcomes(projectId?: string): BidOutcome[] {
    const query = projectId
      ? 'SELECT project_id AS projectId, bid_id AS bidId, amount, currency, submitted_at AS submittedAt, award_status AS awardStatus, outcome, checked_at AS checkedAt FROM bid_results WHERE project_id = ? ORDER BY submitted_at DESC'
      : 'SELECT project_id AS projectId, bid_id AS bidId, amount, currency, submitted_at AS submittedAt, award_status AS awardStatus, outcome, checked_at AS checkedAt FROM bid_results ORDER BY submitted_at DESC';
    return (projectId ? this.sqlite.prepare(query).all(projectId) : this.sqlite.prepare(query).all()) as BidOutcome[];
  }

  updateBidOutcome(projectId: string, input: { awardStatus: string | null; outcome: string; checkedAt: string }): BidOutcome {
    this.sqlite.prepare(`UPDATE bid_results SET award_status = ?, outcome = ?, checked_at = ? WHERE project_id = ?`)
      .run(input.awardStatus, input.outcome, input.checkedAt, projectId);
    return this.listBidOutcomes(projectId)[0]!;
  }

  backfillBidOutcomes(): number {
    const rows = this.sqlite.prepare(`SELECT resource_id AS projectId, reason, created_at AS createdAt FROM audit_events
      WHERE type = 'marketplace.production.submit_bid' AND status = 'recorded' AND reason GLOB '*ID hasil: *' ORDER BY created_at ASC`).all() as Array<{ projectId: string; reason: string; createdAt: string }>;
    const insert = /ID hasil: (\d+)/;
    for (const row of rows) {
      const bidId = row.reason.match(insert)?.[1];
      if (bidId) this.recordSubmittedBid({ projectId: row.projectId, bidId, amount: null, currency: null, submittedAt: row.createdAt });
    }
    return rows.length;
  }

  upsertClientThreads(rows: ClientThread[]) {
    const statement = this.sqlite.prepare(`INSERT INTO client_threads (thread_id, project_id, last_sender_id, last_message_at, preview, synced_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(thread_id) DO UPDATE SET project_id = excluded.project_id, last_sender_id = excluded.last_sender_id,
      last_message_at = excluded.last_message_at, preview = excluded.preview, synced_at = excluded.synced_at`);
    const upsert = this.sqlite.transaction((items: ClientThread[]) => {
      for (const row of items) statement.run(row.threadId, row.projectId, row.lastSenderId, row.lastMessageAt, row.preview, row.syncedAt);
    });
    upsert(rows);
  }

  listClientThreads(): ClientThread[] {
    return this.sqlite.prepare(`SELECT thread_id AS threadId, project_id AS projectId, last_sender_id AS lastSenderId, last_message_at AS lastMessageAt,
      preview, synced_at AS syncedAt FROM client_threads ORDER BY last_message_at DESC`).all() as ClientThread[];
  }

  listClientProjects(): ClientProject[] {
    return this.sqlite.prepare(`SELECT ${CLIENT_PROJECT_COLUMNS} FROM client_projects ORDER BY created_at DESC`).all() as ClientProject[];
  }

  getClientProject(id: string): ClientProject | undefined {
    return this.sqlite.prepare(`SELECT ${CLIENT_PROJECT_COLUMNS} FROM client_projects WHERE id = ?`).get(id) as ClientProject | undefined;
  }

  /** Returns the new project, or undefined when a project for the same external id already exists. */
  createClientProject(input: Omit<ClientProject, 'id' | 'createdAt'>): ClientProject | undefined {
    const id = randomUUID();
    const result = this.sqlite.prepare(`INSERT OR IGNORE INTO client_projects (id, title, client, source, external_project_id, status, deadline, value, currency, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, input.title, input.client, input.source, input.externalProjectId, input.status, input.deadline, input.value, input.currency, new Date().toISOString());
    return result.changes ? this.getClientProject(id) : undefined;
  }

  updateClientProject(id: string, patch: Partial<Pick<ClientProject, 'status' | 'deadline' | 'value'>>): ClientProject | undefined {
    const current = this.getClientProject(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    this.sqlite.prepare('UPDATE client_projects SET status = ?, deadline = ?, value = ? WHERE id = ?').run(next.status, next.deadline, next.value, id);
    return this.getClientProject(id);
  }

  listPayments(): Payment[] {
    return this.sqlite.prepare(`SELECT ${PAYMENT_COLUMNS} FROM payments ORDER BY created_at DESC`).all() as Payment[];
  }

  createPayment(input: Omit<Payment, 'id' | 'createdAt'>): Payment {
    const id = randomUUID();
    this.sqlite.prepare(`INSERT INTO payments (id, project_id, amount, currency, status, due_date, received_at, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, input.projectId, input.amount, input.currency, input.status, input.dueDate, input.receivedAt, input.note, new Date().toISOString());
    return this.sqlite.prepare(`SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = ?`).get(id) as Payment;
  }

  markPaymentReceived(id: string, receivedAt: string): Payment | undefined {
    const result = this.sqlite.prepare("UPDATE payments SET status = 'received', received_at = ? WHERE id = ?").run(receivedAt, id);
    return result.changes ? this.sqlite.prepare(`SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = ?`).get(id) as Payment : undefined;
  }

  skipReasonSummary(sinceIso: string): SkipReasonSummary[] {
    return this.sqlite.prepare(`SELECT reason, COUNT(*) AS total,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS recent
      FROM audit_events WHERE type = 'autopilot.bid_skipped' GROUP BY reason ORDER BY total DESC`).all(sinceIso) as SkipReasonSummary[];
  }

  countAuditByStatus(status: AuditEvent['status']): number {
    return (this.sqlite.prepare('SELECT COUNT(*) AS total FROM audit_events WHERE status = ?').get(status) as { total: number }).total;
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
