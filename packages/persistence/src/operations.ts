import { randomUUID } from 'node:crypto';
import type { OutboxMessage } from '@fvh/domain';
import type { Queryable } from './database.js';

type DocumentKind = 'client' | 'progress' | 'task' | 'invoice' | 'identity' | 'briefing' | 'calendar-map';
export class OperationsRepository {
  constructor(private readonly sql: Queryable) {}
  async dailyPriority<T>(day: string): Promise<T | null> {
    return (await this.sql.query<{ document: T }>('SELECT document FROM daily_priorities WHERE day=$1', [day]))[0]?.document ?? null;
  }
  async dailyPriorityMission(sourceId: string): Promise<{ id: string; status: string } | null> {
    return (await this.sql.query<{ id: string; status: string }>("SELECT id,status FROM missions WHERE source='client_operations' AND source_id=$1", [sourceId]))[0] ?? null;
  }
  async saveDailyPriorityWithLease<T extends { day: string; revision: number }>(missionId: string, claimant: string, leaseId: string, document: T): Promise<boolean> {
    // Lock mission, then lease, before writing; an expired claimant cannot replace a newer result.
    const rows = await this.sql.query<{ saved: boolean }>(`WITH locked_mission AS (
      SELECT id FROM missions WHERE id=$1 AND status='in_progress' FOR UPDATE
    ), valid AS (
      SELECT mission_id FROM mission_leases
      WHERE mission_id IN (SELECT id FROM locked_mission) AND claimant=$2 AND lease_id=$3 AND lease_until>clock_timestamp()
      FOR UPDATE
    ), saved AS (
      INSERT INTO daily_priorities(day,revision,document)
      SELECT $4::date,$5,$6::jsonb FROM valid
      ON CONFLICT(day) DO UPDATE SET revision=excluded.revision,document=excluded.document,updated_at=now()
      WHERE daily_priorities.revision < excluded.revision
      RETURNING day
    ), completed AS (
      UPDATE missions SET status='completed',updated_at=now()
      WHERE id=$1 AND status='in_progress' AND EXISTS (SELECT 1 FROM saved)
      RETURNING id
    ) SELECT EXISTS(SELECT 1 FROM completed) AS saved`, [missionId, claimant, leaseId, document.day, document.revision, JSON.stringify(document)]);
    return rows[0]?.saved ?? false;
  }
  async list<T>(kind: DocumentKind): Promise<T[]> {
    return (await this.sql.query<{ document: T }>('SELECT document FROM operation_documents WHERE kind=$1 ORDER BY updated_at DESC,id', [kind])).map((r) => r.document);
  }
  async get<T>(kind: DocumentKind, id: string): Promise<T | null> {
    return (await this.sql.query<{ document: T }>('SELECT document FROM operation_documents WHERE kind=$1 AND id=$2', [kind,id]))[0]?.document ?? null;
  }
  async save<T>(kind: DocumentKind, id: string, document: T) {
    await this.sql.query('INSERT INTO operation_documents(kind,id,document) VALUES($1,$2,$3::jsonb) ON CONFLICT(kind,id) DO UPDATE SET document=excluded.document,updated_at=now()', [kind,id,JSON.stringify(document)]);
    return document;
  }
  async create<T>(kind: DocumentKind, id: string, document: T) {
    const rows = await this.sql.query('INSERT INTO operation_documents(kind,id,document) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING id', [kind,id,JSON.stringify(document)]);
    return rows.length > 0;
  }
  async updateTaskIfCurrent(id:string,updatedAt:string,document:unknown) {
    return (await this.sql.query("UPDATE operation_documents SET document=$3::jsonb,updated_at=now() WHERE kind='task' AND id=$1 AND document->>'updatedAt'=$2 RETURNING id",[id,updatedAt,JSON.stringify(document)])).length>0;
  }
  async enqueue(input: Pick<OutboxMessage,'eventKey'|'projectId'|'kind'|'phone'|'text'>) {
    return (await this.sql.query('INSERT INTO operation_outbox(id,event_key,project_id,kind,phone,text) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_key) DO NOTHING RETURNING id', [randomUUID(),input.eventKey,input.projectId,input.kind,input.phone,input.text])).length > 0;
  }
  async messages(): Promise<OutboxMessage[]> {
    return this.sql.query<OutboxMessage>(`SELECT id,event_key AS "eventKey",project_id AS "projectId",kind,phone,text,status,created_at::text AS "createdAt",sent_at::text AS "sentAt",provider_id AS "providerId",reason FROM operation_outbox ORDER BY created_at DESC LIMIT 100`);
  }
  async claim(id: string) {
    return (await this.sql.query("UPDATE operation_outbox SET status='sending',reason=NULL WHERE id=$1 AND status='pending' RETURNING id", [id])).length > 0;
  }
  async pending():Promise<OutboxMessage[]> {
    return this.sql.query<OutboxMessage>(`SELECT id,event_key AS "eventKey",project_id AS "projectId",kind,phone,text,status,created_at::text AS "createdAt",sent_at::text AS "sentAt",provider_id AS "providerId",reason FROM operation_outbox WHERE status='pending' ORDER BY created_at,id LIMIT 10`);
  }
  async finish(id: string, status: OutboxMessage['status'], reason: string | null, providerId: string | null = null) {
    await this.sql.query('UPDATE operation_outbox SET status=$2,reason=$3,provider_id=$4,sent_at=CASE WHEN $2=\'sent\' THEN now() ELSE sent_at END WHERE id=$1 AND status=\'sending\'', [id,status,reason,providerId]);
  }
  async recover() {
    await this.sql.query("UPDATE operation_outbox SET status='uncertain',reason='Server terhenti saat mengirim. Periksa WhatsApp sebelum membuat pesan baru.' WHERE status='sending'");
  }
  async reconcile(id: string, status: 'sent' | 'canceled') {
    return (await this.sql.query("UPDATE operation_outbox SET status=$2,reason='Direkonsiliasi pemilik',sent_at=CASE WHEN $2='sent' THEN now() ELSE sent_at END WHERE id=$1 AND status IN ('uncertain','pending') RETURNING id", [id,status])).length > 0;
  }
}
