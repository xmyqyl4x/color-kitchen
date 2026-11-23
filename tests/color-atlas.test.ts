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

test('Color Atlas publishes the CSS named colors, resolves aliases, and searches beyond the first page', async () => {
  await withMigratedDatabase(async client => {
    await seedCatalog(client, [sampleCatalog[3]]);
    const colors = baseCatalog.filter(entry => entry.kind === 'color');
    const seeded = await seedCatalog(client, baseCatalog);
    assert.equal(seeded.unchanged, 1);
    assert.equal(seeded.inserted, baseCatalog.length - 1);
    assert.equal(new Set(colors.map(color => color.hex)).size, 139);
    const keywords = colors.flatMap(color => [color.keyword, ...(color.aliases ?? [])].map(keyword => [keyword, color.hex] as const));
    assert.equal(new Set(keywords.map(([keyword]) => keyword)).size, 148);

    const deps = { withClient: <T>(work: (connection: typeof client) => Promise<T>) => work(client) };
    const api = catalogHttp(deps), web = webHttp(deps);
    await withHttp(request => new URL(request.url).pathname.startsWith('/api/v1/catalog/') ? api(request) : web(request), async origin => {
      const endpoint = `${origin}/api/v1/catalog/color`;
      const data = async (url: string) => {
        const response = await fetch(url);
        assert.equal(response.status, 200);
        return (await response.json()).data;
      };
      for (const locale of locales) {
        const published = [];
        let cursor: string | null = null;
        do {
          const listing = await data(`${endpoint}?locale=${locale}&limit=50${cursor ? `&cursor=${cursor}` : ''}`);
          published.push(...listing.items.map((item: { entry: { slug: string; title: string } }) => item.entry));
          cursor = listing.nextCursor;
        } while (cursor);
        assert.equal(published.length, 139);
        assert.equal(new Set(published.map(item => item.slug)).size, 139);
        const expected = new Map(colors.map(color => [color.slug, color.translations[locale].title]));
        for (const entry of published) assert.equal(entry.title, expected.get(entry.slug));
        assert.equal(published[0].slug, 'black');
      }
      const aka = await data(endpoint + '/grey?locale=de');
      assert.equal(aka.entry.slug, 'gray');
      assert.equal(aka.metadata.canonical, '/de/colors/gray');
      assert.equal((await data(endpoint + '?q=fff')).items[0].entry.slug, 'white');
      assert.equal((await data(endpoint + '?q=light%20sky%20blue&locale=pt')).items[0].entry.slug, 'lightskyblue');
      assert.equal((await data(endpoint + '?q=gray')).items[0].entry.slug, 'gray');

      await withBrowserPage(async page => {
        const mistakes = await page.evaluate(values => {
          const ctx = document.createElement('canvas').getContext('2d')!;
          return values.flatMap(([keyword, hex]) => {
            ctx.fillStyle = '#123456';
            ctx.fillStyle = keyword;
            return ctx.fillStyle.toUpperCase() === hex ? [] : [keyword, ctx.fillStyle, hex];
          });
        }, keywords);
        assert.deepEqual(mistakes, []);

        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(origin + '/en/colors');
        assert.equal(await page.locator('.color-atlas-grid .collection-card').count(), 24);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.getByRole('link', { name: 'Next page' }).press('Enter');
        await page.waitForURL(url => url.searchParams.has('cursor'));
        assert.notEqual(await page.locator('.color-atlas-grid h2').first().textContent(), 'Black');

        await page.goto(origin + '/en/colors');
        await page.getByLabel('Color family').selectOption('pink');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await page.getByRole('link', { name: 'Hot Pink' }).waitFor();
        assert.equal(await page.getByRole('link', { name: 'Black', exact: true }).count(), 0);
        await page.getByRole('link', { name: 'Hot Pink' }).click();
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
        await page.getByRole('button', { name: 'Copy HEX' }).click();
        assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '#FF69B4');

        await page.goto(origin + '/en/colors?q=4782B4');
        await page.getByText('Closest named color').waitFor();
        assert.equal(await page.getByRole('link', { name: 'Steel Blue' }).count(), 1);
        assert.equal(await page.getByText('No entries match these filters.').count(), 0);
        await page.getByRole('button', { name: 'Inspect color' }).click();
        await page.waitForURL('**/en/color-inspector#color=*');
        await page.getByText('#4682B4', { exact: true }).first().waitFor();
      });
    });
  });
});
