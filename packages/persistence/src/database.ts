import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';

export type Row = Record<string, unknown>;

export interface Queryable {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends Queryable {
  exec(text: string): Promise<void>;
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

async function migrate(db: Database) {
  const directory = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(file, directory), 'utf8'));
  }
}

function postgres(url: string): Database {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // ponytail: Supabase pooler certs are not in Node's CA store, so TLS is encrypted but not verified; pin the Supabase CA via `ssl.ca` to harden.
  const pool = new pg.Pool({ connectionString: url, max: 5, options: '-c search_path=fvh', ...(local ? {} : { ssl: { rejectUnauthorized: false } }) });
  pool.on('error', (error) => console.error('Postgres pool error:', error.message));
  const wrap = (target: pg.Pool | pg.PoolClient): Queryable => ({
    query: async <T = Row>(text: string, params?: unknown[]) => (await target.query(text, params as unknown[])).rows as T[],
  });
  return {
    ...wrap(pool),
    exec: async (text) => { await pool.query(text); },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrap(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function memory(): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  const lite = new PGlite();
  await lite.exec('CREATE SCHEMA IF NOT EXISTS fvh; SET search_path TO fvh');
  return {
    query: async <T = Row>(text: string, params?: unknown[]) => (await lite.query<T>(text, params)).rows,
    exec: async (text) => { await lite.exec(text); },
    transaction: (fn) => lite.transaction((tx) => fn({ query: async <T = Row>(text: string, params?: unknown[]) => (await tx.query<T>(text, params)).rows })),
    close: () => lite.close(),
  };
}

/** Postgres when `url` is given; otherwise an in-memory PGlite database (tests). */
export async function createDatabase(url?: string): Promise<Database> {
  const db = url ? postgres(url) : await memory();
  try {
    await migrate(db);
  } catch (error) {
    await db.close();
    throw error;
  }
  return db;
}
