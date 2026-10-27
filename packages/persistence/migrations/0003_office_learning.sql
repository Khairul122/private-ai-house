SET search_path TO fvh;

CREATE TABLE IF NOT EXISTS office_learning_state (
  id TEXT PRIMARY KEY CHECK (id = 'office'),
  document JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE office_learning_state ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON office_learning_state FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON office_learning_state FROM authenticated; END IF;
END $$;
