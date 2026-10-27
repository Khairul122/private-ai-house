SET search_path TO fvh;

CREATE TABLE IF NOT EXISTS inbox_message_snapshots (
  source_version TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source = 'freelancer'),
  thread_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  external_project_id TEXT,
  opportunity_id TEXT,
  client_project_id TEXT,
  link_status TEXT NOT NULL CHECK (link_status IN ('verified','unlinked','ambiguous')),
  content TEXT NOT NULL,
  completeness TEXT NOT NULL CHECK (completeness IN ('complete','truncated','unknown')),
  completeness_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS inbox_snapshots_thread_idx ON inbox_message_snapshots (thread_id, captured_at DESC);
ALTER TABLE inbox_message_snapshots ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS inbox_message_analyses (
  id TEXT PRIMARY KEY,
  source_version TEXT NOT NULL UNIQUE REFERENCES inbox_message_snapshots(source_version),
  mission_id TEXT NOT NULL UNIQUE REFERENCES missions(id),
  contract_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','blocked')),
  card_id TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  result_json JSONB,
  error TEXT
);
CREATE INDEX IF NOT EXISTS inbox_analyses_status_idx ON inbox_message_analyses (status);
ALTER TABLE inbox_message_analyses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON inbox_message_snapshots FROM anon;
    REVOKE ALL ON inbox_message_analyses FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON inbox_message_snapshots FROM authenticated;
    REVOKE ALL ON inbox_message_analyses FROM authenticated;
  END IF;
END $$;
