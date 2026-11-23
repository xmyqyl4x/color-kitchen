import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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

test('the base font library serves the licensed files and loads font weights, previews and export CSS', async () => {
  await withMigratedDatabase(async client => {
    await seedCatalog(client, [sampleCatalog[4]]);
    assert.deepEqual(await seedCatalog(client, baseCatalog), { inserted: baseCatalog.length - 1, unchanged: 1 });
    const fonts = baseCatalog.filter(entry => entry.kind === 'font');
    assert.equal(fonts.length, 15);
    const deps = { withClient: <T>(work: (connection: typeof client) => Promise<T>) => work(client) };
    const api = catalogHttp(deps), web = webHttp(deps);
    await withHttp(request => new URL(request.url).pathname.startsWith('/api/v1/catalog/') ? api(request) : web(request), async origin => {
      for (const locale of locales) {
        const response = await fetch(`${origin}/api/v1/catalog/font?locale=${locale}&limit=50`);
        assert.equal(response.status, 200);
        const { items } = (await response.json()).data;
        assert.equal(items.length, 15);
        for (const [index, item] of items.entries()) {
          const font = fonts[index]!;
          assert.equal(item.entry.title, font.family);
          assert.equal(item.entry.summary, font.translations[locale].summary);
          assert.equal(item.entry.sourceDigest, font.sourceDigest);
        }
      }
      for (const font of fonts) {
        const response = await fetch(`${origin}/assets/fonts/${font.filename}`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type'), font.filename.endsWith('.ttf') ? 'font/ttf' : 'font/woff2');
        assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), font.sourceDigest);
        const license = await fetch(`${origin}/assets/fonts/${font.notice}`);
        assert.equal(license.status, 200);
        assert.match(await license.text(), /SIL OPEN FONT LICENSE/i);
      }
      assert.equal((await fetch(`${origin}/assets/fonts/arbitrary.ttf`)).status, 404);

      await withBrowserPage(async page => {
        await page.setViewportSize({ width: 390, height: 820 });
        const outbound: string[] = [];
        const fontLoads: string[] = [];
        page.on('request', request => {
          if (new URL(request.url()).origin !== origin) outbound.push(request.url());
          if (request.resourceType() === 'font') fontLoads.push(request.url());
        });
        await page.goto(origin + '/en/fonts');
        assert.equal(await page.locator('[data-font-face]').count(), 15);
        await page.getByText('Selected font loaded.', { exact: false }).first().waitFor();
        assert(!fontLoads.some(url => url.endsWith('WorkSans-Variable.ttf')));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

        const faces = page.locator('[data-font-face]');
        for (const face of await faces.all()) {
          await face.scrollIntoViewIfNeeded();
          await face.getByText('Selected font loaded.', { exact: false }).waitFor();
        }
        assert.equal(new Set(fontLoads.filter(url => url.includes('/assets/fonts/'))).size, 15);
        await page.getByLabel('Font category').selectOption('mono');
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        await page.waitForURL(url => url.searchParams.get('category') === 'mono');
        assert.equal(await page.locator('[data-font-face]').count(), 3);
        await page.getByLabel('Sample text').fill('Été, acción, Straße');
        assert.deepEqual(await page.locator('[data-font-sample]').allTextContents(), ['Été, acción, Straße', 'Été, acción, Straße', 'Été, acción, Straße']);

        await page.goto(origin + '/en/fonts?q=jetbrains&weight=700');
        assert.equal(await page.locator('[data-font-face]').count(), 1);
        await page.getByRole('link', { name: 'JetBrains Mono' }).click();
        await page.getByText('Selected font loaded.', { exact: false }).waitFor();
        const download = page.waitForEvent('download');
        await page.getByRole('link', { name: 'Download font' }).click();
        assert.equal((await download).suggestedFilename(), 'JetBrainsMono-Variable.ttf');
        await page.getByRole('link', { name: 'Use in Type Playground' }).click();
        await page.getByText('Selected font loaded.', { exact: false }).waitFor();
        assert.equal(await page.locator('#type-family').inputValue(), 'jetbrains-mono');
        assert.equal(await page.locator('#type-weight').inputValue(), '400');
        await page.locator('#type-weight').selectOption('700');
        assert.equal(await page.locator('#type-preview').evaluate(element => getComputedStyle(element).fontWeight), '700');
        assert.equal(await page.evaluate(() => [...document.fonts].find(face => face.family.includes('Kitchen Preview jetbrains-mono'))?.weight), '100 800');
        const exported = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download CSS' }).click();
        const css = await readFile((await (await exported).path())!, 'utf8');
        assert.match(css, /url\("\.\/JetBrainsMono-Variable.ttf"\) format\("truetype"\)/);
        assert.match(css, /font-variation-settings: "wght" 700;/);
        assert.deepEqual(outbound, []);
      });
    });
  });
});
