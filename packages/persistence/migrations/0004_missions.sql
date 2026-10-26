SET search_path TO fvh;

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

CREATE INDEX IF NOT EXISTS missions_status_due_idx ON missions (status, due_at);
CREATE INDEX IF NOT EXISTS missions_assignee_due_idx ON missions (assigned_to, due_at);
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON missions FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON missions FROM authenticated; END IF;
END $$;
