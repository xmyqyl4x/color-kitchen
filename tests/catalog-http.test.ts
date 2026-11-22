import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { publishLocalizedRevision } from '../src/catalog/publication.js';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { catalogHttp } from '../src/http/public-catalog.js';
import { locales } from '../src/model/locales.js';
import { withHttp } from './http.js';
import { withMigratedDatabase } from './postgres.js';

test('HTTP catalog serves localized public content, validates filters and partitions cache validators', async () => {
  await withMigratedDatabase(async client => {
    await seedCatalog(client, sampleCatalog.slice(0, 2));
    const draftId = randomUUID();
    await client.query("INSERT INTO ck.catalog_item (item_id,kind,slug) VALUES ($1,'palette','private-draft')", [draftId]);
    const policyId = randomUUID();
    await client.query("INSERT INTO ck.catalog_item (item_id,kind,slug) VALUES ($1,'policy','privacy')", [policyId]);
    await client.query("INSERT INTO ck.catalog_revision (item_id,rev,payload,origin,license_id,attribution,effective_at) VALUES ($1,1,'{}','original','fixture','Test fixture','2026-01-01')", [policyId]);
    for (const locale of locales) await client.query('INSERT INTO ck.catalog_text VALUES ($1,1,$2,$3,$4,$5)',
      [policyId, locale, 'Title ' + locale, 'Summary ' + locale, 'Published ' + locale]);
    await publishLocalizedRevision(client, { itemId: policyId, revision: 1, itemVersion: 1, editVersion: 6 });
    await withHttp(catalogHttp({ withClient: work => work(client) }), async origin => {
      const fetchPath = (path: string, init?: RequestInit) => fetch(origin + '/api/v1' + path, init);
      const resource = '/catalog/palette/forest-study';
      for (const locale of locales) {
        const detail = await fetchPath(resource + '?locale=' + locale);
        assert.equal(detail.status, 200);
        assert.equal(detail.headers.get('content-language'), locale);
        const content = await detail.json();
        assert.equal(content.data.metadata.canonical, '/' + locale + '/palettes/forest-study');
        const bundle = await fetchPath('/locales/' + locale);
        assert.equal(bundle.status, 200);
        assert.equal(bundle.headers.get('cache-control'), 'public, max-age=300, must-revalidate');
        assert.equal((await bundle.json()).data.messages['app.title'], 'Color Kitchen');
        const policy = await fetchPath('/policies/privacy?locale=' + locale);
        assert.equal((await policy.json()).data.entry.body, 'Published ' + locale);
      }
      const french = await fetchPath(resource, { headers: { 'Accept-Language': 'fr-CA,de;q=0.5' } });
      assert.equal(french.headers.get('vary'), 'Accept-Language');
      assert.equal(french.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
      assert.equal((await french.json()).data.entry.title, 'Étude forestière');
      const tag = french.headers.get('etag')!;
      const fresh = await fetchPath(resource, { headers: { 'Accept-Language': 'fr', 'If-None-Match': 'W/' + tag } });
      assert.equal(fresh.status, 304);
      assert.equal(await fresh.text(), '');
      const german = await fetchPath(resource, { headers: { 'Accept-Language': 'de', 'If-None-Match': tag } });
      assert.equal(german.status, 200);
      assert.notEqual(german.headers.get('etag'), tag);
      await german.body?.cancel();
      const head = await fetchPath(resource + '?locale=fr', { method: 'HEAD' });
      assert.equal(head.headers.get('etag'), tag);
      assert.equal(await head.text(), '');
      const listing = await fetchPath('/catalog/palette?locale=en&limit=1&sort=popular');
      const { data } = await listing.json();
      assert.equal(data.items.length, 1);
      assert.equal(data.reason, 'measurement-disabled');
      const cursor = data.nextCursor;
      assert(cursor);
      const next = await fetchPath('/catalog/palette?locale=en&limit=1&sort=popular&cursor=' + cursor);
      assert.notEqual((await next.json()).data.items[0].entry.slug, data.items[0].entry.slug);
      for (const [path, status, code] of [
        ['/catalog/palette/private-draft', 404, 'not_found'],
        ['/catalog/palette/' + draftId, 404, 'not_found'],
        ['/locales/ja', 400, 'unsupported_locale'],
        ['/catalog/palette?locale=de&limit=1&sort=popular&cursor=' + cursor, 400, 'invalid_query'],
        ['/catalog/palette?count=999&count=4', 400, 'invalid_query'],
        ['/catalog/palette?scope=private', 400, 'invalid_query'],
      ] as const) {
        const response = await fetchPath(path);
        assert.equal(response.status, status);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await response.json(), { version: 1, error: { code } });
      }
    });
  });
});
