SET search_path TO fvh;

CREATE TABLE IF NOT EXISTS mission_leases (
  mission_id TEXT PRIMARY KEY REFERENCES missions(id) ON DELETE CASCADE,
  claimant TEXT NOT NULL CHECK (claimant ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'),
  lease_id TEXT NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL,
  lease_until TIMESTAMPTZ NOT NULL CHECK (lease_until > claimed_at)
);

CREATE INDEX IF NOT EXISTS mission_leases_until_idx ON mission_leases (lease_until);
ALTER TABLE mission_leases ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON mission_leases FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON mission_leases FROM authenticated; END IF;
END $$;
