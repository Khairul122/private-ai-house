import { readFileSync, readdirSync } from 'node:fs';
import pg, { type PoolConfig } from 'pg';

export type Row = Record<string, unknown>;

export interface Queryable {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends Queryable {
  exec(text: string): Promise<void>;
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface DatabaseOptions {
  autoMigrate?: boolean;
}

/**
 * Mask credentials in database connection string for safe logging and diagnostics.
 */
export function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '[unparseable-url]';
  }
}

/**
 * Builds PostgreSQL pool configuration for local or remote PostgreSQL connection.
 */
export function buildPostgresPoolConfig(url: string): PoolConfig {
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const ssl = isLocal
    ? undefined
    : {
        rejectUnauthorized: false,
      };

  return {
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    options: '-c search_path=fvh',
    application_name: 'fvh-server',
    ...(ssl ? { ssl } : {}),
  };
}

/**
 * Wraps a pg.Pool or pg.PoolClient into the Queryable interface.
 */
export function wrapQueryable(target: pg.Pool | pg.PoolClient): Queryable {
  return {
    query: async <T = Row>(text: string, params?: unknown[]): Promise<T[]> => {
      const result = await target.query(text, params as unknown[]);
      return result.rows as T[];
    },
  };
}

/**
 * Runs SQL migration files in ascending filename order.
 * Ignores standalone or auxiliary scripts (e.g. pgAdmin scripts).
 */
export async function runMigrations(db: Database, directoryUrl?: URL): Promise<string[]> {
  const directory = directoryUrl ?? new URL('../migrations/', import.meta.url);
  const sqlFiles = readdirSync(directory)
    .filter((name) => /^\d{4}_.*\.sql$/.test(name))
    .sort();

  const applied: string[] = [];
  for (const file of sqlFiles) {
    const sql = readFileSync(new URL(file, directory), 'utf8');
    try {
      await db.exec(sql);
      applied.push(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to apply migration "${file}": ${message}`, { cause: error });
    }
  }
  return applied;
}

/**
 * Creates a PostgreSQL-backed Database instance using pg.Pool.
 */
export function createPostgresDatabase(url: string): Database {
  const poolConfig = buildPostgresPoolConfig(url);
  const pool = new pg.Pool(poolConfig);

  pool.on('error', (error) => {
    console.error('Postgres pool error:', error.message);
  });

  const queryable = wrapQueryable(pool);

  return {
    ...queryable,
    exec: async (text: string) => {
      await pool.query(text);
    },
    transaction: async <T>(fn: (tx: Queryable) => Promise<T>): Promise<T> => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(wrapQueryable(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: async () => {
      await pool.end();
    },
  };
}

/**
 * Creates an in-memory PGlite Database instance for local testing.
 */
export async function createMemoryDatabase(): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  const lite = new PGlite();
  await lite.exec('CREATE SCHEMA IF NOT EXISTS fvh; SET search_path TO fvh');

  return {
    query: async <T = Row>(text: string, params?: unknown[]) => (await lite.query<T>(text, params)).rows,
    exec: async (text: string) => {
      await lite.exec(text);
    },
    transaction: (fn) =>
      lite.transaction((tx) =>
        fn({
          query: async <T = Row>(text: string, params?: unknown[]) => (await tx.query<T>(text, params)).rows,
        })
      ),
    close: async () => {
      await lite.close();
    },
  };
}

/**
 * Main factory for Database instances.
 * Postgres when `url` is provided; otherwise an in-memory PGlite database (tests).
 */
export async function createDatabase(url?: string, options: DatabaseOptions = { autoMigrate: true }): Promise<Database> {
  const db = url ? createPostgresDatabase(url) : await createMemoryDatabase();
  if (options.autoMigrate !== false) {
    try {
      await runMigrations(db);
    } catch (error) {
      await db.close();
      throw error;
    }
  }
  return db;
}
