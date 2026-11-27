import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { operationsHttp } from '../src/http/operations.js';
import { listenerFromEnvironment, publicOrigin, runtimeFromEnvironment } from '../src/http/runtime-config.js';
import { webHttp } from '../src/web/http.js';
import { withHttp } from './http.js';
import { withMigratedDatabase } from './postgres.js';

test('deployment origin is explicit and independent of binding, indexing, and database tuning', () => {
  const local = runtimeFromEnvironment({ PORT: '3130' });
  assert.equal(local.host, '127.0.0.1');
  assert.equal(local.port, 3130);
  assert.equal(local.origin, undefined);
  assert.equal(local.indexing, true);
  assert.deepEqual(local.pool, { max: 10, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  assert.throws(() => runtimeFromEnvironment({ NODE_ENV: 'production' }), /COLOR_KITCHEN_ORIGIN/);
  assert.throws(() => runtimeFromEnvironment({ HOST: '0.0.0.0' }), /COLOR_KITCHEN_ORIGIN/);
  for (const invalid of ['', 'color-kitchen.com', 'file:///etc', 'https://account:secret@example.test',
    'https://example.test/path', 'https://example.test?flag', 'https://example.test/#anchor']) {
    assert.throws(() => publicOrigin(invalid), /COLOR_KITCHEN_ORIGIN/);
  }
  assert.throws(() => listenerFromEnvironment({ HOST: 'localhost:3000' }), /HOST/);
  assert.throws(() => listenerFromEnvironment({ PORT: '65536' }), /PORT/);
  assert.throws(() => runtimeFromEnvironment({ COLOR_KITCHEN_INDEXING: 'maybe' }), /COLOR_KITCHEN_INDEXING/);
  assert.throws(() => runtimeFromEnvironment({ COLOR_KITCHEN_DB_POOL_MAX: '-1' }), /COLOR_KITCHEN_DB_POOL_MAX/);
  const runtime = runtimeFromEnvironment({
    NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '8080', COLOR_KITCHEN_ORIGIN: 'https://www.color-kitchen.com/',
    COLOR_KITCHEN_INDEXING: 'false', COLOR_KITCHEN_DB_POOL_MAX: '4',
    COLOR_KITCHEN_DB_CONNECT_TIMEOUT_MS: '8000', COLOR_KITCHEN_DB_STATEMENT_TIMEOUT_MS: '9000',
  });
  assert.equal(runtime.origin, 'https://www.color-kitchen.com');
  assert.equal(runtime.port, 8080);
  assert.equal(runtime.indexing, false);
  assert.deepEqual(runtime.pool, { max: 4, connectionTimeoutMillis: 8000, statement_timeout: 9000 });
  assert.equal(listenerFromEnvironment({ HOST: '[::1]' }).host, '::1');
  assert.equal(runtimeFromEnvironment({ NODE_ENV: 'production', COLOR_KITCHEN_ORIGIN: 'http://127.0.0.1:58320' }).origin,
    'http://127.0.0.1:58320');
});

test('configured HTTPS origin controls SEO and cookies through a separate internal listener', async () => {
  const deploy = 'https://www.color-kitchen.com';
  await withMigratedDatabase(async client => {
    await seedCatalog(client, sampleCatalog);
    const dependencies = { async withClient<T>(work: (db: typeof client) => Promise<T>) { return work(client); } };
    const web = webHttp(dependencies);
    const operations = operationsHttp({ ...dependencies, consentKey: Buffer.alloc(32, 1) });
    await withHttp(async req => await operations(req) ?? web(req), async listener => {
      const headers = { Host: 'proxy.example.test', 'X-Forwarded-Host': 'proxy.example.test', 'X-Forwarded-Proto': 'http' };
      const home = await fetch(listener + '/fr', { headers });
      assert.match(home.headers.get('set-cookie')!, /; Secure/);
      const html = await home.text();
      assert(html.includes('<link rel="canonical" href="' + deploy + '/fr">'));
      assert(html.includes('<link rel="alternate" hreflang="de" href="' + deploy + '/de">'));
      assert(html.includes('<meta property="og:image" content="' + deploy + '/assets/social-card.png">'));
      assert(!html.includes(listener));
      assert(!html.includes('proxy.example.test'));
      const robots = await (await fetch(listener + '/robots.txt')).text();
      assert(robots.includes('Sitemap: ' + deploy + '/sitemap.xml'));
      const sitemap = await (await fetch(listener + '/sitemap.xml')).text();
      const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
      assert(listed.includes(deploy + '/de/palettes/forest-study'));
      assert(listed.every(url => url?.startsWith(deploy + '/')));
      const accepted = await fetch(listener + '/api/v1/consent', {
        method: 'POST', headers: { Origin: deploy, 'Content-Type': 'application/json' },
        body: JSON.stringify({ advertising: false, analytics: true }),
      });
      assert.equal(accepted.status, 200);
      assert.match(accepted.headers.get('set-cookie')!, /^__Host-ck_optional=.*; Secure/);
    }, deploy);
  });
});

test('local aliases use the actual listener port and staging indexing can be disabled', async () => {
  await withHttp(request => new Response(new URL(request.url).origin), async listener => {
    const port = new URL(listener).port;
    const result = await new Promise<string>((resolve, reject) => {
      const req = request(listener, { headers: { Host: 'localhost:' + port } }, response => {
        response.setEncoding('utf8');
        let body = '';
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve(body));
        response.on('error', reject);
      });
      req.on('error', reject).end();
    });
    assert.equal(result, 'http://localhost:' + port);
    assert.equal(await (await fetch(listener)).text(), listener);
  });
  const preview = webHttp({ indexing: false, async withClient() { throw new Error('These routes do not use PostgreSQL.'); } });
  const origin = 'https://staging.example.test';
  const home = await preview(new Request(origin + '/de'));
  assert.equal(home.status, 200);
  assert.equal(home.headers.get('x-robots-tag'), 'noindex');
  assert.match(await home.text(), /<title>Farbpaletten-Generator und Designwerkzeuge \| Color Kitchen<\/title>/);
  assert.equal((await preview(new Request(origin + '/sitemap.xml'))).status, 404);
  assert.doesNotMatch(await (await preview(new Request(origin + '/robots.txt'))).text(), /Sitemap:|Disallow: \/$/);
});
