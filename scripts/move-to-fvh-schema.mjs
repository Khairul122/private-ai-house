// One-off: move this app's tables from schema public to schema fvh (keeps data, indexes, RLS). Run with the app stopped, before the next start.
// A public table is moved only if it has the app's marker column, so other projects' tables are never touched.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import pg from '../packages/persistence/node_modules/pg/lib/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const url = (process.env.DATABASE_URL ?? parseEnv(readFileSync(join(root, '.env'), 'utf8')).DATABASE_URL ?? '').trim();
if (!url || url.includes('[YOUR-PASSWORD]')) throw new Error('DATABASE_URL belum diisi.');
const MARKERS = {
  workspaces: 'name', service_profiles: 'profile_json', autonomy_policies: 'policy_json', projects: 'project_json',
  bid_drafts: 'draft_json', audit_events: 'policy_version', knowledge_sources: 'reference_url', knowledge_chunks: 'content_hash',
  bid_results: 'award_status', client_threads: 'last_sender_id', client_projects: 'external_project_id', payments: 'received_at',
  legacy_bid_outcomes: 'reason',
};
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('CREATE SCHEMA IF NOT EXISTS fvh');
  for (const [table, marker] of Object.entries(MARKERS)) {
    const has = async (schema, column) => (await client.query(
      'SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND ($3::text IS NULL OR column_name=$3)', [schema, table, column])).rowCount > 0;
    if (await has('fvh', null)) { console.log('SUDAH ', table); continue; }
    if (!(await has('public', marker))) { console.log('LEWAT ', table, '(tidak ada di public)'); continue; }
    await client.query(`ALTER TABLE public.${table} SET SCHEMA fvh`);
    console.log('PINDAH', table);
  }
} finally {
  await client.end();
}
