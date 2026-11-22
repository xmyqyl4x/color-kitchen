import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { webHttp } from '../src/web/http.js';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';
import { withMigratedDatabase } from './postgres.js';

test('licensed font assets load on mobile and typography copies original Unicode unchanged', async () => {
  await withMigratedDatabase(async client => {
    await seedCatalog(client, [sampleCatalog[4]]);
    await withHttp(webHttp({ withClient: work => work(client) }), origin => withBrowserPage(async page => {
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Denied fixture'); } } });
      });
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(origin + '/fr/fonts?script=Latn&weight=400');
      await page.getByText('Police sélectionnée chargée.', { exact: false }).waitFor();
      assert.match(await page.locator('[data-font-sample]').evaluate(el => getComputedStyle(el).fontFamily), /Kitchen Preview source-sans-3/);
      const notice = await page.getByRole('link', { name: 'Notice de licence' }).getAttribute('href');
      assert.match(await (await fetch(origin + notice)).text(), /SIL OPEN FONT LICENSE/i);
      const font = page.waitForEvent('download');
      await page.getByRole('link', { name: 'Télécharger la police' }).click();
      assert.equal((await readFile((await (await font).path())!)).subarray(0, 4).toString(), 'wOF2');
      await page.getByRole('link', { name: 'Utiliser dans l’atelier' }).click();
      await page.getByText('Police sélectionnée chargée.', { exact: false }).waitFor();
      const original = 'Été, ação, Straße 👩‍🎨';
      await page.locator('#type-text').fill(original);
      await page.locator('#type-plain').click();
      assert.equal(await page.locator('#type-copy').inputValue(), original);
      assert.match(await page.locator('#type-coverage').textContent() ?? '', /👩‍🎨/u);
      const image = page.waitForEvent('download');
      await page.locator('#type-image').click();
      assert.equal((await readFile((await (await image).path())!)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }));
  });
});

test('failed font loading is visibly resolved with the system font', async () => {
  await withMigratedDatabase(async client => {
    await seedCatalog(client, [sampleCatalog[4]]);
    await withHttp(webHttp({ withClient: work => work(client) }), origin => withBrowserPage(async page => {
      await page.route('**/assets/fonts/SourceSans3-Regular.woff2', route => route.fulfill({ status: 404, body: '' }));
      await page.goto(origin + '/en/fonts/source-sans-3');
      await page.getByText('The selected font could not load. Showing the system font.').waitFor();
      assert.match(await page.locator('[data-font-sample]').evaluate(el => getComputedStyle(el).fontFamily), /system-ui/);
      assert.doesNotMatch(await page.locator('[data-font-sample]').evaluate(el => getComputedStyle(el).fontFamily), /Kitchen Preview/);
    }));
  });
});
