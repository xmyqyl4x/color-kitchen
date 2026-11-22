import pg from 'pg';
import { seedCatalog } from './seed.js';
import { sampleCatalog } from './sample-data.js';

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Set DATABASE_URL to the intended development database first.');
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    console.log(JSON.stringify(await seedCatalog(client, sampleCatalog)));
  } finally {
    await client.end();
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
