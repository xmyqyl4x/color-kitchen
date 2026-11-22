import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { locales } from '../src/model/locales.js';
import { webHttp } from '../src/web/http.js';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';
import { withMigratedDatabase } from './postgres.js';

test('release surfaces preserve five language landmarks and private tool reflow at 320 CSS pixels', async () => {
  await withMigratedDatabase(async client => {
    await seedCatalog(client, sampleCatalog);
    const web = webHttp({ withClient: work => work(client), adFrameUrl: 'https://ads.example.test/fixture' });
    await withHttp(web, origin => withBrowserPage(async page => {
      const external: string[] = [];
      page.on('request', request => {
        if (!request.url().startsWith(origin + '/') && !request.url().startsWith('blob:' + origin)) external.push(request.url());
      });
      await page.setViewportSize({ width: 320, height: 860 });
      for (const locale of locales) {
        const home = await page.goto(origin + '/' + locale);
        assert.equal(home?.headers()['content-language'], locale);
        assert.equal(await page.locator('html').getAttribute('lang'), locale);
        assert.equal(await page.locator('[rel=alternate][hreflang]').count(), 6);
        await page.keyboard.press('Tab');
        assert.equal(await page.locator(':focus').getAttribute('href'), '#main');
        await page.keyboard.press('Enter');
        assert.equal(await page.locator(':focus').getAttribute('id'), 'main');
      }
      for (const route of ['collection', 'image-to-palette', 'moodboard', 'color-guide', 'type-playground']) {
        const response = await page.goto(origin + '/de/' + route);
        assert.equal(response?.status(), 200);
        assert.match(response?.headers()['content-security-policy'] ?? '', /frame-src 'none'/);
        assert.equal(await page.locator('[data-ad-frame]').count(), 0);
        assert.match(await page.locator('main').ariaSnapshot(), /heading .*level=1/);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route);
      }
      assert.deepEqual(external, []);
    }));
  });
});
