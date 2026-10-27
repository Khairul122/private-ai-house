-- Postgres. Additive only: IF NOT EXISTS, no DROP/ALTER on tables holding data.
-- Own schema so nothing mixes with other projects in the same database.
CREATE SCHEMA IF NOT EXISTS fvh;
SET search_path TO fvh;

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

-- Archive of the old SQLite `bid_outcomes` decision log (not part of the current schema; do not reuse the name).
CREATE TABLE IF NOT EXISTS legacy_bid_outcomes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT NOT NULL,
  policy_version INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_pipeline ON projects(pipeline_status, score DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_type_resource ON audit_events(type, resource_id);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON knowledge_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_chunks_tsv ON knowledge_chunks USING GIN (content_tsv);
CREATE INDEX IF NOT EXISTS idx_drafts_project ON bid_drafts(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_projects_external ON client_projects(external_project_id) WHERE external_project_id IS NOT NULL;

-- Server-only access over a direct Postgres connection: RLS on, no policies, no Data API grants.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['workspaces','service_profiles','autonomy_policies','projects','bid_drafts','audit_events',
    'knowledge_sources','knowledge_chunks','bid_results','client_threads','client_projects','payments','legacy_bid_outcomes']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM anon, authenticated', t);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA fvh FROM anon, authenticated;
  END IF;
END $$;
