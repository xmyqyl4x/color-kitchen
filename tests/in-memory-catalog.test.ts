import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInMemoryCatalogClient } from '../src/db/in-memory-catalog.js';
import { nearestPublishedColor, publicCatalogDetail, publicCatalogListing } from '../src/catalog/public.js';
import { catalogHttp } from '../src/http/public-catalog.js';
import { publishedDiscoveryTopics } from '../src/web/discovery-topics.js';
import { resolveCliRuntime } from '../src/http/cli-env.js';
import { webHttp } from '../src/web/http.js';

test('resolveCliRuntime handles empty placeholders and URLs with paths in development', () => {
  const warnings: string[] = [];
  const warn = (msg: string) => warnings.push(msg);

  // Blank strings from .env.example should not fail
  const blank = resolveCliRuntime({
    NODE_ENV: 'development',
    COLOR_KITCHEN_ORIGIN: '   ',
    COLOR_KITCHEN_INDEXING: '',
    PORT: '',
    HOST: '',
  }, warn);
  assert.equal(blank.runtime.origin, undefined);
  assert.equal(blank.runtime.host, '0.0.0.0');
  assert.equal(blank.runtime.port, 3000);
  assert.equal(blank.runtime.indexing, true);

  // URL with path in development gets normalized to its origin
  const withPath = resolveCliRuntime({
    NODE_ENV: 'development',
    COLOR_KITCHEN_ORIGIN: 'https://ais-dev-example.us-west1.run.app/en/palettes?q=blue',
  }, warn);
  assert.equal(withPath.runtime.origin, 'https://ais-dev-example.us-west1.run.app');

  // Unparseable placeholder in development warns and falls back to dynamic origin instead of crashing
  const placeholder = resolveCliRuntime({
    NODE_ENV: 'development',
    COLOR_KITCHEN_ORIGIN: 'https://…run.app',
  }, warn);
  assert.equal(placeholder.runtime.origin, undefined);
});

test('production startup requires a public origin and PostgreSQL connection URL', () => {
  const env = {
    NODE_ENV: 'production',
    HOST: '0.0.0.0',
    PORT: '8080',
    COLOR_KITCHEN_ORIGIN: 'https://www.color-kitchen.com',
    COLOR_KITCHEN_INDEXING: 'false',
    DATABASE_URL: 'postgresql://ck_runtime@localhost/color_kitchen?host=%2Fcloudsql%2Fexample%3Aus-west1%3Ainstance',
  };
  const prod = resolveCliRuntime(env);
  assert.equal(prod.isProduction, true);
  assert.equal(prod.runtime.origin, 'https://www.color-kitchen.com');
  assert.equal(prod.runtime.port, 8080);
  assert.equal(prod.runtime.indexing, false);
  assert.equal(prod.connectionString, env.DATABASE_URL);

  for (const origin of [undefined, '  ', 'https://www.color-kitchen.com/en']) {
    assert.throws(() => resolveCliRuntime({ ...env, COLOR_KITCHEN_ORIGIN: origin }), /COLOR_KITCHEN_ORIGIN/);
  }
  for (const database of [undefined, '  ']) {
    assert.throws(() => resolveCliRuntime({ ...env, DATABASE_URL: database }), /DATABASE_URL/);
  }

  const cloudSqlProd = resolveCliRuntime({
    ...env,
    DATABASE_URL: undefined,
    SQL_HOST: '/cloudsql/proj:us-east1:inst',
    SQL_DB_NAME: 'color_kitchen',
    SQL_USER: 'app_user',
    SQL_PASSWORD: 'secret',
  });
  assert.equal(cloudSqlProd.isProduction, true);
  assert.equal(cloudSqlProd.hasCloudSql, true);
});

test('in-memory catalog serves seeded palettes, colors, gradients, fonts, and topics', async () => {
  const client = createInMemoryCatalogClient();

  const palettes = await publicCatalogListing(client, {
    kind: 'palette',
    locale: 'en',
    now: new Date(),
    measurement: false,
    limit: 12,
  });
  assert.equal(palettes.items.length, 12);
  assert.equal(palettes.items[0]?.entry.slug, 'forest-study');
  assert.ok(palettes.nextCursor);

  const page2 = await publicCatalogListing(client, {
    kind: 'palette',
    locale: 'en',
    now: new Date(),
    measurement: false,
    limit: 12,
    cursor: palettes.nextCursor ?? undefined,
  });
  assert.ok(page2.items.length > 0);
  assert.notEqual(page2.items[0]?.entry.slug, palettes.items[0]?.entry.slug);

  const detail = await publicCatalogDetail(client, 'palette', 'forest-study', 'fr');
  assert.ok(detail);
  assert.equal(detail.entry.title, 'Étude forestière');

  const colorAlias = await publicCatalogDetail(client, 'color', 'cyan', 'en');
  assert.ok(colorAlias);
  assert.equal(colorAlias.entry.kind, 'color');

  const nearest = await nearestPublishedColor(client, 'en', '#010101');
  assert.ok(nearest);
  assert.equal(nearest.slug, 'black');

  const topics = await publishedDiscoveryTopics(client);
  assert.ok(topics.some(t => t.screen === 'palettes' && t.slug === 'earthy'));
  assert.ok(topics.some(t => t.screen === 'gradients' && t.slug === 'linear'));
});

test('webHttp and catalogHttp render all major routes cleanly against the in-memory catalog', async () => {
  const client = createInMemoryCatalogClient();
  const deps = {
    async withClient<T>(work: (db: typeof client) => Promise<T>) {
      return work(client);
    },
  };
  const web = webHttp(deps);
  const catalog = catalogHttp(deps);

  for (const path of ['/en', '/en/palette-studio', '/en/palettes', '/en/palettes/forest-study', '/en/colors', '/en/gradients', '/en/fonts', '/en/type-playground', '/en/contrast', '/en/color-guide', '/robots.txt', '/sitemap.xml']) {
    const res = await web(new Request('http://localhost:3000' + path));
    assert.equal(res.status, 200, `Expected 200 for ${path}, got ${res.status}`);
  }

  const strictCsp = (await web(new Request('http://localhost:3000/en'))).headers.get('content-security-policy') ?? '';
  assert.match(strictCsp, /frame-ancestors\s+'none'/i);

  const previewWeb = webHttp({ ...deps, allowEmbedding: true });
  const previewCsp = (await previewWeb(new Request('http://localhost:3000/en'))).headers.get('content-security-policy') ?? '';
  assert.doesNotMatch(previewCsp, /frame-ancestors\s+'none'/i);

  const apiRes = await catalog(new Request('http://localhost:3000/api/v1/catalog/palette?locale=en&limit=5'));
  assert.equal(apiRes.status, 200);
  const body = await apiRes.json() as { data: { items: unknown[] } };
  assert.equal(body.data.items.length, 5);
});

test('Google Tag (GTM-NC6J92RS) renders immediately after <head> once per page with matching CSP', async () => {
  const { approvedGoogleTagId, defaultGoogleTagId } = await import('../src/web/shell.js');
  assert.equal(defaultGoogleTagId, 'GTM-NC6J92RS');
  assert.equal(approvedGoogleTagId('GTM-NC6J92RS'), 'GTM-NC6J92RS');
  assert.equal(approvedGoogleTagId('off'), undefined);
  assert.equal(approvedGoogleTagId('false'), undefined);
  assert.equal(approvedGoogleTagId(''), undefined);
  assert.throws(() => approvedGoogleTagId('"><script>alert(1)</script>'), RangeError);

  const client = createInMemoryCatalogClient();
  const deps = {
    async withClient<T>(work: (db: typeof client) => Promise<T>) {
      return work(client);
    },
  };
  const taggedWeb = webHttp({ ...deps, googleTagId: defaultGoogleTagId });
  for (const path of ['/en', '/en/palette-studio', '/fr/palettes/forest-study', '/en/not-a-real-route']) {
    const res = await taggedWeb(new Request('https://www.color-kitchen.com' + path));
    const html = await res.text();
    const expectedHeadStart = '<head>\n    <script async src="https://www.googletagmanager.com/gtm.js?id=GTM-NC6J92RS"></script>\n    <script>\n  window.dataLayer = window.dataLayer || [];\n  function gtag(){dataLayer.push(arguments);}\n  gtag(\'js\', new Date());\n</script>';
    assert.ok(html.includes(expectedHeadStart), `Expected Google tag immediately after <head> on ${path}`);
    assert.equal(html.match(/googletagmanager\.com\/gtm\.js\?id=GTM-NC6J92RS/g)?.length, 1, `Expected exactly one Google tag on ${path}`);

    const csp = res.headers.get('content-security-policy') ?? '';
    assert.match(csp, /script-src[^;]*https:\/\/www\.googletagmanager\.com/);
    assert.match(csp, /connect-src[^;]*https:\/\/\*\.google-analytics\.com/);
    assert.doesNotMatch(csp, /unsafe-inline/i);
  }

  const untaggedWeb = webHttp(deps);
  const untaggedHtml = await (await untaggedWeb(new Request('http://localhost:3000/en'))).text();
  assert.doesNotMatch(untaggedHtml, /googletagmanager\.com/);
});
