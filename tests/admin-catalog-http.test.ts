import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { adminCatalogHttp, adminCatalogPath } from '../src/http/admin-catalog.js';
import { catalogHttp } from '../src/http/public-catalog.js';
import { locales } from '../src/model/locales.js';
import { adminFixture } from './admin-fixture.js';
import { withHttp } from './http.js';
import { operationKey } from './identity-fixture.js';
import { withMigratedDatabase } from './postgres.js';

test('catalog administration HTTP gates staff operations and recovers failed publication across all locales', async () => {
  await withMigratedDatabase(async (client, url) => {
    const { identity, pool, publisher, deps } = await adminFixture(client, url);
    const admin = adminCatalogHttp(deps), catalog = catalogHttp(deps);
    try {
      await withHttp(async request => await admin(request) ?? catalog(request), async origin => {
        const base = origin + adminCatalogPath;
        const get = (path: string, user?: string) => fetch(base + path, { headers: user ? { Authorization: identity.bearer(user) } : {} });
        const write = (path: string, user: string, match: string | null, input: unknown,
          options: { method?: string; key?: string; cookie?: boolean; origin?: string } = {}) => fetch(base + path, {
          method: options.method ?? 'POST', body: JSON.stringify(input), headers: {
            'Content-Type': 'application/json', 'Idempotency-Key': options.key ?? operationKey(),
            ...(options.cookie ? { Cookie: identity.cookie(user) } : { Authorization: identity.bearer(user) }),
            ...(match === null ? {} : { 'If-Match': `"${match}"` }), ...(options.origin ? { Origin: options.origin } : {}),
          },
        });
        const data = async (promise: Promise<Response>) => (await (await promise).json()).data;
        assert.equal((await get('/roles')).status, 401);
        assert.equal((await get('/roles', 'owner')).status, 403);
        const itemId = randomUUID();
        const item = { itemId, kind: 'color', slug: 'moderated-color', metadata: { origin: 'original', licenseId: 'CC0-1.0',
          attribution: 'Color Kitchen', payload: { color: { space: 'srgb', components: [0.3, 0.5, 0.7], alpha: 1 } } } };
        assert.equal((await write('', 'editor', null, item)).status, 428);
        assert.equal((await write('', 'publisher', '0', item)).status, 403);
        assert.equal((await write('', 'editor', '0', item, { cookie: true })).status, 403);
        assert.equal((await write('', 'editor', '0', item, { cookie: true, origin: 'https://other.test' })).status, 403);
        const created = await write('', 'editor', '0', item, { cookie: true, origin });
        assert.equal(created.status, 201);
        let draft = (await created.json()).data;
        const revisions = `/${itemId}/revisions`, first = `${revisions}/1`;
        const review = (route: string, mode: 'publish' | 'rollback', key = operationKey(), user = 'publisher') =>
          write(route + '?locale=pt', user, draft.itemVersion, { mode, editVersion: draft.editVersion }, { key });
        const translations = (rev: number) => Promise.all(locales.map(locale => fetch(`${origin}/api/v1/catalog/color/moderated-color?locale=${locale}`)
          .then(async response => { assert.equal(response.status, rev === 0 ? 404 : 200);
            if (rev) assert.equal((await response.json()).data.entry.revision, rev); })));
        await translations(0);
        const incomplete = await review(first + '/review', 'publish');
        assert.equal(incomplete.status, 422);
        assert.equal(incomplete.headers.get('content-language'), 'pt');
        const incompleteError = (await incomplete.json()).error;
        assert.match(incompleteError.message, /traduções/);
        assert.deepEqual(incompleteError.locales, locales);
        assert.equal((await review(first + '/publication', 'publish', operationKey(), 'owner')).status, 403);
        assert.equal((await review(first + '/publication', 'publish', operationKey(), 'editor')).status, 403);
        const outdated = draft.editVersion;
        for (const locale of locales) {
          const saved = await write(first + '/translations/' + locale, 'editor', draft.editVersion,
            { title: `Color ${locale}`, summary: `Summary ${locale}`, body: null }, { method: 'PUT' });
          assert.equal(saved.status, 200);
          draft.editVersion = (await saved.json()).data.editVersion;
        }
        assert.equal((await write(revisions, 'editor', outdated, { sourceRevision: 1 })).status, 412);
        assert.equal((await write(first + '/review', 'publisher', draft.itemVersion, { mode: 'publish', editVersion: outdated })).status, 412);
        assert.equal((await review(first + '/review', 'publish')).status, 200);
        await client.query(`CREATE FUNCTION ck.reject_staff_audit_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'private fault'; END $$;
          CREATE TRIGGER reject_staff_audit_fixture BEFORE INSERT ON ck.audit_event FOR EACH ROW EXECUTE FUNCTION ck.reject_staff_audit_fixture()`);
        const key = operationKey();
        const failed = await review(first + '/publication', 'publish', key);
        assert.equal(failed.status, 503);
        assert.doesNotMatch(await failed.text(), /private fault/);
        await translations(0);
        assert.equal((await client.query('SELECT 1 FROM ck.catalog_review WHERE item_id=$1', [itemId])).rowCount, 0);
        await client.query('DROP TRIGGER reject_staff_audit_fixture ON ck.audit_event');
        const [a, b] = await Promise.all([review(first + '/publication', 'publish', key), review(first + '/publication', 'publish', key)]);
        assert.equal(a.status, 200);
        assert.equal(b.status, 200);
        assert.deepEqual(await a.json(), await b.json());
        await translations(1);

        const forked = await write(revisions, 'editor', draft.editVersion, { sourceRevision: 1 });
        assert.equal(forked.status, 201);
        draft = (await forked.json()).data;
        const second = `${revisions}/2`;
        const translated = await write(second + '/translations/fr', 'editor', draft.editVersion,
          { title: 'Couleur actualisée', summary: 'Résumé', body: null }, { method: 'PUT' });
        assert.equal(translated.status, 200);
        draft = await data(get(second, 'publisher'));
        const comparison = await data(get(second + '/comparison?base=1', 'publisher'));
        assert.equal(comparison.translations[0].after.title, 'Couleur actualisée');
        assert.equal((await review(second + '/publication', 'publish')).status, 200);
        await translations(2);
        draft = await data(get(first, 'publisher'));
        assert.equal((await review(first + '/publication', 'rollback')).status, 200);
        await translations(1);
        const audit = await data(get(`/audit?itemId=${itemId}&limit=1`, 'editor'));
        assert.deepEqual(audit.entries.map((entry: { action: string; principalId: string }) => [entry.action, entry.principalId]),
          [['catalog.rollback', publisher]]);
        const cursor = new URLSearchParams({ itemId, limit: '1', beforeTime: audit.next.occurredAt, beforeId: audit.next.eventId });
        assert.equal((await data(get('/audit?' + cursor, 'editor'))).entries[0].revision, 2);
        await client.query('UPDATE ck.catalog_staff SET inactive_at=now() WHERE principal_id=$1', [publisher]);
        assert.equal((await get(first, 'publisher')).status, 403);
      });
    } finally { await pool.end(); }
  });
});
