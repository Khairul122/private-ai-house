SET search_path TO fvh;

CREATE TABLE IF NOT EXISTS daily_priorities (
  day DATE PRIMARY KEY,
  summary JSONB NOT NULL CHECK (jsonb_typeof(summary) = 'object' AND octet_length(summary::text) <= 65536),
  generated_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE daily_priorities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON daily_priorities FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON daily_priorities FROM authenticated; END IF;
END $$;
