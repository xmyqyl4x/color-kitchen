import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeCatalogLocale, resolveLocale } from '../src/i18n/resolve.js';
import { catalogPage, chooseCatalogSort, popularityWindow } from '../src/catalog/ranking.js';
import { matchesCatalog, normalizeCatalogFilters } from '../src/catalog/search.js';
import { parseColor } from '../src/color/parse.js';

test('locale resolution honors explicit routes and preferences and normalizes weighted browser languages', () => {
  assert.deepEqual(resolveLocale({ route: 'fr', saved: 'de', browser: 'en' }), { locale: 'fr', source: 'route', unsupported: null });
  assert.equal(resolveLocale({ selected: 'de', route: 'fr' }).locale, 'de');
  assert.deepEqual(resolveLocale({ route: 'zh', saved: 'pt-BR', browser: 'es;q=1' }),
    { locale: 'pt', source: 'preference', unsupported: 'zh' });
  assert.equal(resolveLocale({ browser: 'ja, de-DE;q=0.4, fr-CA;q=0.9, es;q=0' }).locale, 'fr');
  assert.equal(resolveLocale({ browser: 'pt;q=0, *' }).source, 'default');
  const view = { locale: 'fr', itemId: 'same-id', activeDocument: 'private-doc', filters: { family: 'blue' }, cursor: 'old-page' } as const;
  assert.deepEqual(changeCatalogLocale(view, 'de'), { ...view, locale: 'de', cursor: null });
});

test('Popular requires enough eligible palettes across 30 full UTC days and deterministic ties', () => {
  assert.deepEqual(popularityWindow(new Date('2026-03-01T07:12:00Z')), { from: '2026-01-30', before: '2026-03-01' });
  assert.deepEqual(chooseCatalogSort('popular', 'palette', true, { events: 24n, palettes: 6 }),
    { sort: 'featured', reason: 'insufficient-activity' });
  assert.equal(chooseCatalogSort('popular', 'palette', true, { events: 25n, palettes: 4 }).sort, 'featured');
  assert.equal(chooseCatalogSort('popular', 'palette', false, { events: 30n, palettes: 5 }).reason, 'measurement-disabled');
  assert.equal(chooseCatalogSort('popular', 'palette', true, { events: 25n, palettes: 5 }).sort, 'popular');
  const items = [{ itemId: 'b', events: 9n, featuredRank: 0 }, { itemId: 'a', events: 9n, featuredRank: null },
    { itemId: 'c', events: 7n, featuredRank: 2 }];
  const first = catalogPage(items, 'popular', 1);
  assert.equal(first.items[0]?.itemId, 'a');
  assert.deepEqual(catalogPage(items, 'popular', 2, first.next!).items.map(item => item.itemId), ['b', 'c']);
  assert.equal(catalogPage(items, 'featured', 1).items[0]?.itemId, 'b');
});

test('catalog queries use localized names, exact HEX and typed family, count and mood facets', () => {
  const entry = { kind: 'palette', locale: 'fr', slug: 'summer', title: 'Été calme',
    payload: { swatches: [{ color: parseColor('#00f') }, { color: parseColor('#fff') }] } } as const;
  assert(matchesCatalog(entry, normalizeCatalogFilters({ query: 'ete', colorCount: 2 }, 'fr')));
  assert(matchesCatalog(entry, normalizeCatalogFilters({ query: '#00F', family: 'blue' }, 'fr')));
  assert(!matchesCatalog(entry, normalizeCatalogFilters({ query: '#111' }, 'fr')));
  const mood = normalizeCatalogFilters({ mood: 'calm' }, 'fr');
  assert(!matchesCatalog(entry, mood));
  assert(matchesCatalog(entry, mood, [{ facet: 'mood', slug: 'calm' }]));
  assert.throws(() => normalizeCatalogFilters({ colorCount: -1 }, 'en'), RangeError);
});
