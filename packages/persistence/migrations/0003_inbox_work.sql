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
  value REAL,
  currency TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_projects_external ON client_projects(external_project_id) WHERE external_project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES client_projects(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  due_date TEXT,
  received_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
