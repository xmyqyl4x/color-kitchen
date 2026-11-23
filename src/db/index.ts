import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

declare global {
  var _postgresPool: pg.Pool | undefined;
}

export function hasCloudSqlEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SQL_HOST && env.SQL_USER && env.SQL_PASSWORD && env.SQL_DB_NAME);
}

export function hasCloudSqlAdminEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SQL_HOST && env.SQL_ADMIN_USER && env.SQL_ADMIN_PASSWORD && env.SQL_DB_NAME);
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new pg.Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

export function createAdminClient(): pg.Client {
  return new pg.Client({
    host: process.env.SQL_HOST,
    user: process.env.SQL_ADMIN_USER,
    password: process.env.SQL_ADMIN_PASSWORD,
    database: process.env.SQL_DB_NAME,
    connectionTimeoutMillis: 15000,
  });
}

export const pool = createPool();
export const db = drizzle(pool, { schema });
