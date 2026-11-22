import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { publicCatalogDetail } from '../src/catalog/public.js';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { migrate, migrationFolder, readMigrations } from '../src/db/migrate.js';
import { messages } from '../src/i18n/messages.js';
import { catalogHttp } from '../src/http/public-catalog.js';
import { locales } from '../src/model/locales.js';
import { migrationLedgerDigest } from '../src/release/evidence.js';
import { withTestDatabase } from './postgres.js';
import { withHttp } from './http.js';

const connection = new URL(process.env.COLOR_KITCHEN_TEST_DATABASE_URL ?? 'postgresql://localhost/invalid');
if (!['postgres:', 'postgresql:'].includes(connection.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname) ||
    connection.pathname !== '/color_kitchen_test' || connection.search || connection.hash) {
  throw new Error('The rehearsal requires the loopback color_kitchen_test fixture.');
}
const container = process.env.COLOR_KITCHEN_TEST_PG_CONTAINER;
if (container && !/^[a-f0-9]{12,64}$/.test(container)) throw new Error('Invalid fixture container ID.');
const migrations = await readMigrations(fileURLToPath(migrationFolder));
const head = migrations.at(-1)!;
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
const worktreeClean = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() === '';
const hash = (bytes: string | Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

function postgresCommand(command: 'pg_dump' | 'pg_restore', dbUrl: string, flags: string[], input?: Buffer) {
  const url = new URL(dbUrl);
  const name = url.pathname.slice(1);
  if (url.protocol !== connection.protocol || url.host !== connection.host || url.username !== connection.username ||
      url.password !== connection.password || !/^ck_test_[a-f0-9]{32}$/.test(name)) {
    throw new Error('Unexpected rehearsal database.');
  }
  const args = ['-h', container ? '127.0.0.1' : url.hostname.replace(/^\[|\]$/g, ''),
    '-p', container ? '5432' : url.port || '5432', '-U', decodeURIComponent(url.username), '-d', name, ...flags];
  const call = spawnSync(container ? 'docker' : command, container ? ['exec', '-i', '-e', 'PGPASSWORD', container, command, ...args] : args, {
    input, timeout: 30_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
  });
  if (call.status !== 0 || call.error) throw new Error(command + ' failed in the disposable fixture.', { cause: call.error });
  return call.stdout;
}
async function use<T>(url: string, work: (client: pg.Client) => Promise<T>) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try { return await work(client); } finally { await client.end(); }
}
async function content(client: pg.Client) {
  const catalog = [];
  for (const locale of locales) {
    const release = await publicCatalogDetail(client, 'palette', 'forest-study', locale);
    assert(release && release.entry.revision === 1);
    catalog.push({ locale, title: release.entry.title, revision: release.entry.revision });
  }
  return catalog;
}
const report = await withTestDatabase(async source => {
  const started = performance.now();
  const baseline = migrations.slice(0, -1);
  const earlier = await use(source, async client => {
    await migrate(client, baseline);
    await seedCatalog(client, sampleCatalog);
    const version = (await client.query<{ server_version: string }>('SHOW server_version')).rows[0]!.server_version;
    return { version, catalog: await content(client) };
  });
  const backup = postgresCommand('pg_dump', source, ['--format=custom', '--no-owner', '--no-privileges']);
  assert.equal(backup.subarray(0, 5).toString('ascii'), 'PGDMP');
  await use(source, async client => {
    assert.deepEqual(await migrate(client, migrations), { head: head.version, applied: [head.version] });
    assert.deepEqual(await migrate(client, migrations), { head: head.version, applied: [] });
    assert.deepEqual(await content(client), earlier.catalog);
  });
  const restoreStart = performance.now();
  await withTestDatabase(async restored => {
    assert.notEqual(restored, source);
    postgresCommand('pg_restore', restored, ['--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges'], backup);
    await use(restored, async client => {
      assert.deepEqual(await migrate(client, baseline), { head: baseline.at(-1)?.version, applied: [] });
      assert.deepEqual(await content(client), earlier.catalog);
      await withHttp(catalogHttp({ withClient: work => work(client) }), async origin => {
        for (const item of earlier.catalog) {
          const response = await fetch(origin + '/api/v1/catalog/palette/forest-study?locale=' + item.locale);
          assert.equal(response.status, 200);
          assert.equal(response.headers.get('content-language'), item.locale);
          assert.equal((await response.json()).data.entry.title, item.title);
        }
      });
      assert.deepEqual(await migrate(client, migrations), { head: head.version, applied: [head.version] });
      assert.deepEqual(await content(client), earlier.catalog);
    });
  });
  return { version: 1, target: 'disposable-postgresql', candidate: { commit, tree, worktreeClean, node: process.version },
    postgresVersion: earlier.version, baselineHead: baseline.at(-1)?.version, schemaHead: head.version,
    migrationDigest: migrationLedgerDigest(migrations),
    localeBundleDigest: hash(JSON.stringify(messages)), catalogDigest: hash(JSON.stringify(earlier.catalog)),
    locales, fixtureRollback: { restoredPreUpgradeBaseline: true, restoredHttpRead: true, reappliedCandidate: true, archiveDigest: hash(backup),
      elapsedMilliseconds: Math.round(performance.now() - restoreStart) },
    rehearsalMilliseconds: Math.round(performance.now() - started),
    ciRun: process.env.GITHUB_RUN_ID && /^\d+$/.test(process.env.GITHUB_RUN_ID) ? process.env.GITHUB_RUN_ID : null,
    stagingPromotion: 'pending-approved-environment' };
});
console.log(JSON.stringify(report, null, 2));
