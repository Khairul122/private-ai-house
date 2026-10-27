import { describe, expect, it } from 'vitest';
import {
  buildPostgresPoolConfig,
  createDatabase,
  maskDatabaseUrl,
  runMigrations,
} from './database.js';

describe('database clean functions', () => {
  it('masks database passwords safely in URLs', () => {
    const raw = 'postgres://postgres_user:SecretP@ss123@db.example.com:5432/postgres';
    const masked = maskDatabaseUrl(raw);
    expect(masked).not.toContain('SecretP@ss123');
    expect(masked).toContain('***');
    expect(masked).toContain('db.example.com');

    expect(maskDatabaseUrl('not a url')).toBe('[unparseable-url]');
  });

  it('builds PostgreSQL pool configuration with proper SSL and options', () => {
    const localConfig = buildPostgresPoolConfig('postgres://user:pass@localhost:5432/test');
    expect(localConfig.ssl).toBeUndefined();
    expect(localConfig.options).toBe('-c search_path=fvh');
    expect(localConfig.max).toBe(5);

    const remoteConfig = buildPostgresPoolConfig('postgres://user:pass@db.example.com:5432/test');
    expect(remoteConfig.ssl).toBeDefined();
    expect(remoteConfig.options).toBe('-c search_path=fvh');
  });

  it('creates in-memory database and executes migrations cleanly', async () => {
    const db = await createDatabase();
    try {
      const rows = await db.query<{ exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'fvh' AND table_name = 'workspaces') AS exists"
      );
      expect(rows[0]?.exists).toBe(true);

      const migrations = await runMigrations(db);
      expect(migrations.length).toBeGreaterThanOrEqual(5);
      expect(migrations).toContain('0001_init.sql');
      expect(migrations).toContain('0005_mission_leases.sql');
      expect(migrations.every((m) => !m.startsWith('pgadmin'))).toBe(true);
    } finally {
      await db.close();
    }
  });
});
