-- ============================================================================
-- Freelancer Virtual House (FVH) - Complete Supabase / PostgreSQL Schema
-- Consolidated Migration Script for pgAdmin 4 Query Tool
-- Target Schema: fvh
-- Safe & Idempotent: Uses IF NOT EXISTS, safe RLS, and role existence checks
-- ============================================================================

-- 1. Schema setup
CREATE SCHEMA IF NOT EXISTS fvh;
SET search_path TO fvh, public;

-- 2. Core Workspace & Autonomy Policy Tables
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_profiles (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  profile_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS autonomy_policies (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  policy_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 3. Projects & Bidding Pipeline
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  project_json TEXT NOT NULL,
  pipeline_status TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  score_factors_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  UNIQUE(platform, external_id)
);

CREATE TABLE IF NOT EXISTS bid_drafts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  draft_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  policy_version INTEGER,
  payload_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bid_results (
  project_id TEXT PRIMARY KEY,
  bid_id TEXT NOT NULL,
  amount DOUBLE PRECISION,
  currency TEXT,
  submitted_at TEXT NOT NULL,
  award_status TEXT,
  outcome TEXT NOT NULL DEFAULT 'pending',
  checked_at TEXT
);

CREATE TABLE IF NOT EXISTS client_threads (
  thread_id TEXT PRIMARY KEY,
  project_id TEXT,
  last_sender_id TEXT NOT NULL,
  last_message_at TEXT NOT NULL,
  preview TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS client_projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  client TEXT NOT NULL,
  source TEXT NOT NULL,
  external_project_id TEXT,
  status TEXT NOT NULL,
  deadline TEXT,
  value DOUBLE PRECISION,
  currency TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES client_projects(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  due_date TEXT,
  received_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legacy_bid_outcomes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT NOT NULL,
  policy_version INTEGER,
  created_at TEXT NOT NULL
);

-- 4. Knowledge Hub
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  reference_url TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED
);

-- 5. Operations & Outbox (Floor Two)
CREATE TABLE IF NOT EXISTS operation_documents (
  kind TEXT NOT NULL CHECK (kind IN ('client','progress','task','invoice','identity','briefing','calendar-map')),
  id TEXT NOT NULL,
  document JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id)
);

CREATE TABLE IF NOT EXISTS operation_outbox (
  id TEXT PRIMARY KEY,
  event_key TEXT UNIQUE NOT NULL,
  project_id TEXT NOT NULL REFERENCES client_projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('progress','payment','reminder')),
  phone TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','uncertain','canceled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  provider_id TEXT,
  reason TEXT
);

-- 6. Office Learning State
CREATE TABLE IF NOT EXISTS office_learning_state (
  id TEXT PRIMARY KEY CHECK (id = 'office'),
  document JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Missions & Leases
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('hermes_kanban','opportunity','inbox','client_operations','payment','deadline','knowledge')),
  source_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','in_progress','blocked','completed','canceled')),
  priority TEXT NOT NULL CHECK (priority IN ('low','normal','high','urgent')),
  due_at TIMESTAMPTZ,
  assigned_to TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 2048),
  blocker TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);

CREATE TABLE IF NOT EXISTS mission_leases (
  mission_id TEXT PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE,
  claimant TEXT NOT NULL CHECK (claimant ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'),
  lease_id TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL,
  lease_until TIMESTAMPTZ NOT NULL CHECK (lease_until > claimed_at)
);

-- 8. Daily Priorities (one summary per WIB day)
CREATE TABLE IF NOT EXISTS daily_priorities (
  day DATE PRIMARY KEY,
  summary JSONB NOT NULL CHECK (jsonb_typeof(summary) = 'object' AND octet_length(summary::text) <= 65536),
  generated_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Message Intelligence (client message snapshots and analyses)
CREATE TABLE IF NOT EXISTS message_snapshots (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  project_id TEXT,
  client_project_id TEXT,
  link_status TEXT NOT NULL CHECK (link_status IN ('linked','unlinked','ambiguous')),
  body TEXT NOT NULL CHECK (char_length(body) <= 20000),
  completeness TEXT NOT NULL CHECK (completeness IN ('complete','truncated','unknown')),
  completeness_reason TEXT,
  source_version TEXT NOT NULL UNIQUE CHECK (char_length(source_version) = 64),
  captured_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS message_analyses (
  analysis_id TEXT PRIMARY KEY,
  source_version TEXT NOT NULL UNIQUE REFERENCES message_snapshots(source_version) ON DELETE CASCADE,
  contract_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','blocked')),
  classification TEXT CHECK (classification IS NULL OR classification IN ('feature','bug','question','scope_change','unknown')),
  summary TEXT,
  requirements JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(requirements) = 'array' AND octet_length(requirements::text) <= 16384),
  questions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(questions) = 'array' AND octet_length(questions::text) <= 8192),
  reply_draft TEXT,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Indexes
CREATE INDEX IF NOT EXISTS idx_projects_pipeline ON projects(pipeline_status, score DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_type_resource ON audit_events(type, resource_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON knowledge_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON knowledge_chunks USING GIN (content_tsv);
CREATE INDEX IF NOT EXISTS idx_drafts_project ON bid_drafts(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_projects_external ON client_projects(external_project_id) WHERE external_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS operation_documents_updated_idx ON operation_documents(kind, updated_at DESC);
CREATE INDEX IF NOT EXISTS operation_outbox_pending_idx ON operation_outbox(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS missions_status_due_idx ON missions (status, due_at);
CREATE INDEX IF NOT EXISTS missions_assignee_due_idx ON missions (assigned_to, due_at);
CREATE INDEX IF NOT EXISTS mission_leases_until_idx ON mission_leases (lease_until);
CREATE INDEX IF NOT EXISTS message_snapshots_thread_idx ON message_snapshots (thread_id, message_id);
CREATE INDEX IF NOT EXISTS message_snapshots_captured_idx ON message_snapshots (captured_at);
CREATE INDEX IF NOT EXISTS message_analyses_status_idx ON message_analyses (status, started_at);

-- 11. Row Level Security (RLS) & Permission Revocations
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'workspaces',
    'service_profiles',
    'autonomy_policies',
    'projects',
    'bid_drafts',
    'audit_events',
    'knowledge_sources',
    'knowledge_chunks',
    'bid_results',
    'client_threads',
    'client_projects',
    'payments',
    'legacy_bid_outcomes',
    'operation_documents',
    'operation_outbox',
    'office_learning_state',
    'missions',
    'mission_leases',
    'daily_priorities',
    'message_snapshots',
    'message_analyses'
  ];
BEGIN
  FOREACH t IN ARRAY tbls
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated', t);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA fvh FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA fvh FROM authenticated;
  END IF;
END $$;

-- 12. Verification Output for pgAdmin Query Tool
SELECT
  tablename AS table_name,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'fvh'
ORDER BY tablename;
