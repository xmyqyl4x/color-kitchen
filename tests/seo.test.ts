import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseCatalog } from '../src/catalog/base-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { locales } from '../src/model/locales.js';
import { webHttp } from '../src/web/http.js';
import { publicScreens } from '../src/web/seo-text.js';
import { withBrowserPage } from './browser.js';
import { withHttp } from './http.js';
import { withMigratedDatabase } from './postgres.js';

test('search metadata and sitemap cover the five locales and published catalog', async () => {
  await withMigratedDatabase(async client => {
    await seedCatalog(client, baseCatalog);
    const web = webHttp({ withClient: work => work(client) });
    await withHttp(web, async origin => {
      const robots = await fetch(origin + '/robots.txt');
      assert.equal(robots.status, 200);
      assert.equal(robots.headers.get('content-type'), 'text/plain; charset=utf-8');
      const rules = await robots.text();
      assert.match(rules, /Disallow: \/api\//);
      assert(rules.includes('Sitemap: ' + origin + '/sitemap.xml'));
      const head = await fetch(origin + '/sitemap.xml', { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
      const sitemap = await fetch(origin + '/sitemap.xml');
      assert.equal(sitemap.headers.get('content-type'), 'application/xml; charset=utf-8');
      const urls = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
      assert.equal(new Set(urls).size, urls.length);
      assert(urls.every(url => url?.startsWith(origin + '/') && !url.includes('?')));
      assert.equal(urls.length, (publicScreens.length + baseCatalog.length + 11) * locales.length);

      const knownPaths = ['/palettes/forest-study', '/colors/gray', '/gradients/forest-to-gold', '/fonts/source-sans-3',
        '/palettes/moods/pastel', '/gradients/types/radial'];
      for (const locale of locales) {
        const titles = new Set<string>();
        const descriptions = new Set<string>();
        for (const path of [...publicScreens.map(screen => screen ? '/' + screen : ''), ...knownPaths]) {
          const url = origin + '/' + locale + path;
          const response = await fetch(url);
          assert.equal(response.status, 200, url);
          assert.equal(response.headers.get('content-language'), locale);
          assert(urls.includes(url), url);
          const html = await response.text();
          const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
          const description = /<meta name="description" content="([^"]+)">/.exec(html)?.[1];
          assert(title && !titles.has(title), url);
          assert(description && !descriptions.has(description), url);
          titles.add(title);
          descriptions.add(description);
          assert(html.includes('<link rel="canonical" href="' + url + '">'));
          for (const language of [...locales, 'x-default']) {
            const alternate = origin + '/' + (language === 'x-default' ? 'en' : language) + path;
            assert(html.includes('<link rel="alternate" hreflang="' + language + '" href="' + alternate + '">'), url);
          }
          assert(!html.includes('content="noindex"'), url);
          assert(html.includes('<meta property="og:url" content="' + url + '">'));
          assert(html.includes('<meta name="twitter:card" content="summary_large_image">'));
          const data = JSON.parse(/<script type="application\/ld\+json">([^<]+)<\/script>/.exec(html)![1]!);
          assert.equal(data['@graph'][0].inLanguage, locale);
        }
      }

      const image = await fetch(origin + '/assets/social-card.png');
      assert.equal(image.headers.get('content-type'), 'image/png');
      const png = Buffer.from(await image.arrayBuffer());
      assert.equal(png.toString('ascii', 12, 16), 'IHDR');
      assert.equal(png.readUInt32BE(16), 1200);
      assert.equal(png.readUInt32BE(20), 630);

      const redirected = await fetch(origin + '/de/colors/grey', { redirect: 'manual' });
      assert.equal(redirected.status, 308);
      assert.equal(redirected.headers.get('location'), '/de/colors/gray');
      const slash = await fetch(origin + '/pt/palettes/moods/pastel/?utm_source=test', { redirect: 'manual' });
      assert.equal(slash.status, 308);
      assert.equal(slash.headers.get('location'), '/pt/palettes/moods/pastel?utm_source=test');
      const tracked = await (await fetch(origin + slash.headers.get('location'))).text();
      assert(tracked.includes('<link rel="canonical" href="' + origin + '/pt/palettes/moods/pastel">'));

      for (const path of ['/fr/palettes?q=foret', '/fr/palettes?mood=pastel', '/en/colors?limit=2',
        '/es/gradients?type=conic', '/pt/fonts?weight=bad', '/fr/palettes/moods/pastel?limit=1', '/en/collection',
        '/en/catalog-admin', '/en/browser-companion', '/de/palettes/moods/fabricated']) {
        const response = await fetch(origin + path);
        assert.equal(response.headers.get('x-robots-tag'), 'noindex', path);
        const html = await response.text();
        assert(!html.includes('rel="alternate"'), path);
        assert(!html.includes('rel="canonical"'), path);
      }

      await withBrowserPage(async page => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize({ width: 320, height: 780 });
        await page.goto(origin + '/fr/palettes');
        await page.locator('.discovery-topics a[href$="/moods/pastel"]').click();
        assert.equal(await page.locator('h1').textContent(), 'Palettes de couleurs pastel');
        assert((await page.locator('.collection-card').count()) > 0);
        assert.equal(await page.locator('.breadcrumbs [aria-current="page"]').textContent(), 'Palettes de couleurs pastel');
        assert.equal(await page.locator('[data-focus-key="language-de"]').getAttribute('href'), '/de/palettes/moods/pastel');
        await page.goto(origin + '/fr/palettes/forest-study');
        const content = await page.locator('.palette-codes').textContent();
        assert.match(content ?? '', /#213C35/);
        await page.locator('.palette-codes .color-chip').first().waitFor();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
      });
      const visible = await (await fetch(origin + '/fr/palettes/forest-study')).text();
      assert.match(visible, /<code data-palette-code>#213C35<\/code>/);
      const breadcrumb = JSON.parse(/<script type="application\/ld\+json">([^<]+)<\/script>/.exec(visible)![1]!)['@graph'][1];
      assert.equal(breadcrumb['@type'], 'BreadcrumbList');
      assert.equal(breadcrumb.itemListElement[2].name, 'Étude forestière');
    });
  });
});

test('empty or unavailable catalog pages stay out of the sitemap and index', async () => {
  await withMigratedDatabase(async client => {
    const web = webHttp({ withClient: work => work(client) });
    await withHttp(web, async origin => {
      const sitemap = await (await fetch(origin + '/sitemap.xml')).text();
      assert(!sitemap.includes('/palettes'));
      assert(!sitemap.includes('/gradients'));
      assert(!sitemap.includes('/privacy'));
      const empty = await fetch(origin + '/pt/palettes');
      assert.equal(empty.headers.get('x-robots-tag'), 'noindex');
      assert.equal((await fetch(origin + '/pt/palettes/moods/pastel')).status, 404);
    });
  });
  const offline = webHttp({ async withClient() { throw new Error('Database fixture unavailable.'); } });
  const sitemap = await offline(new Request('https://colors.example/sitemap.xml'));
  assert.equal(sitemap.status, 503);
  assert.equal(sitemap.headers.get('retry-after'), '60');
  const robots = await offline(new Request('https://colors.example/robots.txt'));
  assert.match(await robots.text(), /Sitemap: https:\/\/colors.example\/sitemap.xml/);
});
