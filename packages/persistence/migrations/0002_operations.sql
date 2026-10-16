SET search_path TO fvh;
CREATE TABLE IF NOT EXISTS operation_documents (
  kind TEXT NOT NULL CHECK (kind IN ('client','progress','task','invoice','identity','briefing','calendar-map')),
  id TEXT NOT NULL,
  document JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind,id)
);
CREATE INDEX IF NOT EXISTS operation_documents_updated_idx ON operation_documents(kind,updated_at DESC);
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
CREATE INDEX IF NOT EXISTS operation_outbox_pending_idx ON operation_outbox(created_at) WHERE status='pending';
ALTER TABLE operation_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE operation_outbox ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON operation_documents,operation_outbox FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON operation_documents,operation_outbox FROM authenticated; END IF;
END $$;
