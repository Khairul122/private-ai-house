SET search_path TO fvh;

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

CREATE INDEX IF NOT EXISTS message_snapshots_thread_idx ON message_snapshots (thread_id, message_id);
CREATE INDEX IF NOT EXISTS message_snapshots_captured_idx ON message_snapshots (captured_at);

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

CREATE INDEX IF NOT EXISTS message_analyses_status_idx ON message_analyses (status, started_at);

ALTER TABLE message_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_analyses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON message_snapshots FROM anon;
    REVOKE ALL ON message_analyses FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON message_snapshots FROM authenticated;
    REVOKE ALL ON message_analyses FROM authenticated;
  END IF;
END $$;
