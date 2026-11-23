import pg from 'pg';
import { createAdminClient, hasCloudSqlAdminEnv } from '../db/index.js';
import { seedCatalog } from './seed.js';
import { baseCatalog } from './base-data.js';

async function run() {
  let client: pg.Client;
  if (hasCloudSqlAdminEnv(process.env)) {
    client = createAdminClient();
  } else {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Set Cloud SQL admin variables (SQL_HOST, SQL_DB_NAME, SQL_ADMIN_USER, SQL_ADMIN_PASSWORD) or DATABASE_URL first.');
    }
    client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });
  }

  try {
    await client.connect();
    console.log(JSON.stringify(await seedCatalog(client, baseCatalog)));
  } finally {
    await client.end();
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
