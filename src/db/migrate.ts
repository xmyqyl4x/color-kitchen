import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ClientBase } from 'pg';

export type Migration = Readonly<{
  version: string;
  filename: string;
  sql: string;
  checksum: string;
}>;

export const migrationFolder = new URL('../../../db/migrations/', import.meta.url);

export async function readMigrations(folder: string): Promise<Migration[]> {
  const filenames = (await readdir(folder)).filter(name => name.endsWith('.sql')).sort();
  const versions = new Set<string>();
  const migrations: Migration[] = [];
  for (const filename of filenames) {
    const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(filename);
    const version = match?.[1];
    if (!version || version === '0000' || versions.has(version)) {
      throw new Error(`Invalid or duplicate migration version: ${filename}`);
    }
    versions.add(version);
    const sql = (await readFile(join(folder, filename), 'utf8')).replaceAll('\r\n', '\n');
    if (!sql.trim()) throw new Error(`Empty migration: ${filename}`);
    const checksum = createHash('sha256').update(sql).digest('hex');
    migrations.push({ version, filename, sql, checksum });
  }
  if (!migrations.length) throw new Error('No SQL migrations found.');
  return migrations;
}

export async function migrate(client: ClientBase, migrations: readonly Migration[]) {
  await client.query('BEGIN');
  try {
    await client.query(`
      SET LOCAL search_path = pg_catalog, pg_temp;
      SET LOCAL TIME ZONE 'UTC';
      SET LOCAL lock_timeout = '30s';
      SET LOCAL statement_timeout = '5min';
      SELECT pg_advisory_xact_lock(33351778, 1);
      CREATE SCHEMA IF NOT EXISTS ck_migrations;
      REVOKE ALL ON SCHEMA ck_migrations FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS ck_migrations.applied (
        version text PRIMARY KEY,
        filename text NOT NULL,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const { rows: applied } = await client.query<Omit<Migration, 'sql'>>(
      'SELECT version, filename, checksum FROM ck_migrations.applied ORDER BY version',
    );
    for (const [index, recorded] of applied.entries()) {
      const expected = migrations[index];
      if (!expected || recorded.version !== expected.version ||
          recorded.filename !== expected.filename || recorded.checksum !== expected.checksum) {
        throw new Error(`Migration history mismatch at ${recorded.filename}`);
      }
    }

    const pending = migrations.slice(applied.length);
    for (const migration of pending) {
      await client.query(migration.sql);
      await client.query(
        'INSERT INTO ck_migrations.applied (version, filename, checksum) VALUES ($1, $2, $3)',
        [migration.version, migration.filename, migration.checksum],
      );
    }
    await client.query('COMMIT');
    return { head: migrations.at(-1)?.version ?? null, applied: pending.map(item => item.version) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
