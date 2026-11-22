import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { locales } from '../src/model/locales.js';
import { webHttp } from '../src/web/http.js';
import { screenTitle, webText } from '../src/web/strings.js';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';
import { withMigratedDatabase } from './postgres.js';

test('localized home and entry routes render from the running server with published catalog metadata', async () => {
  await withMigratedDatabase(async client => {
    await seedCatalog(client, sampleCatalog);
    await withHttp(webHttp({ withClient: work => work(client) }), async origin => {
      const errors: string[] = [];
      await withBrowserPage(async page => {
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize({ width: 320, height: 800 });
        for (const locale of locales) {
          const response = await page.goto(origin + '/' + locale);
          assert.equal(response?.status(), 200);
          assert.equal(response?.headers()['content-language'], locale);
          assert.equal(await page.locator('html').getAttribute('lang'), locale);
          assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), origin + '/' + locale);
          assert.equal(await page.locator('link[rel="alternate"]').count(), 6);
          assert.equal((await page.locator('main h1').innerText()).trim(), webText(locale, 'heading'));
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        }
        for (const [key, route] of [['hero-create', 'palette-studio'], ['hero-explore', 'palettes'],
          ['hero-image', 'image-to-palette'], ['quick-contrast', 'contrast'], ['continue-fonts', 'fonts']] as const) {
          await page.goto(origin + '/en');
          const action = page.locator('[data-focus-key="' + key + '"]');
          const height = (await action.boundingBox())?.height;
          assert(height && height >= 44);
          await action.click();
          assert.equal(new URL(page.url()).pathname, '/en/' + route);
          assert.equal(await page.locator('main h1').textContent(), screenTitle('en', route));
        }
        await page.goto(origin + '/fr/palettes/forest-study');
        assert.equal(await page.locator('h1').textContent(), 'Étude forestière');
        assert.equal(await page.locator('link[hreflang=de]').getAttribute('href'), origin + '/de/palettes/forest-study');
        await page.goto(origin + '/fr/browser-companion');
        assert.equal(await page.locator('main p').textContent(), webText('fr', 'unreleased'));
        assert.equal(await page.locator('meta[name=robots]').getAttribute('content'), 'noindex');
      });
      assert.deepEqual(errors, []);
      const negotiated = await fetch(origin + '/', { redirect: 'manual', headers: { 'Accept-Language': 'pt-PT' } });
      assert.equal(negotiated.headers.get('location'), '/pt');
      assert.equal((await fetch(origin + '/src/web/draft.js')).status, 200);
      assert.equal((await fetch(origin + '/src/http/cli.js')).status, 404);
      assert.equal((await fetch(origin + '/assets/source-sans-license.txt')).status, 200);
    });
  });
});

test('keyboard skip and browser Back restore focus, and a touch locale switch keeps the active draft', async () => {
  await withHttp(webHttp({ async withClient() { throw new Error('Home is available without PostgreSQL.'); } }), async origin => {
    await withBrowserPage(async page => {
      await page.setViewportSize({ width: 320, height: 780 });
      await page.goto(origin + '/es');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator(':focus').textContent(), 'Saltar al contenido');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator(':focus').getAttribute('id'), 'main');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator(':focus').getAttribute('data-focus-key'), 'hero-create');
      await page.keyboard.press('Enter');
      await page.waitForURL('**/es/palette-studio');
      await page.goBack();
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-focus-key') === 'hero-create');
      await page.evaluate(async () => {
        const draftUrl = '/src/web/draft.js';
        const { storeActivePalette } = await import(draftUrl) as typeof import('../src/web/draft.js');
        storeActivePalette({ kind: 'palette', schemaVersion: 1, name: 'Mi paleta', id: 'same-draft', revision: 3, updatedAt: 20,
          palette: { swatches: [
            { id: 'dark', color: { space: 'srgb', components: [0, 0, 0], alpha: 1 }, locked: true },
            { id: 'light', color: { space: 'srgb', components: [1, 1, 1], alpha: 1 }, locked: false },
          ], roles: { background: 'dark' } },
        });
      });
      await page.locator('.languages summary').click();
      await page.locator('[data-focus-key=language-de]').click();
      await page.waitForURL('**/de');
      const draft = await page.evaluate(async () => {
        const draftUrl = '/src/web/draft.js';
        return (await import(draftUrl) as typeof import('../src/web/draft.js')).readActivePalette();
      });
      assert.equal(draft?.name, 'Mi paleta');
      assert.equal(draft?.palette.roles.background, 'dark');
      assert.equal(draft?.palette.swatches[0]?.locked, true);
      await page.goto(origin);
      await page.waitForURL('**/de');
      const touch = await page.context().browser()!.newPage({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });
      try {
        await touch.goto(origin + '/pt');
        await touch.locator('.languages summary').tap();
        await touch.locator('[data-focus-key=language-fr]').tap();
        await touch.waitForURL('**/fr');
        assert.equal(await touch.locator('html').getAttribute('lang'), 'fr');
      } finally { await touch.close(); }
    });
  });
});
