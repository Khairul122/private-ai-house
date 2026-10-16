import { randomUUID } from 'node:crypto';
import type { AuditEvent, AutonomyPolicy, BidDraft, PipelineStatus, ProjectOpportunity } from '@fvh/domain';
import type { KnowledgeChunk, KnowledgeProvider } from '@fvh/knowledge';
import { createDatabase, type Database, type Queryable } from './database.js';

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

const CLIENT_PROJECT_COLUMNS = 'id, title, client, source, external_project_id, status, deadline, value, currency, created_at';
const PAYMENT_COLUMNS = 'id, project_id, amount, currency, status, due_date, received_at, note, created_at';
const BID_RESULT_COLUMNS = 'project_id, bid_id, amount, currency, submitted_at, award_status, outcome, checked_at';

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
  activeHours: { start: 0, end: 24 },
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

const camelKey = (key: string) => key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

/** snake_case result columns -> camelCase properties. */
function camel<T>(rows: unknown[]): T[] {
  return rows.map((row) => Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) => [camelKey(key), value])) as T);
}

/** Prefix-match OR query for to_tsquery('simple', ...); terms are letters/digits/underscore only. */
function tsQuery(query: string): string {
  return [...new Set(query.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? [])].slice(0, 12).map((term) => `${term}:*`).join(' | ');
}

export class WorkspaceRepository {
  private constructor(private readonly database: Database) {}

  /** Opens the repository on `database` (default: in-memory PGlite, for tests) and seeds the workspace. */
  static async open(database?: Database): Promise<WorkspaceRepository> {
    const repository = new WorkspaceRepository(database ?? await createDatabase());
    await repository.seed();
    return repository;
  }

  close() {
    return this.database.close();
  }

  /** Raw SQL access for tests and one-off tooling. */
  get sql(): Queryable {
    return this.database;
  }

  private async seed() {
    const now = new Date().toISOString();
    await this.database.query('INSERT INTO workspaces (id, name, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [WORKSPACE_ID, 'Freelancer Virtual House', now]);
    await this.database.query('INSERT INTO service_profiles (workspace_id, profile_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [WORKSPACE_ID, JSON.stringify(initialProfile()), now]);
    await this.database.query('INSERT INTO autonomy_policies (workspace_id, policy_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [WORKSPACE_ID, JSON.stringify(initialPolicy()), now]);
    await this.backfillBidOutcomes();
    await this.removeFixtureProjects();
  }

  private removeFixtureProjects() {
    return this.database.transaction(async (tx) => {
      await tx.query("DELETE FROM audit_events WHERE resource_id IN (SELECT id FROM projects WHERE platform = 'fixture')");
      await tx.query("DELETE FROM bid_drafts WHERE project_id IN (SELECT id FROM projects WHERE platform = 'fixture')");
      await tx.query("DELETE FROM projects WHERE platform = 'fixture'");
    });
  }

  async listProjects(): Promise<Array<ProjectOpportunity & { pipelineStatus: PipelineStatus; score: number; factors: Array<{ key: string; label: string; points: number; value: string }> }>> {
    const rows = await this.database.query<{ project_json: string; pipeline_status: string; score: number; score_factors_json: string }>('SELECT project_json, pipeline_status, score, score_factors_json FROM projects');
    return rows.map((row) => ({
      ...parseJson<ProjectOpportunity>(row.project_json),
      pipelineStatus: row.pipeline_status as PipelineStatus,
      score: row.score,
      factors: parseJson(row.score_factors_json),
    }));
  }

  async getProject(id: string): Promise<ProjectOpportunity | undefined> {
    const [row] = await this.database.query<{ project_json: string }>('SELECT project_json FROM projects WHERE id = $1', [id]);
    return row ? parseJson<ProjectOpportunity>(row.project_json) : undefined;
  }

  async syncFreelancerProjects(incoming: ProjectOpportunity[]) {
    if (incoming.length === 0) return { upserted: 0 };
    const unique = [...new Map(incoming.map((project) => [project.id, project])).values()];
    await this.database.query(`
      INSERT INTO projects (id, platform, external_id, project_json, pipeline_status, score, score_factors_json, created_at)
      SELECT id, 'freelancer', external_id, project_json, 'new', 0, '[]', created_at
      FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS t(id, external_id, project_json, created_at)
      ON CONFLICT (id) DO UPDATE SET project_json = excluded.project_json
    `, [unique.map((p) => p.id), unique.map((p) => p.id.replace(/^freelancer:/, '')), unique.map((p) => JSON.stringify(p)), unique.map((p) => p.createdAt)]);
    return { upserted: incoming.length };
  }

  async evaluateProject(id: string, score: number, factors: unknown) {
    const [current] = await this.database.query<{ pipeline_status: string }>('SELECT pipeline_status FROM projects WHERE id = $1', [id]);
    const hasDraft = (await this.getLatestDraft(id)) !== undefined;
    const evaluatedStatus = current?.pipeline_status === 'new' ? 'scored' : current?.pipeline_status === 'scored' && hasDraft ? 'draft_ready' : undefined;
    if (evaluatedStatus) {
      await this.database.query('UPDATE projects SET score = $1, score_factors_json = $2, pipeline_status = $3 WHERE id = $4', [score, JSON.stringify(factors), evaluatedStatus, id]);
    } else {
      await this.database.query('UPDATE projects SET score = $1, score_factors_json = $2 WHERE id = $3', [score, JSON.stringify(factors), id]);
    }
  }

  async setPipelineStatus(id: string, status: PipelineStatus) {
    await this.database.query('UPDATE projects SET pipeline_status = $1 WHERE id = $2', [status, id]);
  }

  async createDraft(draft: BidDraft) {
    await this.database.query('INSERT INTO bid_drafts (id, project_id, draft_json, created_at) VALUES ($1, $2, $3, $4)', [draft.id, draft.projectId, JSON.stringify(draft), draft.createdAt]);
    await this.setPipelineStatus(draft.projectId, 'draft_ready');
    return draft;
  }

  async getLatestDraft(projectId: string): Promise<BidDraft | undefined> {
    const [row] = await this.database.query<{ draft_json: string }>('SELECT draft_json FROM bid_drafts WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1', [projectId]);
    return row ? parseJson<BidDraft>(row.draft_json) : undefined;
  }

  async getDraft(id: string): Promise<BidDraft | undefined> {
    const [row] = await this.database.query<{ draft_json: string }>('SELECT draft_json FROM bid_drafts WHERE id = $1', [id]);
    return row ? parseJson<BidDraft>(row.draft_json) : undefined;
  }

  async updateDraft(id: string, update: Pick<BidDraft, 'proposal' | 'proposedPrice'>): Promise<BidDraft | undefined> {
    const draft = await this.getDraft(id);
    if (!draft) return undefined;
    const updated = { ...draft, ...update };
    await this.database.query('UPDATE bid_drafts SET draft_json = $1 WHERE id = $2', [JSON.stringify(updated), id]);
    return updated;
  }

  async getPolicy(): Promise<AutonomyPolicy> {
    const [row] = await this.database.query<{ policy_json: string }>('SELECT policy_json FROM autonomy_policies WHERE workspace_id = $1', [WORKSPACE_ID]);
    return row ? parseJson<AutonomyPolicy>(row.policy_json) : initialPolicy();
  }

  async savePolicy(policy: AutonomyPolicy) {
    await this.database.query(`INSERT INTO autonomy_policies (workspace_id, policy_json, updated_at) VALUES ($1, $2, $3)
      ON CONFLICT (workspace_id) DO UPDATE SET policy_json = excluded.policy_json, updated_at = excluded.updated_at`, [WORKSPACE_ID, JSON.stringify(policy), new Date().toISOString()]);
  }

  async getProfile(): Promise<ServiceProfile> {
    const [row] = await this.database.query<{ profile_json: string }>('SELECT profile_json FROM service_profiles WHERE workspace_id = $1', [WORKSPACE_ID]);
    return row ? parseJson<ServiceProfile>(row.profile_json) : initialProfile();
  }

  async saveProfile(profile: ServiceProfile) {
    await this.database.query(`INSERT INTO service_profiles (workspace_id, profile_json, updated_at) VALUES ($1, $2, $3)
      ON CONFLICT (workspace_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at`, [WORKSPACE_ID, JSON.stringify(profile), new Date().toISOString()]);
  }

  async appendAudit(input: Omit<AuditEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): Promise<AuditEvent> {
    const event: AuditEvent = { ...input, id: input.id ?? randomUUID(), createdAt: input.createdAt ?? new Date().toISOString() };
    await this.database.query(`INSERT INTO audit_events (id, type, resource_id, status, reason, policy_version, payload_hash, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [event.id, event.type, event.resourceId, event.status, event.reason, event.policyVersion ?? null, event.payloadHash ?? null, event.createdAt]);
    return event;
  }

  async listAudit(limit = 50): Promise<AuditEvent[]> {
    return camel<AuditEvent>(await this.database.query('SELECT id, type, resource_id, status, reason, policy_version, payload_hash, created_at FROM audit_events ORDER BY created_at DESC LIMIT $1', [limit]));
  }

  async recordSubmittedBid(input: { projectId: string; bidId: string; amount: number | null; currency: string | null; submittedAt: string }): Promise<BidOutcome> {
    await this.database.query(`INSERT INTO bid_results (project_id, bid_id, amount, currency, submitted_at) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING`, [input.projectId, input.bidId, input.amount, input.currency, input.submittedAt]);
    return (await this.listBidOutcomes(input.projectId))[0]!;
  }

  async listBidOutcomes(projectId?: string): Promise<BidOutcome[]> {
    const rows = projectId
      ? await this.database.query(`SELECT ${BID_RESULT_COLUMNS} FROM bid_results WHERE project_id = $1 ORDER BY submitted_at DESC`, [projectId])
      : await this.database.query(`SELECT ${BID_RESULT_COLUMNS} FROM bid_results ORDER BY submitted_at DESC`);
    return camel<BidOutcome>(rows);
  }

  async updateBidOutcome(projectId: string, input: { awardStatus: string | null; outcome: string; checkedAt: string }): Promise<BidOutcome> {
    await this.database.query('UPDATE bid_results SET award_status = $1, outcome = $2, checked_at = $3 WHERE project_id = $4', [input.awardStatus, input.outcome, input.checkedAt, projectId]);
    return (await this.listBidOutcomes(projectId))[0]!;
  }

  async backfillBidOutcomes(): Promise<number> {
    const rows = await this.database.query<{ project_id: string; reason: string; created_at: string }>(`SELECT resource_id AS project_id, reason, created_at FROM audit_events
      WHERE type = 'marketplace.production.submit_bid' AND status = 'recorded' AND reason LIKE '%ID hasil: %' ORDER BY created_at ASC`);
    for (const row of rows) {
      const bidId = row.reason.match(/ID hasil: (\d+)/)?.[1];
      if (bidId) await this.recordSubmittedBid({ projectId: row.project_id, bidId, amount: null, currency: null, submittedAt: row.created_at });
    }
    return rows.length;
  }

  async upsertClientThreads(rows: ClientThread[]) {
    await this.database.transaction(async (tx) => {
      for (const row of rows) {
        await tx.query(`INSERT INTO client_threads (thread_id, project_id, last_sender_id, last_message_at, preview, synced_at)
          VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (thread_id) DO UPDATE SET project_id = excluded.project_id, last_sender_id = excluded.last_sender_id,
          last_message_at = excluded.last_message_at, preview = excluded.preview, synced_at = excluded.synced_at`,
        [row.threadId, row.projectId, row.lastSenderId, row.lastMessageAt, row.preview, row.syncedAt]);
      }
    });
  }

  async listClientThreads(): Promise<ClientThread[]> {
    return camel<ClientThread>(await this.database.query('SELECT thread_id, project_id, last_sender_id, last_message_at, preview, synced_at FROM client_threads ORDER BY last_message_at DESC'));
  }

  async listClientProjects(): Promise<ClientProject[]> {
    return camel<ClientProject>(await this.database.query(`SELECT ${CLIENT_PROJECT_COLUMNS} FROM client_projects ORDER BY created_at DESC`));
  }

  async getClientProject(id: string): Promise<ClientProject | undefined> {
    return camel<ClientProject>(await this.database.query(`SELECT ${CLIENT_PROJECT_COLUMNS} FROM client_projects WHERE id = $1`, [id]))[0];
  }

  /** Returns the new project, or undefined when a project for the same external id already exists. */
  async createClientProject(input: Omit<ClientProject, 'id' | 'createdAt'>): Promise<ClientProject | undefined> {
    const rows = await this.database.query(`INSERT INTO client_projects (id, title, client, source, external_project_id, status, deadline, value, currency, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT DO NOTHING RETURNING ${CLIENT_PROJECT_COLUMNS}`,
    [randomUUID(), input.title, input.client, input.source, input.externalProjectId, input.status, input.deadline, input.value, input.currency, new Date().toISOString()]);
    return camel<ClientProject>(rows)[0];
  }

  async updateClientProject(id: string, patch: Partial<Pick<ClientProject, 'status' | 'deadline' | 'value'>>): Promise<ClientProject | undefined> {
    const current = await this.getClientProject(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    await this.database.query('UPDATE client_projects SET status = $1, deadline = $2, value = $3 WHERE id = $4', [next.status, next.deadline, next.value, id]);
    return this.getClientProject(id);
  }

  async listPayments(): Promise<Payment[]> {
    return camel<Payment>(await this.database.query(`SELECT ${PAYMENT_COLUMNS} FROM payments ORDER BY created_at DESC`));
  }

  async createPayment(input: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment> {
    const rows = await this.database.query(`INSERT INTO payments (id, project_id, amount, currency, status, due_date, received_at, note, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${PAYMENT_COLUMNS}`,
    [randomUUID(), input.projectId, input.amount, input.currency, input.status, input.dueDate, input.receivedAt, input.note, new Date().toISOString()]);
    return camel<Payment>(rows)[0]!;
  }

  async markPaymentReceived(id: string, receivedAt: string): Promise<Payment | undefined> {
    const rows = await this.database.query(`UPDATE payments SET status = 'received', received_at = $1 WHERE id = $2 RETURNING ${PAYMENT_COLUMNS}`, [receivedAt, id]);
    return camel<Payment>(rows)[0];
  }

  async skipReasonSummary(sinceIso: string): Promise<SkipReasonSummary[]> {
    return (await this.database.query<SkipReasonSummary>(`SELECT reason, COUNT(*)::int AS total,
      COALESCE(SUM(CASE WHEN created_at >= $1 THEN 1 ELSE 0 END), 0)::int AS recent
      FROM audit_events WHERE type = 'autopilot.bid_skipped' GROUP BY reason ORDER BY total DESC`, [sinceIso]));
  }

  async countAuditByStatus(status: AuditEvent['status']): Promise<number> {
    const [row] = await this.database.query<{ total: number }>('SELECT COUNT(*)::int AS total FROM audit_events WHERE status = $1', [status]);
    return row!.total;
  }

  async hasAudit(type: string, resourceId: string): Promise<boolean> {
    return (await this.database.query('SELECT 1 FROM audit_events WHERE type = $1 AND resource_id = $2 LIMIT 1', [type, resourceId])).length > 0;
  }

  async hasAuditForPolicy(type: string, resourceId: string, policyVersion: number): Promise<boolean> {
    return (await this.database.query('SELECT 1 FROM audit_events WHERE type = $1 AND resource_id = $2 AND policy_version = $3 LIMIT 1', [type, resourceId, policyVersion])).length > 0;
  }

  claimAudit(input: { type: string; resourceId: string; policyVersion: number; payloadHash: string | null; reason: string }): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${input.type}:${input.resourceId}`]);
      if ((await tx.query('SELECT 1 FROM audit_events WHERE type = $1 AND resource_id = $2 LIMIT 1', [input.type, input.resourceId])).length > 0) return false;
      await tx.query(`INSERT INTO audit_events (id, type, resource_id, status, reason, policy_version, payload_hash, created_at)
        VALUES ($1, $2, $3, 'allowed', $4, $5, $6, $7)`,
      [randomUUID(), input.type, input.resourceId, input.reason, input.policyVersion, input.payloadHash, new Date(Date.now() - 1_000).toISOString()]);
      return true;
    });
  }

  async createKnowledgeSource(source: { id: string; provider: KnowledgeProvider; label: string; referenceUrl: string; updatedAt: string }, chunks: KnowledgeChunk[]) {
    await this.database.transaction(async (tx) => {
      await tx.query('INSERT INTO knowledge_sources (id, provider, label, reference_url, updated_at) VALUES ($1, $2, $3, $4, $5)', [source.id, source.provider, source.label, source.referenceUrl, source.updatedAt]);
      const createdAt = new Date().toISOString();
      for (let start = 0; start < chunks.length; start += 200) {
        const batch = chunks.slice(start, start + 200);
        await tx.query(`INSERT INTO knowledge_chunks (id, source_id, path, source_ref, url, content_hash, content, created_at)
          SELECT id, source_id, path, source_ref, url, content_hash, content, $8
          FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[]) AS t(id, source_id, path, source_ref, url, content_hash, content)`,
        [batch.map((c) => c.id), batch.map((c) => c.sourceId), batch.map((c) => c.path), batch.map((c) => c.sourceRef), batch.map((c) => c.url), batch.map((c) => c.contentHash), batch.map((c) => c.content), createdAt]);
      }
    });
    return (await this.listKnowledgeSources()).find((item) => item.id === source.id);
  }

  async listKnowledgeSources(): Promise<StoredKnowledgeSource[]> {
    return camel<StoredKnowledgeSource>(await this.database.query(`
      SELECT s.id, s.provider, s.label, s.reference_url, s.updated_at, COUNT(c.id)::int AS chunk_count
      FROM knowledge_sources s LEFT JOIN knowledge_chunks c ON c.source_id = s.id
      GROUP BY s.id ORDER BY s.updated_at DESC
    `));
  }

  /** `rank` is lower-is-better (negated ts_rank), matching the old bm25 ordering. */
  async searchKnowledge(query: string, limit = 5): Promise<Array<{ sourceId: string; label: string; path: string; url: string; content: string; rank: number }>> {
    const match = tsQuery(query);
    if (!match) return [];
    return camel(await this.database.query(`
      SELECT c.source_id, s.label, c.path, c.url, c.content, -ts_rank(c.content_tsv, q.query) AS rank
      FROM knowledge_chunks c
      JOIN knowledge_sources s ON s.id = c.source_id,
      to_tsquery('simple', $1) AS q(query)
      WHERE c.content_tsv @@ q.query
      ORDER BY rank LIMIT $2
    `, [match, limit]));
  }

  async deleteKnowledgeSource(id: string): Promise<boolean> {
    return (await this.database.query('DELETE FROM knowledge_sources WHERE id = $1 RETURNING id', [id])).length > 0;
  }

  async knowledgeCoverage(): Promise<{ sources: number; chunks: number }> {
    const [row] = await this.database.query<{ sources: number; chunks: number }>('SELECT COUNT(DISTINCT source_id)::int AS sources, COUNT(*)::int AS chunks FROM knowledge_chunks');
    return row!;
  }
}
