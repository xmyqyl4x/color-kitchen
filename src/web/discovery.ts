import { nearestPublishedColor, publicCatalogDetail, publicCatalogListing } from '../catalog/public.js';
import { paletteMoods } from '../catalog/palette-moods.js';
import type { CatalogEntry } from '../catalog/repository.js';
import { atlasFamilies, catalogSearchHex } from '../catalog/search.js';
import { toHex } from '../color/convert.js';
import { assertColor } from '../color/parse.js';
import { gradientTypes, isGradientType } from '../gradient/gradient.js';
import { catalogListOptions, type CatalogHttpDependencies } from '../http/public-catalog.js';
import type { Locale } from '../model/locales.js';
import { discoveryText } from './discovery-text.js';
import { html, pathFor } from './shell.js';
import { screenTitle } from './strings.js';

export const discoveryKinds = { palettes: 'palette', gradients: 'gradient', colors: 'color' } as const;
type Screen = keyof typeof discoveryKinds;
const families = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'magenta', 'neutral'] as const;
const lightness = ['dark', 'medium', 'light'] as const;

function link(value: string | null, label: string) {
  try {
    if (value && new URL(value).protocol === 'https:') return '<a href="' + html(value) + '" rel="noreferrer">' + html(label) + '</a>';
  } catch { /* Display the attribution as text when a published URL is unavailable. */ }
  return html(label);
}

export function discoveryPage(deps: CatalogHttpDependencies) {
  return async (request: Request, screen: Screen, locale: Locale, slug?: string) => {
    const url = new URL(request.url);
    const kind = discoveryKinds[screen];
    const t = (key: Parameters<typeof discoveryText>[1]) => html(discoveryText(locale, key));
    const path = pathFor(locale, screen);
    const measurement = kind === 'palette' && deps.measurement === true;
    const title = screenTitle(locale, screen);
    const params = new URLSearchParams(url.search);
    const search = params.get('q') ?? '';
    const sectionClass = kind === 'color' ? 'color-atlas' : kind === 'gradient' ? 'gradient-gallery' : '';
    const card = (entry: CatalogEntry, detail = false) => {
      const isColor = entry.kind === 'color';
      const isGradient = entry.kind === 'gradient';
      const heading = detail ? '' : '<h2><a href="' + path + '/' + entry.slug + '" data-focus-key="entry-' + entry.slug +
        '">' + html(entry.title) + '</a></h2>';
      const provenance = '<p>' + t('source') + ' · ' + link(entry.sourceUri, entry.attribution ?? entry.origin) + '<br>' +
        t('license') + ' · ' + link(entry.licenseUri, entry.licenseId) + '</p>';
      let description = '<p>' + html(entry.summary) + '</p>' + provenance;
      if (isColor) {
        const color = entry.payload.color;
        assertColor(color);
        const aliases = Array.isArray(entry.payload.aliases) ? entry.payload.aliases.filter(value => typeof value === 'string') : [];
        const keyword = typeof entry.payload.keyword === 'string' ? [entry.payload.keyword, ...aliases] : [];
        description = '<p class="atlas-hex"><code>' + html(toHex(color).hex) + '</code></p>' + (detail
          ? (keyword.length ? '<p>' + t('exact') + ' · ' + keyword.map(name => '<code>' + html(name) + '</code>').join(', ') + '</p>'
            : '<p>' + html(entry.summary) + '</p>') + provenance : '');
      }
      if (isGradient && isGradientType(entry.payload.type)) {
        description = '<p class="gradient-gallery-type">' + t(entry.payload.type) + '</p><p>' + html(entry.summary) + '</p>';
        if (detail && Array.isArray(entry.payload.stops)) {
          const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 });
          const stops = entry.payload.stops.map(({ color, position }) => {
            assertColor(color);
            return '<li><code>' + html(toHex(color).hex) + '</code> <span>' + html(percent.format(position)) + '</span></li>';
          });
          description += '<p class="gradient-gallery-type">' + t('gradientStops') + '</p><ol class="gallery-stops">' + stops.join('') + '</ol>' + provenance;
        }
      }
      return '<li class="collection-card" data-catalog-item="' + html(JSON.stringify({
        title: entry.title, itemId: entry.itemId, kind: entry.kind, payload: entry.payload,
      })) + '"><div class="collection-strip" aria-hidden="true"></div><div class="collection-card-body">' + heading + description +
        '<div class="studio-actions"><button disabled class="button" data-catalog-action="copy">' + t(isColor ? 'copyHex' : isGradient ? 'copyCss' : 'copy') + '</button>' +
        (entry.kind === 'palette' || detail ? '<button disabled class="button" data-catalog-action="save">' + t('save') + '</button>' : '') +
        '<button disabled class="button primary" data-catalog-action="edit">' + t(isColor ? 'inspect' : isGradient ? 'editGradient' : 'edit') + '</button></div>' +
        '<p data-catalog-status role="status"></p></div></li>';
    };
    if (slug) {
      const result = await deps.withClient(client => publicCatalogDetail(client, kind, slug, locale));
      if (!result) return null;
      const entry = result.entry;
      if (entry.slug !== slug) return new Response(null, { status: 302, headers: { Location: result.metadata.canonical, 'Cache-Control': 'no-store' } });
      return { title: entry.title, description: entry.summary,
        content: '<section class="studio" data-measurement="' + measurement + '"><h1>' + html(entry.title) + '</h1><a class="secondary-link" href="' + path + '">' + html(title) +
          '</a><ul class="collection-grid' + (sectionClass ? ' ' + sectionClass + '-detail' : '') + '">' + card(entry, true) + '</ul></section>', index: true, status: 200 };
    }
    const select = (key: Parameters<typeof discoveryText>[1], options: readonly string[], first = '') =>
      '<label>' + t(key) + '<select name="' + key + '"><option value="">' + first + '</option>' + options.map(choice =>
        '<option value="' + choice + '"' + (params.get(key) === choice ? ' selected' : '') + '>' +
        (/^\d+$/.test(choice) ? choice : t(choice as Parameters<typeof t>[0])) + '</option>').join('') + '</select></label>';
    const form = '<form class="studio discovery-form" method="get" action="' + path + '">' +
      '<label>' + t(kind === 'color' ? 'colorSearch' : kind === 'gradient' ? 'gradientSearch' : 'search') +
      '<input ' + (kind !== 'palette' ? 'type="search" spellcheck="false" ' : '') +
      'name="q" maxlength="120" value="' + html(search.slice(0, 120)) + '"></label>' +
      (kind === 'gradient' ? select('type', gradientTypes, t('anyGradientType')) : '') +
      select('family', kind === 'color' ? atlasFamilies : families, kind !== 'palette' ? t('allFamilies') : '') +
      select('lightness', lightness, kind !== 'palette' ? t('anyLightness') : '') +
      (kind === 'palette' ? select('count', Array.from({ length: 11 }, (_, index) => String(index + 2))) +
        '<label>' + t('mood') + '<input name="mood" list="palette-moods" value="' + html((params.get('mood') ?? '').slice(0, 100)) +
        '" maxlength="100"></label><datalist id="palette-moods">' + Object.entries(paletteMoods).map(([slug, labels]) =>
          '<option value="' + slug + '" label="' + html(labels[locale]) + '"></option>').join('') + '</datalist>' +
        select('sort', ['featured', 'popular']) : '') +
      '<div class="studio-actions"><button class="button primary" type="submit">' + t('submit') +
        '</button><a class="secondary-link" href="' + path + '">' + t('clear') + '</a></div></form>';
    let results: Awaited<ReturnType<typeof publicCatalogListing>>;
    const listing = { kind, locale, now: deps.now?.() ?? new Date(), measurement: deps.measurement === true };
    try {
      const options = catalogListOptions({ get: key => params.get(key) || undefined });
      results = await deps.withClient(client => publicCatalogListing(client, { ...listing, ...options, limit: options.limit ?? (kind === 'color' ? 24 : 12) }));
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return { title, content: '<h1>' + html(title) + '</h1>' + form + '<p role="status">' + t('invalid') + '</p>', index: false, status: 400 };
    }
    let nearest: CatalogEntry | undefined;
    if (kind === 'color' && results.items.length === 0 && [...params].every(([key, value]) => key === 'q' || key === 'limit' || value === '')) {
      const hex = catalogSearchHex(search, true);
      if (hex?.length === 7) nearest = await deps.withClient(client => nearestPublishedColor(client, locale, hex));
    }
    const sort = kind === 'palette' ? '<p class="discovery-sort">' + t(results.sort) + (results.reason
      ? ' · ' + t(results.reason === 'measurement-disabled' ? 'off' : 'cold') : '') + '</p>' : '';
    const entries = results.items.map(({ entry }) => card(entry)).join('');
    const note = nearest ? '<p class="discovery-approximation" role="status">' + t('nearest') + '</p>' :
      entries ? '' : '<p role="status">' + t('empty') + '</p>';
    const cards = nearest ? card(nearest) : entries;
    const more = new URLSearchParams(params);
    if (results.nextCursor) more.set('cursor', results.nextCursor);
    const next = results.nextCursor ? '<a class="button" href="' + path + '?' + html(more.toString()) +
      '" data-focus-key="catalog-next">' + t('next') + '</a>' : '';
    return { title, content: '<section data-measurement="' + measurement + '"><h1>' + html(title) + '</h1>' + form + sort + note +
        (cards ? '<ul class="collection-grid' + (sectionClass ? ' ' + sectionClass + '-grid' : '') + '">' + cards + '</ul>' : '') + next + '</section>',
      index: !search && !params.get('cursor'), status: 200 };
  };
}
