import type { ClientBase } from 'pg';

export async function inTransaction<T>(client: ClientBase, work: () => Promise<T>) {
  await client.query('BEGIN');
  try {
    const value = await work();
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
