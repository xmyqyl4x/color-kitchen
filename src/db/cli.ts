import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { migrate, migrationFolder, readMigrations } from './migrate.js';

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Set DATABASE_URL to the intended PostgreSQL database first.');

  const migrations = await readMigrations(fileURLToPath(migrationFolder));
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    console.log(JSON.stringify(await migrate(client, migrations)));
  } finally {
    await client.end();
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
