import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate, migrationFolder, readMigrations } from '../src/db/migrate.js';
import { withTestDatabase } from './postgres.js';

const migrations = await readMigrations(fileURLToPath(migrationFolder));
const head = migrations.at(-1)?.version;

test('a clean database applies the full migration history once', async () => {
  await withTestDatabase(async connectionString => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      assert.deepEqual(await migrate(client, migrations), {
        head, applied: migrations.map(migration => migration.version),
      });
      assert.deepEqual(await migrate(client, migrations), { head, applied: [] });
      const { rows } = await client.query('SELECT version FROM ck_migrations.applied ORDER BY version');
      assert.deepEqual(rows.map(row => row.version), migrations.map(migration => migration.version));
      console.log(`Verified clean migration and replay at schema head ${head}`);
    } finally {
      await client.end();
    }
  });
});

test('upgrade from the baseline preserves an earlier fixture and rejects changed history', async () => {
  await withTestDatabase(async connectionString => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      await migrate(client, migrations.slice(0, 1));
      await client.query("CREATE TABLE public.previous_fixture (value text); INSERT INTO public.previous_fixture VALUES ('keep')");
      await migrate(client, migrations);
      const { rows } = await client.query('SELECT value FROM public.previous_fixture');
      assert.deepEqual(rows, [{ value: 'keep' }]);
      const altered = migrations.map(migration => ({ ...migration, checksum: 'changed' }));
      await assert.rejects(migrate(client, altered), /history mismatch/);
    } finally {
      await client.end();
    }
  });
});

test('concurrent migration runners serialize and a failed batch rolls back', async () => {
  await withTestDatabase(async connectionString => {
    const clients = [new pg.Client({ connectionString }), new pg.Client({ connectionString })] as const;
    const [first, second] = clients;
    await Promise.all(clients.map(client => client.connect()));
    try {
      await assert.rejects(migrate(first, [...migrations, {
        version: '9999', filename: '9999_failure.sql', checksum: 'fixture',
        sql: 'CREATE TABLE ck.partial (id int); SELECT 1/0;',
      }]), { code: '22012' });
      assert.equal((await first.query("SELECT to_regnamespace('ck') AS schema")).rows[0].schema, null);
      const results = await Promise.all(clients.map(client => migrate(client, migrations)));
      assert.deepEqual(results.map(result => result.applied.length).sort(), [0, migrations.length]);
    } finally {
      await Promise.all(clients.map(client => client.end()));
    }
  });
});
