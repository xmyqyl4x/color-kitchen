import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog, type CatalogSeed } from '../src/catalog/seed.js';
import type { Locale } from '../src/model/locales.js';
import { webHttp } from '../src/web/http.js';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';
import { withMigratedDatabase } from './postgres.js';

test('published discovery supports localized filters, canonical aliases and guarded editing handoffs', async () => {
  await withMigratedDatabase(async client => {
    const cyan: CatalogSeed = { ...sampleCatalog[3], itemId: randomUUID(), slug: 'aqua', keyword: 'aqua', aliases: ['cyan'],
      hex: '#00FFFF', translations: Object.fromEntries(Object.keys(sampleCatalog[3].translations)
        .map(locale => [locale, { title: 'Aqua', summary: 'CSS aqua' }])) as Record<Locale, { title: string; summary: string }> };
    await seedCatalog(client, [sampleCatalog[0], sampleCatalog[1], sampleCatalog[2], sampleCatalog[3], cyan]);
    const web = webHttp({ withClient: work => work(client), measurement: true });
    await withHttp(web, origin => withBrowserPage(async page => {
      await page.goto(origin + '/fr/palettes?limit=1&sort=popular');
      assert.match(await page.locator('.discovery-sort').textContent() ?? '', /Sélection/);
      assert.equal(await page.locator('.collection-card h2').textContent(), 'Étude forestière');
      await page.locator('[data-focus-key=catalog-next]').press('Enter');
      assert.equal(await page.locator('.collection-card h2').textContent(), 'Pierre du matin');
      await page.goBack();
      await page.locator('input[name=q]').fill('introuvable');
      await page.locator('input[name=q]').press('Enter');
      await page.getByText('Aucune entrée ne correspond à ces filtres.').waitFor();
      await page.getByRole('link', { name: 'Effacer les filtres' }).press('Enter');
      await page.getByText('Étude forestière').waitFor();
      await page.locator('[data-catalog-action=save]:enabled').first().press('Enter');
      await page.getByText('Enregistré sur cet appareil.').waitFor();
      await page.goto(origin + '/en/palette-studio');
      await page.locator('[data-control="swatch-1:value"]').fill('#102030');
      await page.locator('[data-control="swatch-1:value"]').blur();
      await page.goto(origin + '/en/palettes/forest-study');
      const dialog = page.waitForEvent('dialog').then(value => value.dismiss());
      await page.locator('[data-catalog-action=edit]:enabled').press('Enter');
      await dialog;
      assert.match(page.url(), /palettes\/forest-study$/);
      await page.goto(origin + '/en/gradients');
      await page.locator('[data-catalog-action=edit]:enabled').press('Enter');
      await page.waitForURL('**/gradient-studio');
      const stops = await page.evaluate(async () => {
        const url = '/src/web/draft.js';
        return (await import(url) as typeof import('../src/web/draft.js')).readGradientDraft()?.stops.length;
      });
      assert.equal(stops, 3);
      assert.equal(new URL((await fetch(origin + '/en/colors/cyan')).url).pathname, '/en/colors/aqua');
      await page.goto(origin + '/en/colors?q=%2305FFFF');
      await page.getByText('Closest named color').waitFor();
      await page.locator('[data-catalog-action=edit]:enabled').press('Enter');
      await page.waitForURL('**/color-inspector#color=*');
      await page.getByText('#00FFFF', { exact: true }).first().waitFor();
    }));
  });
});
