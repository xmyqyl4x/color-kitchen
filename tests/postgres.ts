import { randomUUID } from 'node:crypto';
import pg from 'pg';

export async function withTestDatabase<T>(work: (url: string) => Promise<T>): Promise<T> {
  const testUrl = process.env.COLOR_KITCHEN_TEST_DATABASE_URL;
  if (!testUrl) throw new Error('Set COLOR_KITCHEN_TEST_DATABASE_URL to a disposable PostgreSQL server.');

  const url = new URL(testUrl);
  if (url.pathname !== '/color_kitchen_test') {
    throw new Error('The fixture connection must use the color_kitchen_test database.');
  }
  const name = 'ck_test_' + randomUUID().replaceAll('-', '');
  const admin = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 10_000 });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    try {
      url.pathname = '/' + name;
      return await work(url.href);
    } finally {
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    }
  } finally {
    await admin.end();
  }
}
