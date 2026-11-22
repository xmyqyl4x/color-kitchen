import pg from 'pg';
import { catalogHttp } from './public-catalog.js';
import { httpServer } from './server.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL to a migrated Color Kitchen database.');
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Set PORT to a valid TCP port.');
const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
pool.on('error', () => console.error('An idle PostgreSQL client was disconnected.'));
const server = httpServer(catalogHttp({
  async withClient(work) {
    const client = await pool.connect();
    try { return await work(client); }
    finally { client.release(); }
  },
  measurement: process.env.COLOR_KITCHEN_MEASUREMENT === 'true',
}), process.env.COLOR_KITCHEN_ORIGIN ?? 'http://localhost:' + port);
server.listen(port, process.env.HOST ?? '127.0.0.1', () => console.log('Color Kitchen HTTP server listening on port ' + port));
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close(() => { void pool.end(); });
  });
}
