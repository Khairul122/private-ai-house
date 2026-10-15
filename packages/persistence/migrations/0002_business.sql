CREATE TABLE IF NOT EXISTS bid_outcomes (
  project_id TEXT PRIMARY KEY,
  bid_id TEXT NOT NULL,
  amount REAL,
  currency TEXT,
  submitted_at TEXT NOT NULL,
  award_status TEXT,
  outcome TEXT NOT NULL DEFAULT 'pending',
  checked_at TEXT
);
