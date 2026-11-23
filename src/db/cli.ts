import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createAdminClient, hasCloudSqlAdminEnv } from './index.js';
import { migrate, migrationFolder, readMigrations } from './migrate.js';

function quoteIdentifier(identifier: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(identifier)) {
    throw new Error(`Invalid PostgreSQL role identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function grantRuntimeSchemaAccess(client: pg.Client, runtimeUser: string) {
  const role = quoteIdentifier(runtimeUser);
  await client.query(`
    GRANT USAGE ON SCHEMA ck TO ${role};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ck TO ${role};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ck TO ${role};
    ALTER DEFAULT PRIVILEGES IN SCHEMA ck GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role};
    ALTER DEFAULT PRIVILEGES IN SCHEMA ck GRANT USAGE, SELECT ON SEQUENCES TO ${role};
  `);
}

async function run() {
  let client: pg.Client;
  const usingCloudSql = hasCloudSqlAdminEnv(process.env);
  if (usingCloudSql) {
    client = createAdminClient();
  } else {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Set Cloud SQL admin variables (SQL_HOST, SQL_DB_NAME, SQL_ADMIN_USER, SQL_ADMIN_PASSWORD) or DATABASE_URL first.');
    }
    client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });
  }

  const migrations = await readMigrations(fileURLToPath(migrationFolder));
  try {
    await client.connect();
    const result = await migrate(client, migrations);
    const runtimeUser = process.env.SQL_USER?.trim();
    const adminUser = process.env.SQL_ADMIN_USER?.trim();
    if (usingCloudSql && runtimeUser && runtimeUser !== adminUser) {
      await grantRuntimeSchemaAccess(client, runtimeUser);
    }
    console.log(JSON.stringify(result));
  } finally {
    await client.end();
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
