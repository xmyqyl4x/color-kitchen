import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseCatalog } from '../src/catalog/base-data.js';
import { paletteMoods } from '../src/catalog/palette-moods.js';
import { getCatalogEntry } from '../src/catalog/repository.js';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { catalogHttp } from '../src/http/public-catalog.js';
import { locales } from '../src/model/locales.js';
import { webHttp } from '../src/web/http.js';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';
import { withMigratedDatabase } from './postgres.js';

test('the base gallery adds 40 original palettes and preserves the existing public revision', async () => {
  await withMigratedDatabase(async client => {
    await seedCatalog(client, sampleCatalog);
    const forest = sampleCatalog[0];
    await seedCatalog(client, [{ ...forest, revision: 2, colors: ['#303A32', '#708775', '#D8AB71'] }]);
    assert.deepEqual(await seedCatalog(client, baseCatalog), { inserted: baseCatalog.length - sampleCatalog.length, unchanged: sampleCatalog.length });
    assert.deepEqual(await seedCatalog(client, baseCatalog), { inserted: 0, unchanged: baseCatalog.length });
    assert.equal((await getCatalogEntry(client, 'palette', forest.slug, 'fr'))?.revision, 2);

    const palettes = baseCatalog.filter(entry => entry.kind === 'palette');
    const swatchKeys = palettes.map(entry => [...entry.colors].sort().join(','));
    assert.equal(new Set(swatchKeys).size, 42);
    assert(palettes.every(({ colors }) => new Set(colors).size === colors.length));
    const deps = { withClient: <T>(work: (connection: typeof client) => Promise<T>) => work(client) };
    const api = catalogHttp(deps), web = webHttp(deps);
    await withHttp(request => new URL(request.url).pathname.startsWith('/api/v1/catalog/') ? api(request) : web(request), async origin => {
      for (const locale of locales) {
        const response = await fetch(`${origin}/api/v1/catalog/palette?locale=${locale}&limit=50`);
        assert.equal(response.status, 200);
        const { items, nextCursor } = (await response.json()).data;
        assert.equal(items.length, 42);
        assert.equal(nextCursor, null);
        for (const [index, item] of items.entries()) {
          const { translations, slug, mood } = palettes[index]!;
          assert.equal(item.entry.slug, slug);
          assert.equal(item.entry.title, translations[locale].title);
          assert.equal(item.entry.summary, translations[locale].summary);
          if (mood) assert.deepEqual(item.tags, [{ facet: 'mood', slug: mood }]);
        }
      }
      const tags = await client.query<{ slug: keyof typeof paletteMoods; locale: keyof typeof paletteMoods.pastel; label: string }>(
        `SELECT t.slug,tt.locale,tt.label FROM ck.tag t JOIN ck.tag_text tt USING (tag_id) WHERE t.facet='mood'`);
      assert.equal(tags.rows.length, 40);
      for (const { slug, locale, label } of tags.rows) assert.equal(label, paletteMoods[slug][locale]);

      await withBrowserPage(async page => {
        await page.goto(origin + '/en/palettes');
        assert.equal(await page.locator('.collection-card').count(), 12);
        await page.getByRole('link', { name: 'Next page' }).press('Enter');
        await page.getByRole('link', { name: 'Paper and Putty' }).waitFor();
        await page.goto(origin + '/fr/palettes');
        assert.equal(await page.locator('#palette-moods option[value=bold]').getAttribute('label'), 'Audacieux');
        await page.locator('input[name=mood]').fill('pastel');
        await page.locator('input[name=mood]').press('Enter');
        await page.getByRole('link', { name: 'Lait de lavande' }).waitFor();
        assert.equal(await page.locator('.collection-card').count(), 5);
        await page.getByRole('link', { name: 'Lait de lavande' }).click();
        await page.locator('[data-catalog-action=edit]:enabled').click();
        await page.waitForURL('**/fr/palette-studio');
        assert.equal((await page.locator('[data-control="swatch-1:value"]').inputValue()).toUpperCase(), '#F9EFF6');
      });
    });
  });
});
