SET search_path TO fvh;

-- A candidate task is the owner-reviewable step between a client message analysis and a local mission.
-- It never sends anything and never executes code; it only records what the owner still has to approve.
CREATE TABLE IF NOT EXISTS candidate_tasks (
  id TEXT PRIMARY KEY,
  source_version TEXT NOT NULL UNIQUE REFERENCES message_snapshots(source_version) ON DELETE CASCADE,
  client_project_id TEXT NOT NULL,
  project_title TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('feature','bug','question','scope_change','unknown')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  objective TEXT NOT NULL CHECK (char_length(objective) <= 2000),
  requirements JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(requirements) = 'array' AND octet_length(requirements::text) <= 16384),
  acceptance_criteria JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(acceptance_criteria) = 'array' AND octet_length(acceptance_criteria::text) <= 16384),
  questions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(questions) = 'array' AND octet_length(questions::text) <= 8192),
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dependencies) = 'array' AND octet_length(dependencies::text) <= 4096),
  scope_status TEXT NOT NULL CHECK (scope_status IN ('needs_confirmation','confirmed','rejected','converted')),
  scope_note TEXT,
  analysis_mission_id TEXT REFERENCES missions(id) ON DELETE SET NULL,
  converted_mission_id TEXT REFERENCES missions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS candidate_tasks_status_idx ON candidate_tasks (scope_status, created_at);
CREATE INDEX IF NOT EXISTS candidate_tasks_project_idx ON candidate_tasks (client_project_id);
CREATE UNIQUE INDEX IF NOT EXISTS candidate_tasks_converted_idx ON candidate_tasks (converted_mission_id) WHERE converted_mission_id IS NOT NULL;

ALTER TABLE candidate_tasks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON candidate_tasks FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON candidate_tasks FROM authenticated;
  END IF;
END $$;
