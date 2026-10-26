import { randomUUID } from 'node:crypto';
import { canTransitionMission, transitionPipeline } from '@fvh/domain';
import type { AuditEvent, AutonomyPolicy, BidDraft, MissionItem, MissionLease, PipelineStatus, ProjectOpportunity } from '@fvh/domain';
import { chooseProjectsCoIdBid, evaluatePolicy, projectsCoIdDraftPolicy, projectsCoIdSettings } from '@fvh/domain';
import { claimMissionSchema, createMissionSchema, listMissionsSchema, releaseMissionLeaseSchema, renewMissionLeaseSchema, updateMissionStatusSchema } from '@fvh/contracts';
import type { ClaimMissionInput, CreateMissionInput, ListMissionsInput, ReleaseMissionLeaseInput, RenewMissionLeaseInput, UpdateMissionStatusInput } from '@fvh/contracts';
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
export type ClientProjectSource = 'freelancer' | 'direct' | 'linkedin' | 'projects_co_id' | 'other';
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
const MISSION_COLUMNS = 'id, source, source_id, kind, title, status, priority, due_at, assigned_to, payload, blocker, error, created_at, updated_at';
const MISSION_LEASE_COLUMNS = 'mission_id, claimant, lease_id, claimed_at, lease_until';

function mission(row: Record<string, unknown>): MissionItem {
  const item = camel<MissionItem>([row])[0]!;
  return {
    ...item,
    dueAt: item.dueAt ? new Date(item.dueAt).toISOString() : null,
    createdAt: new Date(item.createdAt).toISOString(),
    updatedAt: new Date(item.updatedAt).toISOString(),
  };
}

function missionLease(row: Record<string, unknown>): MissionLease {
  const lease = camel<MissionLease>([row])[0]!;
  return { ...lease, claimedAt: new Date(lease.claimedAt).toISOString(), leaseUntil: new Date(lease.leaseUntil).toISOString() };
}

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

  /** A source identity is created once. Duplicates return undefined without changing the stored item. */
  async createMission(input: CreateMissionInput): Promise<MissionItem | undefined> {
    const value = createMissionSchema.parse(input);
    const [row] = await this.database.query(`INSERT INTO missions
      (id, source, source_id, kind, title, status, priority, due_at, assigned_to, payload)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
      ON CONFLICT (source, source_id) DO NOTHING RETURNING ${MISSION_COLUMNS}`,
    [randomUUID(), value.source, value.sourceId, value.kind, value.title, value.status, value.priority,
      value.dueAt ? new Date(value.dueAt).toISOString() : null, value.assignedTo, JSON.stringify(value.payload)]);
    return row ? mission(row) : undefined;
  }

  async listMissions(filters: ListMissionsInput = {}): Promise<MissionItem[]> {
    const value = listMissionsSchema.parse(filters);
    const conditions: string[] = [];
    const params: unknown[] = [];
    const add = (column: string, operator: string, input: string | undefined) => {
      if (input === undefined) return;
      params.push(input);
      conditions.push(`${column} ${operator} $${params.length}`);
    };
    add('status', '=', value.status);
    add('source', '=', value.source);
    add('assigned_to', '=', value.assignedTo);
    add('due_at', '>=', value.dueFrom ? new Date(value.dueFrom).toISOString() : undefined);
    add('due_at', '<=', value.dueTo ? new Date(value.dueTo).toISOString() : undefined);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(value.limit, value.offset);
    const rows = await this.database.query(`SELECT ${MISSION_COLUMNS} FROM missions ${where}
      ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
      due_at ASC NULLS LAST, created_at ASC, id ASC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return rows.map(mission);
  }

  async getMissionLease(id: string): Promise<MissionLease | undefined> {
    const [row] = await this.database.query(`SELECT ${MISSION_LEASE_COLUMNS} FROM mission_leases WHERE mission_id=$1`, [id]);
    return row ? missionLease(row) : undefined;
  }

  async claimMission(id: string, input: ClaimMissionInput): Promise<{ outcome: 'claimed' | 'reclaimed'; lease: MissionLease } | undefined> {
    const value = claimMissionSchema.parse(input);
    return this.database.transaction(async tx => {
      const [available] = await tx.query("SELECT id FROM missions WHERE id=$1 AND status IN ('queued','in_progress') FOR UPDATE", [id]);
      if (!available) return undefined;
      const leaseId = randomUUID();
      const params = [id, value.claimant, leaseId, value.leaseSeconds];
      const [reclaimed] = await tx.query(`UPDATE mission_leases SET claimant=$2, lease_id=$3,
        claimed_at=clock_timestamp(), lease_until=clock_timestamp() + $4 * interval '1 second'
        WHERE mission_id=$1 AND lease_until <= clock_timestamp() RETURNING ${MISSION_LEASE_COLUMNS}`, params);
      if (reclaimed) return { outcome: 'reclaimed' as const, lease: missionLease(reclaimed) };
      const [claimed] = await tx.query(`INSERT INTO mission_leases (mission_id, claimant, lease_id, claimed_at, lease_until)
        VALUES ($1,$2,$3,clock_timestamp(),clock_timestamp() + $4 * interval '1 second')
        ON CONFLICT (mission_id) DO NOTHING RETURNING ${MISSION_LEASE_COLUMNS}`, params);
      return claimed ? { outcome: 'claimed' as const, lease: missionLease(claimed) } : undefined;
    });
  }

  async renewMissionLease(id: string, input: RenewMissionLeaseInput): Promise<MissionLease | undefined> {
    const value = renewMissionLeaseSchema.parse(input);
    const [row] = await this.database.query(`UPDATE mission_leases SET lease_until=clock_timestamp() + $4 * interval '1 second'
      WHERE mission_id=$1 AND claimant=$2 AND lease_id=$3 AND lease_until > clock_timestamp()
      RETURNING ${MISSION_LEASE_COLUMNS}`, [id, value.claimant, value.leaseId, value.leaseSeconds]);
    return row ? missionLease(row) : undefined;
  }

  async releaseMissionLease(id: string, input: ReleaseMissionLeaseInput): Promise<boolean> {
    const value = releaseMissionLeaseSchema.parse(input);
    const [row] = await this.database.query('DELETE FROM mission_leases WHERE mission_id=$1 AND claimant=$2 AND lease_id=$3 RETURNING mission_id',
      [id, value.claimant, value.leaseId]);
    return !!row;
  }

  async updateMissionStatus(id: string, input: UpdateMissionStatusInput): Promise<MissionItem | undefined> {
    const value = updateMissionStatusSchema.parse(input);
    const [current] = await this.database.query<{ status: MissionItem['status'] }>('SELECT status FROM missions WHERE id=$1', [id]);
    if (!current) return undefined;
    if (!canTransitionMission(current.status, value.status)) throw new Error('Transisi status mission tidak valid.');
    const [row] = await this.database.query(`UPDATE missions SET status=$3, blocker=$4, error=$5, updated_at=now()
      WHERE id=$1 AND status=$2 RETURNING ${MISSION_COLUMNS}`,
    [id, current.status, value.status, value.status === 'blocked' ? value.blocker ?? null : null,
      value.status === 'blocked' ? value.error ?? null : null]);
    if (!row) throw new Error('Status mission berubah bersamaan.');
    return mission(row);
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
    if (incoming.some(project => project.source !== 'freelancer')) throw new Error('Sumber proyek harus Freelancer.');
    return this.syncProjects(incoming);
  }

  async syncProjects(incoming: ProjectOpportunity[]) {
    if (incoming.length === 0) return { upserted: 0 };
    const unique = [...new Map(incoming.map((project) => [project.id, project])).values()];
    if (unique.some(p => !['freelancer', 'projects_co_id'].includes(p.source) || !p.id.startsWith(`${p.source}:`) || !/^[a-zA-Z0-9]+$/.test(p.id.slice(p.source.length + 1)))) throw new Error('Sumber atau ID proyek tidak valid.');
    await this.database.query(`
      INSERT INTO projects (id, platform, external_id, project_json, pipeline_status, score, score_factors_json, created_at)
      SELECT id, platform, external_id, project_json, 'new', 0, '[]', created_at
      FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) AS t(id, platform, external_id, project_json, created_at)
      ON CONFLICT (id) DO UPDATE SET project_json = excluded.project_json
    `, [unique.map(p => p.id), unique.map(p => p.source), unique.map(p => p.id.slice(p.source.length + 1)), unique.map(p => JSON.stringify(p)), unique.map(p => p.createdAt)]);
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

  async setPipelineStatus(id: string, status: PipelineStatus, options: { marketplaceConfirmed?: boolean } = {}) {
    await this.database.transaction(async (tx) => {
      const [row] = await tx.query<{ pipeline_status: PipelineStatus }>('SELECT pipeline_status FROM projects WHERE id = $1 FOR UPDATE', [id]);
      if (!row) return;
      const decision = transitionPipeline(row.pipeline_status, status, options);
      // Marketplace outcomes are authoritative: a bid can be won from any non-final state.
      if (!decision.ok && status !== 'won') throw new Error(`Pipeline transition ditolak: ${decision.reason}.`);
      await tx.query('UPDATE projects SET pipeline_status = $1 WHERE id = $2', [status, id]);
    });
  }

  async createDraft(draft: BidDraft) {
    await this.database.query('INSERT INTO bid_drafts (id, project_id, draft_json, created_at) VALUES ($1, $2, $3, $4)', [draft.id, draft.projectId, JSON.stringify(draft), draft.createdAt]);
    await this.setPipelineStatus(draft.projectId, 'draft_ready');
    return draft;
  }

  async createProjectsCoIdDraft(draft: BidDraft, policyVersion: number, automatic: boolean) {
    return this.database.transaction(async tx => {
      const [row] = await tx.query<{ policy_json: string }>('SELECT policy_json FROM autonomy_policies WHERE workspace_id = $1 FOR UPDATE', [WORKSPACE_ID]);
      const policy = parseJson<AutonomyPolicy>(row!.policy_json);
      const settings = projectsCoIdSettings(policy);
      if (policy.version !== policyVersion || settings.mode === 'off' || (automatic && settings.mode !== 'drafts')) throw new Error('Kebijakan berubah; draf tidak disimpan.');
      const [stored] = await tx.query<{ project_json: string; pipeline_status: PipelineStatus }>('SELECT project_json, pipeline_status FROM projects WHERE id = $1 FOR UPDATE', [draft.projectId]);
      if (!stored || !['new', 'scored'].includes(stored.pipeline_status) || (await tx.query('SELECT 1 FROM bid_drafts WHERE project_id = $1 LIMIT 1', [draft.projectId])).length) throw new Error('Proyek sudah diproses atau sudah memiliki draf.');
      const project = parseJson<ProjectOpportunity>(stored.project_json);
      const bid = chooseProjectsCoIdBid(project, settings);
      if (!bid || draft.currency !== 'IDR' || draft.proposedPrice !== bid.amount || draft.durationDays !== bid.period) throw new Error('Harga atau durasi draf tidak sesuai kebijakan IDR.');
      const now = new Date(draft.createdAt);
      const usage = await this.bidUsage(now, policy.timezone, 'projects_co_id.draft_created', tx);
      const decision = evaluatePolicy({ policy: projectsCoIdDraftPolicy(policy), project, action: 'bid.submit', capability: 'unknown', executionMode: 'simulated', confidence: draft.confidence, proposedPrice: draft.proposedPrice, dailyUsed: automatic ? usage.today : 0, weeklyUsed: automatic ? usage.week : 0, now });
      if (!decision.allowed) throw new Error(decision.reason);
      await tx.query('INSERT INTO bid_drafts (id, project_id, draft_json, created_at) VALUES ($1, $2, $3, $4)', [draft.id, draft.projectId, JSON.stringify(draft), draft.createdAt]);
      await tx.query("UPDATE projects SET pipeline_status = 'draft_ready' WHERE id = $1", [draft.projectId]);
      await tx.query(`INSERT INTO audit_events (id, type, resource_id, status, reason, policy_version, payload_hash, created_at)
        VALUES ($1, $2, $3, 'recorded', $4, $5, NULL, $6)`,
      [randomUUID(), automatic ? 'projects_co_id.draft_created' : 'projects_co_id.manual_draft_created', draft.projectId, 'Draf lokal dibuat; pemilik mengirim sendiri di situs.', policy.version, draft.createdAt]);
      return draft;
    });
  }

  async markProjectsCoIdProject(id: string, action: 'mark-sent' | 'skip' | 'won') {
    return this.database.transaction(async tx => {
      const [row] = await tx.query<{ pipeline_status: PipelineStatus; project_json: string }>("SELECT pipeline_status, project_json FROM projects WHERE id = $1 AND platform = 'projects_co_id' FOR UPDATE", [id]);
      if (!row) throw new Error('Proyek projects.co.id tidak ditemukan.');
      if (action === 'won') {
        if (row.pipeline_status === 'won') return;
        if (row.pipeline_status !== 'submitted') throw new Error('Tandai terkirim sebelum menandai menang.');
        const [draftRow] = await tx.query<{ draft_json: string }>('SELECT draft_json FROM bid_drafts WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1', [id]);
        const draft = parseJson<BidDraft>(draftRow!.draft_json);
        const project = parseJson<ProjectOpportunity>(row.project_json);
        const now = new Date();
        const deadline = new Date(now.getTime() + draft.durationDays * 86_400_000).toISOString().slice(0, 10);
        await tx.query('UPDATE projects SET pipeline_status = $1 WHERE id = $2', ['won', id]);
        await tx.query(`INSERT INTO client_projects (id, title, client, source, external_project_id, status, deadline, value, currency, created_at)
          VALUES ($1, $2, $3, 'projects_co_id', $4, 'active', $5, $6, 'IDR', $7) ON CONFLICT DO NOTHING`,
        [randomUUID(), project.title.slice(0, 150), project.clientName.slice(0, 120), id, deadline, draft.proposedPrice, now.toISOString()]);
        await tx.query(`INSERT INTO audit_events (id, type, resource_id, status, reason, policy_version, payload_hash, created_at)
          VALUES ($1, 'projects_co_id.owner_marked_won', $2, 'recorded', $3, NULL, NULL, $4)`,
        [randomUUID(), id, 'Ditandai menang oleh pemilik; proyek aktif dibuat dengan nilai draf. Tidak diverifikasi aplikasi.', now.toISOString()]);
        return;
      }
      const target = action === 'mark-sent' ? 'submitted' : 'skipped';
      if (row.pipeline_status === target) return;
      if (['submitted', 'skipped', 'won'].includes(row.pipeline_status)) throw new Error('Proyek sudah ditandai selesai.');
      if (action === 'mark-sent' && !(await tx.query('SELECT 1 FROM bid_drafts WHERE project_id = $1 LIMIT 1', [id])).length) throw new Error('Buat draf sebelum menandai terkirim.');
      await tx.query('UPDATE projects SET pipeline_status = $1 WHERE id = $2', [target, id]);
      await tx.query(`INSERT INTO audit_events (id, type, resource_id, status, reason, policy_version, payload_hash, created_at)
        VALUES ($1, $2, $3, 'recorded', $4, NULL, NULL, $5)`,
      [randomUUID(), action === 'mark-sent' ? 'projects_co_id.owner_marked_sent' : 'projects_co_id.owner_skipped', id, action === 'mark-sent' ? 'Ditandai terkirim oleh pemilik; tidak diverifikasi aplikasi' : 'Dilewati oleh pemilik.', new Date().toISOString()]);
    });
  }

  /** Newest draft of every project in one query (avoids a round trip per project against the remote database). */
  async latestDrafts(): Promise<Map<string, BidDraft>> {
    const rows = await this.database.query<{ project_id: string; draft_json: string }>('SELECT DISTINCT ON (project_id) project_id, draft_json FROM bid_drafts ORDER BY project_id, created_at DESC');
    return new Map(rows.map((row) => [row.project_id, parseJson<BidDraft>(row.draft_json)]));
  }

  /** Same rule as evaluateProject, applied to many projects in a single statement. */
  async evaluateProjects(items: Array<{ id: string; score: number; factors: unknown }>) {
    if (!items.length) return;
    await this.database.query(
      `UPDATE projects p SET score = v.score, score_factors_json = v.factors,
        pipeline_status = CASE WHEN p.pipeline_status = 'new' THEN 'scored'
          WHEN p.pipeline_status = 'scored' AND EXISTS (SELECT 1 FROM bid_drafts d WHERE d.project_id = p.id) THEN 'draft_ready'
          ELSE p.pipeline_status END
       FROM unnest($1::text[], $2::int[], $3::text[]) AS v(id, score, factors) WHERE p.id = v.id`,
      [items.map((item) => item.id), items.map((item) => item.score), items.map((item) => JSON.stringify(item.factors))]);
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

  async savePolicyIfVersion(policy: AutonomyPolicy, expectedVersion: number): Promise<boolean> {
    const rows = await this.database.query(`UPDATE autonomy_policies SET policy_json = $1, updated_at = $2
      WHERE workspace_id = $3 AND (policy_json::jsonb->>'version')::int = $4 RETURNING workspace_id`,
    [JSON.stringify(policy), new Date().toISOString(), WORKSPACE_ID, expectedVersion]);
    return rows.length === 1;
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

  async listAuditForType(type: string, limit = 50): Promise<AuditEvent[]> {
    return camel<AuditEvent>(await this.database.query('SELECT id, type, resource_id, status, reason, policy_version, payload_hash, created_at FROM audit_events WHERE type = $1 ORDER BY created_at DESC LIMIT $2', [type, limit]));
  }

  async bidUsage(now: Date, timezone: string, type: 'marketplace.production.submit_bid' | 'projects_co_id.draft_created' = 'marketplace.production.submit_bid', database: Queryable = this.database): Promise<{ today: number; week: number }> {
    const rows = await database.query<{ today: number; week: number }>(`
      SELECT COUNT(*) FILTER (WHERE local_day = ($1::timestamptz AT TIME ZONE $2)::date)::int AS today,
        COUNT(*) FILTER (WHERE date_trunc('week', local_day) = date_trunc('week', $1::timestamptz AT TIME ZONE $2))::int AS week
      FROM (SELECT (created_at::timestamptz AT TIME ZONE $2)::date AS local_day FROM audit_events
        WHERE type = $4 AND status = 'recorded' AND created_at >= $3 AND created_at <= $1) bids`,
    [now.toISOString(), timezone, new Date(now.getTime() - 9 * 86_400_000).toISOString(), type]);
    return rows[0] ?? { today: 0, week: 0 };
  }

  async autopilotDecisions(policyVersion: number): Promise<Array<{ resourceId: string; reason: string; attempted: boolean }>> {
    return camel(await this.database.query(`SELECT resource_id, reason, type = 'marketplace.production.submit_bid' AS attempted
      FROM audit_events WHERE type = 'marketplace.production.submit_bid'
        OR (type = 'autopilot.bid_skipped' AND policy_version = $1)`, [policyVersion]));
  }

  /** Audit event counts per local day (in the owner's timezone), for the agenda. */
  async auditDailySummary(timezone: string, sinceIso: string): Promise<Array<{ day: string; type: string; status: string; total: number }>> {
    return await this.database.query(
      "SELECT to_char((created_at::timestamptz AT TIME ZONE $1), 'YYYY-MM-DD') AS day, type, status, COUNT(*)::int AS total FROM audit_events WHERE created_at >= $2 GROUP BY 1, 2, 3", [timezone, sinceIso]);
  }

  /** Events of one local day, newest first; per-project skip decisions are summarized elsewhere because they are too many to list. */
  async auditForDay(timezone: string, day: string, limit = 300): Promise<AuditEvent[]> {
    const from = new Date(Date.parse(day + 'T00:00:00Z') - 86_400_000).toISOString();
    const to = new Date(Date.parse(day + 'T00:00:00Z') + 2 * 86_400_000).toISOString();
    return camel<AuditEvent>(await this.database.query(
      "SELECT id, type, resource_id, status, reason, policy_version, payload_hash, created_at FROM audit_events WHERE created_at >= $3 AND created_at < $4 AND type <> 'autopilot.bid_skipped' AND to_char((created_at::timestamptz AT TIME ZONE $1), 'YYYY-MM-DD') = $2 ORDER BY created_at DESC LIMIT $5",
      [timezone, day, from, to, limit]));
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

  async countAuditByStatus(status: AuditEvent['status'], excludeTypes: string[] = []): Promise<number> {
    const [row] = await this.database.query<{ total: number }>('SELECT COUNT(*)::int AS total FROM audit_events WHERE status = $1 AND NOT (type = ANY($2::text[]))', [status, excludeTypes]);
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

  async replaceKnowledgeSource(source: { id: string; provider: KnowledgeProvider; label: string; referenceUrl: string; updatedAt: string }, chunks: KnowledgeChunk[]) {
    await this.database.transaction(async (tx) => {
      await tx.query('DELETE FROM knowledge_sources WHERE id = $1', [source.id]);
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

  async knowledgeSourceRef(sourceId: string): Promise<string | undefined> {
    const rows = await this.database.query<{ source_ref: string }>('SELECT source_ref FROM knowledge_chunks WHERE source_id = $1 LIMIT 1', [sourceId]);
    return rows[0]?.source_ref;
  }

  async markKnowledgeChecked(sourceId: string, checkedAt: string): Promise<void> {
    await this.database.query('UPDATE knowledge_sources SET updated_at = $2 WHERE id = $1', [sourceId, checkedAt]);
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
