import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as tables from './schema.js';

export function createDatabase(filename = ':memory:') {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma('foreign_keys = ON');
  if (filename !== ':memory:') sqlite.pragma('journal_mode = WAL');
  const migrationDirectory = new URL('../migrations/', import.meta.url);
  for (const migration of readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(migration, migrationDirectory), 'utf8'));
  }
  const db = drizzle(sqlite, { schema: tables });
  return { sqlite, db };
}

export type WorkspaceDatabase = ReturnType<typeof createDatabase>;
