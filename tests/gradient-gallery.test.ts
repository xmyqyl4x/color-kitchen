import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseCatalog } from '../src/catalog/base-data.js';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { catalogHttp } from '../src/http/public-catalog.js';
import { locales } from '../src/model/locales.js';
import { webHttp } from '../src/web/http.js';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';
import { withMigratedDatabase } from './postgres.js';

test('the gradient gallery publishes and hands off the full localized set of gradient types', async () => {
  await withMigratedDatabase(async client => {
    const original = sampleCatalog[2];
    await seedCatalog(client, [original]);
    const result = await seedCatalog(client, baseCatalog);
    assert.deepEqual(result, { inserted: baseCatalog.length - 1, unchanged: 1 });
    assert.deepEqual(await seedCatalog(client, baseCatalog), { inserted: 0, unchanged: baseCatalog.length });
    const gradients = baseCatalog.filter(entry => entry.kind === 'gradient');
    assert.equal(gradients.length, 37);
    assert.equal(new Set(gradients.map(({ type, center, angle, stops }) => JSON.stringify([type, center, angle, stops]))).size, 37);

    const deps = { withClient: <T>(work: (connection: typeof client) => Promise<T>) => work(client) };
    const api = catalogHttp(deps), web = webHttp(deps);
    await withHttp(request => new URL(request.url).pathname.startsWith('/api/v1/catalog/') ? api(request) : web(request), async origin => {
      const endpoint = origin + '/api/v1/catalog/gradient';
      const data = async (url: string) => {
        const response = await fetch(url);
        assert.equal(response.status, 200);
        return (await response.json()).data;
      };
      for (const locale of locales) {
        const { items } = await data(`${endpoint}?locale=${locale}&limit=50`);
        assert.equal(items.length, 37);
        assert.equal(items[0].entry.slug, 'forest-to-gold');
        for (const [index, item] of items.entries()) {
          const entry = gradients[index]!;
          assert.equal(item.entry.title, entry.translations[locale].title);
          assert.equal(item.entry.summary, entry.translations[locale].summary);
          assert.equal(item.entry.payload.type, entry.type ?? 'linear');
        }
      }
      for (const [type, count] of [['linear', 13], ['radial', 12], ['conic', 12]] as const) {
        const { items } = await data(`${endpoint}?type=${type}&limit=50`);
        assert.equal(items.length, count);
        assert(items.every((item: { entry: { payload: { type: string } } }) => item.entry.payload.type === type));
      }
      assert.equal((await fetch(endpoint + '?type=unknown')).status, 400);
      assert.equal((await data(endpoint + '?q=E1F8D8&type=radial')).items[0].entry.slug, 'mint-center');

      await withBrowserPage(async page => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(origin + '/en/gradients');
        assert.equal(await page.locator('.gradient-gallery-grid .collection-card').count(), 12);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.getByRole('link', { name: 'Next page' }).press('Enter');
        await page.getByRole('link', { name: 'Indigo Tide Wheel' }).waitFor();

        await page.goto(origin + '/en/gradients');
        await page.getByLabel('Gradient type').selectOption('conic');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await page.getByRole('link', { name: 'Coral and Amber Wheel' }).waitFor();
        await page.waitForFunction(() => [...document.querySelectorAll('.collection-strip')]
          .every(element => getComputedStyle(element).backgroundImage.startsWith('conic-gradient(')));

        await page.goto(origin + '/en/gradients/mint-center');
        await page.locator('.gallery-stops [data-swatch-code]').first().waitFor();
        assert.deepEqual(await page.locator('.gallery-stops code').allTextContents(), ['#E1F8D8', '#85CEAE', '#20635E']);
        assert.equal(await page.locator('.gallery-stops [data-swatch-code]').count(), 3);
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
        await page.getByRole('button', { name: 'Copy CSS' }).click();
        await page.waitForFunction(async () => (await navigator.clipboard.readText()).startsWith('background-image: radial-gradient('));
        const css = await page.evaluate(() => navigator.clipboard.readText());
        assert.match(css, /at 40% 38% in srgb/);
        assert.match(css, /52%/);

        await page.getByRole('button', { name: 'Open in Gradient Studio' }).click();
        await page.waitForURL('**/en/gradient-studio');
        await page.waitForFunction(() => document.querySelectorAll('#gr-stops fieldset').length === 3);
        const draft = await page.evaluate(async () => {
          const url = '/src/web/draft.js';
          return (await import(url) as typeof import('../src/web/draft.js')).readGradientDraft();
        });
        assert.equal(draft?.type, 'radial');
        assert.deepEqual(draft.center, [0.4, 0.38]);
        assert.deepEqual(draft.stops.map(stop => stop.position), [0, 0.52, 1]);
      });
    });
  });
});
