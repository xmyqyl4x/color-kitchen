import { publicCatalogDetail, publicCatalogListing } from '../catalog/public.js';
import type { CatalogEntry } from '../catalog/repository.js';
import type { CatalogHttpDependencies } from '../http/public-catalog.js';
import type { Locale } from '../model/locales.js';
import { catalogFont } from '../typography/fonts.js';
import { collectionText } from './collection-text.js';
import { fontToolsText } from './font-tools-text.js';
import { html, pathFor } from './shell.js';
import { screenTitle, webText } from './strings.js';

function downloadFor(entry: CatalogEntry) {
  if (entry.payload.filename !== 'SourceSans3-Regular.woff2' || entry.payload.notice !== 'SourceSans3-OFL.txt' ||
      entry.licenseId !== 'OFL-1.1' || entry.sourceDigest !== '53492fb3a0def77354f166a55d09b63a10855e91c206c7620a81cf56e97f8ec3') return null;
  return { slug: entry.slug, metadata: catalogFont(entry.payload),
    font: '/assets/fonts/SourceSans3-Regular.woff2', notice: '/assets/source-sans-license.txt' };
}

function external(url: string | null, label: string) {
  try { if (url && new URL(url).protocol === 'https:') return '<a rel="noreferrer" href="' + html(url) + '">' + html(label) + '</a>'; }
  catch { /* The published label is still readable. */ }
  return html(label);
}

export function fontToolsPage(deps: CatalogHttpDependencies) {
  return async (request: Request, locale: Locale, screen: 'fonts' | 'type-playground', slug?: string) => {
    const t = (key: Parameters<typeof fontToolsText>[1]) => html(fontToolsText(locale, key));
    const params = new URL(request.url).searchParams;
    const query = screen === 'fonts' ? (params.get('q') ?? '').slice(0, 120) : '';
    const script = screen === 'fonts' ? (params.get('script') ?? '') : '';
    const weight = screen === 'fonts' ? Number(params.get('weight') ?? '') : 0;
    const target = slug ? await deps.withClient(client => publicCatalogDetail(client, 'font', slug, locale)) : null;
    if (slug && !target) return null;
    const listing = () => deps.withClient(async client => (await publicCatalogListing(client, {
      kind: 'font', locale, now: new Date(), measurement: false, filters: { query }, limit: 50,
    })).items.map(({ entry }) => entry));
    const data = target ? [target.entry] : screen === 'type-playground' ? await listing().catch(() => []) : await listing();
    const entries = data.filter(entry => (!script || (Array.isArray(entry.payload.scripts) && entry.payload.scripts.includes(script))) &&
      (!weight || entry.payload.weight === weight));
    const title = target?.entry.title ?? screenTitle(locale, screen);
    if (screen === 'fonts') {
      const cards = entries.map(entry => {
        const asset = downloadFor(entry);
        return '<li class="collection-card" data-font-face="' + html(JSON.stringify(asset)) + '"><div class="collection-card-body">' +
          (slug ? '' : '<h2><a href="' + pathFor(locale, screen, entry.slug) + '" data-focus-key="entry-' + entry.slug + '">' + html(entry.title) + '</a></h2>') +
          '<p>' + html(entry.summary) + '</p><p data-font-sample class="font-sample">' + t('example') + '</p><p data-font-status role="status"></p>' +
          '<p>' + t('author') + ' · ' + html(entry.attribution ?? '') + '<br>' + t('source') + ' · ' +
          external(entry.sourceUri, entry.sourceVersion ?? entry.origin) + '<br>' + t('license') + ' · ' +
          external(entry.licenseUri, entry.licenseId) + '<br>' + t('scripts') + ' · ' + html(String(entry.payload.scripts)) +
          ' · ' + t('weight') + ' ' + html(String(entry.payload.weight)) + '</p>' +
          (asset ? '<div class="studio-actions"><a class="button" download href="' + asset.font + '">' + t('download') +
            '</a><a class="button" href="' + asset.notice + '">' + t('license') + '</a><a class="button primary" href="' +
            pathFor(locale, 'type-playground') + '#font=' + entry.slug + '">' + t('open') + '</a></div>' : '') + '</div></li>';
      }).join('');
      const filters = '<form class="studio discovery-form" method="get" action="' + pathFor(locale, screen) + '">' +
        '<label>' + t('family') + '<input name="q" maxlength="120" value="' + html(query) + '"></label><label>' + t('scripts') +
        '<input name="script" value="' + html(script.slice(0, 12)) + '" maxlength="12" placeholder="Latn"></label><label>' +
        t('weight') + '<input type="number" name="weight" min="1" max="1000" value="' + (weight || '') + '"></label>' +
        '<button class="button primary" type="submit">' + html(webText(locale, 'explore')) + '</button></form>';
      return { title, index: !query, content: '<section class="studio fonts-ui"><h1>' + html(title) + '</h1>' + (slug ? '' : filters) +
        '<label>' + t('sample') + '<input id="font-library-sample" maxlength="180" value="' + t('example') + '"></label>' +
        (cards ? '<ul class="collection-grid">' + cards + '</ul>' : '<p>' + html(webText(locale, 'empty')) + '</p>') + '</section>' };
    }
    const fonts = entries.map(downloadFor).filter(Boolean);
    const field = (id: string, label: string, value: string, bounds = '') => '<label>' + label + '<input id="' + id + '" value="' + value + '"' + bounds + '></label>';
    const button = (id: string, label: string) => '<button class="button" type="button" id="' + id + '">' + label + '</button>';
    return { title, index: true, content: `<section class="studio fonts-ui" data-type-assets="${html(JSON.stringify(fonts))}">
      <h1>${html(title)}</h1><div class="image-tools-layout"><div class="studio-panel">
        <label>${t('sample')}<textarea maxlength="1000" rows="4" id="type-text">${t('example')}</textarea></label>
        <label>${t('family')}<select id="type-family"><option value="">${t('system')}</option></select></label>
        <div class="numeric-grid"><label>${t('weight')}<select id="type-weight"></select></label>
        ${field('type-size', t('size'), '32', ' type="number" min="8" max="96"')}
        ${field('type-height', t('height'), '1.3', ' type="number" min=".75" max="3" step=".05"')}
        ${field('type-spacing', t('spacing'), '0', ' type="number" min="-.5" max="1" step=".02"')}
        ${field('type-color', t('color'), '#202722', ' maxlength="160"')}</div>
        <label><input type="checkbox" id="type-fallback"> ${t('allowFallback')}</label>
        <div class="studio-actions">${button('type-css', t('css'))}${button('type-image', t('image'))}${button('type-plain', t('plain'))}</div>
        <p id="type-status" role="status"></p>
        <textarea id="type-copy" hidden readonly aria-label="${html(collectionText(locale, 'content'))}"></textarea>
      </div><div class="studio-panel"><p id="type-preview" class="font-sample"></p><p id="type-coverage" role="status"></p>
      <p>${t('limitation')}</p><div id="type-variants"></div></div></div></section>` };
  };
}
