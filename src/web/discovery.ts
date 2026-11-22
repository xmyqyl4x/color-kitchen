import { publicCatalogDetail, publicCatalogListing } from '../catalog/public.js';
import type { CatalogEntry } from '../catalog/repository.js';
import { convertColor } from '../color/convert.js';
import { assertColor, parseColor } from '../color/parse.js';
import { catalogListOptions, type CatalogHttpDependencies } from '../http/public-catalog.js';
import type { ColorValue } from '../model/color.js';
import type { Locale } from '../model/locales.js';
import { discoveryText } from './discovery-text.js';
import { html, pathFor } from './shell.js';
import { screenTitle } from './strings.js';

export const discoveryKinds = { palettes: 'palette', gradients: 'gradient', colors: 'color' } as const;
type Screen = keyof typeof discoveryKinds;
const families = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'magenta', 'neutral'] as const;
const lightness = ['dark', 'medium', 'light'] as const;

function coordinates(color: ColorValue) {
  const [l, c, h] = convertColor(color, 'oklch').color.components;
  const a = h * Math.PI / 180;
  return [l, c * Math.cos(a), c * Math.sin(a)];
}

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
    const card = (entry: CatalogEntry, detail = false) => '<li class="collection-card" data-catalog-item="' + html(JSON.stringify({
      title: entry.title, itemId: entry.itemId, kind: entry.kind, payload: entry.payload,
    })) + '"><div class="collection-strip" aria-hidden="true"></div><div class="collection-card-body">' +
      (detail ? '' : '<h2><a href="' + path + '/' + entry.slug + '" data-focus-key="entry-' + entry.slug + '">' + html(entry.title) + '</a></h2>') +
      '<p>' + html(entry.summary) + '</p>' +
      (kind === 'color' && typeof entry.payload.keyword === 'string' ? '<p>' + t('exact') + ' · <code>' + html(entry.payload.keyword) + '</code></p>' : '') +
      '<p>' + t('source') + ' · ' + link(entry.sourceUri, entry.attribution ?? entry.origin) + '<br>' +
        t('license') + ' · ' + link(entry.licenseUri, entry.licenseId) + '</p>' +
      '<div class="studio-actions"><button disabled class="button" data-catalog-action="copy">' + t('copy') +
      '</button><button disabled class="button" data-catalog-action="save">' + t('save') +
      '</button><button disabled class="button primary" data-catalog-action="edit">' + t('edit') + '</button></div>' +
      '<p data-catalog-status role="status"></p></div></li>';
    if (slug) {
      const result = await deps.withClient(client => publicCatalogDetail(client, kind, slug, locale));
      if (!result && kind === 'color') {
        const alias = await deps.withClient(async client => (await client.query<{ slug: string }>(
          "SELECT slug FROM ck.published_catalog WHERE kind = 'color' AND locale = $1 AND payload->'aliases' ? $2 ORDER BY slug LIMIT 1",
          [locale, slug])).rows[0]?.slug);
        if (alias) return new Response(null, { status: 302, headers: { Location: path + '/' + alias, 'Cache-Control': 'no-store' } });
      }
      if (!result) return null;
      const entry = result.entry;
      return { title: entry.title, description: entry.summary,
        content: '<section class="studio" data-measurement="' + measurement + '"><h1>' + html(entry.title) + '</h1><a class="secondary-link" href="' + path + '">' + html(title) +
          '</a><ul class="collection-grid">' + card(entry, true) + '</ul></section>', index: true, status: 200 };
    }
    const select = (key: Parameters<typeof discoveryText>[1], options: readonly string[]) =>
      '<label>' + t(key) + '<select name="' + key + '"><option value=""></option>' + options.map(choice =>
        '<option value="' + choice + '"' + (params.get(key) === choice ? ' selected' : '') + '>' +
        (/^\d+$/.test(choice) ? choice : t(choice as Parameters<typeof t>[0])) + '</option>').join('') + '</select></label>';
    const form = '<form class="studio discovery-form" method="get" action="' + path + '">' +
      '<label>' + t('search') + '<input name="q" maxlength="120" value="' + html(search.slice(0, 120)) + '"></label>' +
      select('family', families) + select('lightness', lightness) +
      (kind === 'palette' ? select('count', Array.from({ length: 11 }, (_, index) => String(index + 2))) +
        '<label>' + t('mood') + '<input name="mood" value="' + html((params.get('mood') ?? '').slice(0, 100)) + '" maxlength="100"></label>' +
        select('sort', ['featured', 'popular']) : '') +
      '<div class="studio-actions"><button class="button primary" type="submit">' + t('submit') +
        '</button><a class="secondary-link" href="' + path + '">' + t('clear') + '</a></div></form>';
    let results: Awaited<ReturnType<typeof publicCatalogListing>>;
    const listing = { kind, locale, now: deps.now?.() ?? new Date(), measurement: deps.measurement === true };
    try {
      const options = catalogListOptions({ get: key => params.get(key) || undefined });
      results = await deps.withClient(client => publicCatalogListing(client, { ...listing, ...options, limit: options.limit ?? 12 }));
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return { title, content: '<h1>' + html(title) + '</h1>' + form + '<p role="status">' + t('invalid') + '</p>', index: false, status: 400 };
    }
    let nearest: CatalogEntry | undefined;
    if (kind === 'color' && results.items.length === 0 && /^#[0-9a-f]{6}$/i.test(search) &&
        [...params].every(([key, value]) => key === 'q' || value === '')) {
      const target = coordinates(parseColor(search));
      const candidates = await deps.withClient(client => publicCatalogListing(client, { ...listing, limit: 50 }));
      let closest = Infinity;
      for (const { entry } of candidates.items) {
        const color = entry.payload.color;
        assertColor(color);
        const distance = coordinates(color).reduce((sum, value, index) => sum + (value - target[index]!) ** 2, 0);
        if (distance < closest) { closest = distance; nearest = entry; }
      }
    }
    const sort = kind === 'palette' ? '<p class="discovery-sort">' + t(results.sort) + (results.reason
      ? ' · ' + t(results.reason === 'measurement-disabled' ? 'off' : 'cold') : '') + '</p>' : '';
    const entries = results.items.map(({ entry }) => card(entry)).join('');
    const empty = entries ? '' : '<p role="status">' + t('empty') + '</p>';
    const approximation = nearest ? '<li class="discovery-approximation">' + t('nearest') + '</li>' + card(nearest) : '';
    const more = new URLSearchParams(params);
    if (results.nextCursor) more.set('cursor', results.nextCursor);
    const next = results.nextCursor ? '<a class="button" href="' + path + '?' + html(more.toString()) +
      '" data-focus-key="catalog-next">' + t('next') + '</a>' : '';
    return { title, content: '<section data-measurement="' + measurement + '"><h1>' + html(title) + '</h1>' + form + sort + empty +
        '<ul class="collection-grid">' + entries + approximation + '</ul>' + next + '</section>',
      index: !search && !params.get('cursor'), status: 200 };
  };
}
