// One-off: copy .local/freelancer-virtual-house.sqlite into the Supabase Postgres from DATABASE_URL (.env).
// Re-runnable: rows are inserted with ON CONFLICT DO NOTHING, except the three singleton settings tables, which the source overwrites.
// Stop the app first (pnpm private:stop). Prints row counts only, never values or credentials.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { createDatabase } from '../packages/persistence/src/database.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sqlitePath = join(root, '.local', 'freelancer-virtual-house.sqlite');
const envPath = join(root, '.env');

const url = (process.env.DATABASE_URL ?? (existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')).DATABASE_URL : '') ?? '').trim();
if (!url || url.includes('[YOUR-PASSWORD]')) throw new Error('DATABASE_URL belum diisi dengan password asli di .env.');
if (!existsSync(sqlitePath)) throw new Error(`File SQLite tidak ditemukan: ${sqlitePath}`);

// Parents before children (foreign keys). [sqlite table, postgres table, conflict target or null for DO NOTHING]
const TABLES = [
  ['workspaces', 'workspaces', null],
  ['service_profiles', 'service_profiles', 'workspace_id'],
  ['autonomy_policies', 'autonomy_policies', 'workspace_id'],
  ['projects', 'projects', null],
  ['bid_drafts', 'bid_drafts', null],
  ['audit_events', 'audit_events', null],
  ['knowledge_sources', 'knowledge_sources', null],
  ['knowledge_chunks', 'knowledge_chunks', null],
  ['bid_results', 'bid_results', null],
  ['client_threads', 'client_threads', null],
  ['client_projects', 'client_projects', null],
  ['payments', 'payments', null],
  ['bid_outcomes', 'legacy_bid_outcomes', null],
];

const backupDir = join(root, '.local', 'backup');
mkdirSync(backupDir, { recursive: true });
const backup = join(backupDir, `freelancer-virtual-house-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
copyFileSync(sqlitePath, backup);
console.log('Cadangan SQLite:', backup);

const source = new DatabaseSync(sqlitePath, { readOnly: true });
const target = await createDatabase(url);
let mismatch = false;
try {
  for (const [from, to, conflict] of TABLES) {
    const columns = source.prepare(`PRAGMA table_info("${from}")`).all().map((column) => column.name);
    const rows = source.prepare(`SELECT * FROM "${from}"`).all();
    const batchSize = Math.max(1, Math.floor(30_000 / columns.length));
    await target.transaction(async (tx) => {
      for (let start = 0; start < rows.length; start += batchSize) {
        const batch = rows.slice(start, start + batchSize);
        const params = [];
        const values = batch.map((row) => `(${columns.map((column) => { params.push(row[column] ?? null); return `$${params.length}`; }).join(', ')})`);
        const onConflict = conflict
          ? `ON CONFLICT (${conflict}) DO UPDATE SET ${columns.filter((column) => column !== conflict).map((column) => `${column} = excluded.${column}`).join(', ')}`
          : 'ON CONFLICT DO NOTHING';
        await tx.query(`INSERT INTO ${to} (${columns.join(', ')}) VALUES ${values.join(', ')} ${onConflict}`, params);
      }
    });
    const [{ total }] = await target.query(`SELECT COUNT(*)::int AS total FROM ${to}`);
    const ok = total >= rows.length;
    mismatch ||= !ok;
    console.log(`${ok ? 'OK  ' : 'GAGAL'} ${from.padEnd(18)} sqlite=${rows.length} postgres=${total}`);
  }
} finally {
  source.close();
  await target.close();
}
if (mismatch) {
  console.error('Jumlah baris tidak cocok.');
  process.exit(1);
}
console.log('Migrasi selesai.');
