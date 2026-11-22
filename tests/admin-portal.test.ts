import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from 'playwright';
import { adminCatalogHttp, adminCatalogPath } from '../src/http/admin-catalog.js';
import { sessionCookieName } from '../src/http/identity.js';
import { catalogHttp } from '../src/http/public-catalog.js';
import { locales, type Locale } from '../src/model/locales.js';
import { adminText } from '../src/web/admin-text.js';
import { webHttp } from '../src/web/http.js';
import { screenTitle } from '../src/web/strings.js';
import { adminFixture } from './admin-fixture.js';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';
import { withMigratedDatabase } from './postgres.js';

const idle = (page: Page) => page.waitForFunction(() => document.querySelector('#catalog-admin')?.getAttribute('aria-busy') === null);
const form = (page: Page, field: string) => page.locator(`#admin-translation [name="${field}"]`);

async function saveTranslation(page: Page, locale: Locale, title: string) {
  await page.locator('#admin-language').selectOption(locale);
  await form(page, 'title').fill(title);
  await form(page, 'summary').fill(`Summary ${locale}`);
  await page.locator('#admin-save-translation').click();
  await idle(page);
  assert.match((await page.locator('#admin-message').textContent())!, /Saved/);
}

test('staff portal preserves conflicting edits and reviews, publishes and rolls back five-locale catalog revisions', async () => {
  await withMigratedDatabase(async (client, url) => {
    const { identity, pool, deps } = await adminFixture(client, url);
    const admin = adminCatalogHttp(deps), catalog = catalogHttp(deps), web = webHttp({ ...deps, adFrameUrl: 'https://ads.example.test/frame' });
    try {
      await withHttp(request => new URL(request.url).pathname.startsWith('/api/')
        ? admin(request).then(result => result ?? catalog(request)) : web(request), async origin => {
        for (const locale of locales) {
          const path = `${origin}/${locale}/catalog-admin`;
          const response = await fetch(path, { headers: { Authorization: identity.bearer('publisher') } });
          assert.equal(response.status, 200);
          assert.equal(response.headers.get('content-language'), locale);
          assert.equal(response.headers.get('cache-control'), 'no-store');
          assert((await response.text()).includes(screenTitle(locale, 'catalog-admin')));
        }
        const publicVersions = async (revision: number) => {
          for (const locale of locales) {
            const response = await fetch(`${origin}/api/v1/catalog/color/portal-color?locale=${locale}`);
            assert.equal(response.status, revision ? 200 : 404);
            if (revision) assert.equal((await response.json()).data.entry.revision, revision);
          }
        };
        await withBrowserPage(async editor => {
          const browser = editor.context().browser()!;
          const publisher = await browser.newPage({ viewport: { width: 360, height: 820 } });
          const requests: string[] = [], exceptions: string[] = [];
          for (const page of [editor, publisher]) {
            page.on('request', request => requests.push(request.url()));
            page.on('pageerror', error => exceptions.push(error.message));
          }
          async function login(page: Page, user: string) {
            await page.context().addCookies([{ domain: new URL(origin).hostname, path: '/', name: sessionCookieName, value: identity.token(user),
              httpOnly: true, secure: true, sameSite: 'Lax' }]);
          }
          try {
            const editorUrl = origin + '/en/catalog-admin';
            await login(editor, 'owner');
            assert.equal((await editor.goto(editorUrl))?.status(), 403);
            assert.equal(await editor.locator('#catalog-admin').count(), 0);
            await login(editor, 'editor');
            assert.equal((await editor.goto(editorUrl))?.status(), 200);
            await idle(editor);
            assert.equal(await editor.locator('meta[name=robots]').getAttribute('content'), 'noindex');
            assert.equal(await editor.locator('#admin-review').count(), 0);
            await editor.locator('summary', { hasText: adminText('en', 'newItem') }).click();
            const create = editor.locator('#admin-create');
            await create.locator('[name=kind]').selectOption('color');
            await create.locator('[name=slug]').fill('portal-color');
            await create.locator('[name=licenseId]').fill('CC0-1.0');
            await create.locator('[name=attribution]').fill('Color Kitchen');
            await create.locator('[name=payload]').fill(JSON.stringify({ color: { space: 'srgb', components: [0.3, 0.5, 0.7], alpha: 1 } }));
            await create.locator('button[type=submit]').click();
            await editor.locator('#admin-revision').waitFor({ state: 'visible' });
            await idle(editor);
            assert.equal(await editor.locator(':focus').getAttribute('id'), 'admin-item-heading');
            const itemId = new URL(editor.url()).searchParams.get('item')!;
            await saveTranslation(editor, 'en', 'Portal Blue');
            await saveTranslation(editor, 'fr', 'Bleu du portail');
            await saveTranslation(editor, 'es', 'Azul del portal');
            await saveTranslation(editor, 'de', 'Portalblau');
            assert.match((await editor.locator('#admin-coverage').textContent())!, /Português/);
            await publicVersions(0);

            await login(publisher, 'publisher');
            const portalPath = (locale: Locale, revision: number) => `${origin}/${locale}/catalog-admin?item=${itemId}&revision=${revision}`;
            await publisher.goto(portalPath('pt', 1));
            await idle(publisher);
            await publisher.locator('#admin-review').press('Enter');
            await idle(publisher);
            assert.match((await publisher.locator('#admin-message').textContent())!, /traduções.*Português/);
            assert.equal(await publisher.locator('#admin-publish').isVisible(), false);
            assert.equal(await publisher.locator('#admin-create').count(), 0);
            await publicVersions(0);

            // A second session writes first. The stale editor retains the typed values across languages and sees the saved version.
            await editor.locator('#admin-language').selectOption('fr');
            await form(editor, 'title').fill('Modification locale');
            const path = `${origin}${adminCatalogPath}/${itemId}/revisions/1`;
            const headers = { Authorization: identity.bearer('editor') };
            const before = (await (await fetch(path, { headers })).json()).data;
            const concurrent = await fetch(path + '/translations/fr', { method: 'PUT', headers: { ...headers,
              'Content-Type': 'application/json', 'If-Match': `"${before.editVersion}"` },
              body: JSON.stringify({ title: 'Texte enregistré par une autre session', summary: 'Résumé actualisé', body: null }) });
            assert.equal(concurrent.status, 200);
            await editor.locator('#admin-save-translation').click();
            await idle(editor);
            assert.match((await editor.locator('#admin-message').textContent())!, /revision has changed/);
            assert.equal(await editor.locator(':focus').getAttribute('id'), 'admin-message');
            assert.equal(await editor.locator('#admin-save-translation').isDisabled(), true);
            await editor.locator('#admin-language').selectOption('de');
            await editor.locator('#admin-language').selectOption('fr');
            assert.equal(await form(editor, 'title').inputValue(), 'Modification locale');
            await editor.locator('#admin-refresh').click();
            await idle(editor);
            assert.equal(await form(editor, 'title').inputValue(), 'Modification locale');
            assert.match((await editor.locator('#admin-current-values').textContent())!, /Texte enregistré/);
            await editor.locator('#admin-discard').click();
            assert.equal(await form(editor, 'title').inputValue(), 'Texte enregistré par une autre session');
            await saveTranslation(editor, 'pt', 'Azul do portal');
            await publisher.locator('#admin-review').click();
            await idle(publisher);
            assert.match((await publisher.locator('#admin-message').textContent())!, /revisão foi alterada/);
            await publisher.locator('#admin-refresh').click();
            await idle(publisher);
            await publisher.locator('#admin-review').click();
            await idle(publisher);
            assert.equal(await publisher.locator(':focus').getAttribute('id'), 'admin-publish');
            await publisher.keyboard.press('Enter');
            await idle(publisher);
            assert.match((await publisher.locator('#admin-version').textContent())!, /1 · Publicado.*Revisão publicada1/);
            assert(await publisher.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
            await publicVersions(1);

            await editor.reload();
            await idle(editor);
            await editor.locator('#admin-fork').click();
            await idle(editor);
            await saveTranslation(editor, 'en', 'Deep Portal Blue');
            assert.match((await editor.locator('#admin-coverage').textContent())!, /English source changed.*Deutsch/);
            await editor.locator('summary', { hasText: adminText('en', 'metadata') }).click();
            await editor.locator('#admin-metadata [name=attribution]').fill('Color Kitchen editorial team');
            await editor.locator('#admin-save-metadata').click();
            await idle(editor);
            assert.equal(await editor.locator('#admin-message').textContent(), adminText('en', 'saved'));
            await editor.locator('summary', { hasText: adminText('en', 'compare') }).click();
            await editor.locator('#admin-compare button').click();
            await idle(editor);
            assert.match((await editor.locator('#admin-diff').textContent())!, /Portal Blue.*Deep Portal Blue/);
            assert.match((await editor.locator('#admin-diff').textContent())!, /Color Kitchen editorial team/);
            await publisher.goto(portalPath('en', 2));
            await idle(publisher);
            await publisher.locator('#admin-review').click();
            await idle(publisher);
            await publisher.locator('#admin-publish').click();
            await idle(publisher);
            await publicVersions(2);
            await publisher.locator('#admin-revision-select').selectOption('1');
            await idle(publisher);
            assert.equal(await publisher.locator('#admin-review').textContent(), adminText('en', 'reviewRollback'));
            await publisher.locator('#admin-review').click();
            await idle(publisher);
            await publisher.locator('#admin-publish').click();
            await idle(publisher);
            await publicVersions(1);

            await publisher.locator('#admin-audit-filter [name=itemId]').fill(itemId);
            await publisher.locator('#admin-audit-filter [name=action]').selectOption('catalog.rollback');
            await publisher.locator('#admin-audit-filter button').click();
            await idle(publisher);
            const audit = publisher.locator('#admin-audit-entries li');
            assert.equal(await audit.count(), 1);
            assert.match((await audit.textContent())!, /Rolled back · 2 → 1/);
            const db = await client.query(`SELECT action,before_rev,after_rev FROM ck.audit_event
              WHERE resource_id=$1 ORDER BY occurred_at`, [itemId]);
            assert.deepEqual(db.rows.map(row => [row.action, row.before_rev, row.after_rev]),
              [['catalog.publish', null, 1], ['catalog.publish', 1, 2], ['catalog.rollback', 2, 1]]);
            assert.deepEqual(exceptions, []);
            assert(requests.every(value => new URL(value).origin === origin));
          } finally { await publisher.close(); }
        });
      });
    } finally { await pool.end(); }
  });
});
