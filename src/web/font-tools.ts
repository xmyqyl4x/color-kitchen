import { bundledFontsBySlug } from '../catalog/bundled-fonts.js';
import { publicCatalogDetail, publicCatalogListing } from '../catalog/public.js';
import type { CatalogEntry } from '../catalog/repository.js';
import type { CatalogHttpDependencies } from '../http/public-catalog.js';
import type { Locale } from '../model/locales.js';
import { catalogFont, fontCategories, isFontCategory } from '../typography/fonts.js';
import { collectionText } from './collection-text.js';
import { fontToolsText } from './font-tools-text.js';
import { html, pathFor } from './shell.js';
import { screenTitle } from './strings.js';

function downloadFor(entry: CatalogEntry) {
  const font = bundledFontsBySlug.get(entry.slug);
  if (!font || entry.origin !== 'licensed' || entry.licenseId !== font.licenseId || entry.sourceDigest !== font.sourceDigest ||
      entry.payload.filename !== font.filename || entry.payload.notice !== font.notice) return null;
  return { slug: entry.slug, metadata: catalogFont({ family: font.family, weight: font.weight, weightRange: font.weightRange, scripts: font.scripts }),
    font: '/assets/fonts/' + font.filename, notice: '/assets/fonts/' + font.notice, category: font.category ?? 'sans' } as const;
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
    const script = screen === 'fonts' ? (params.get('script') ?? '').slice(0, 12) : '';
    const category = screen === 'fonts' ? (params.get('category') ?? '') : '';
    const weight = screen === 'fonts' ? Number(params.get('weight') ?? '') : 0;
    const target = slug ? await deps.withClient(client => publicCatalogDetail(client, 'font', slug, locale)) : null;
    if (slug && !target) return null;
    const listing = () => deps.withClient(async client => (await publicCatalogListing(client, {
      kind: 'font', locale, now: new Date(), measurement: false, filters: { query }, limit: 50,
    })).items.map(({ entry }) => entry));
    const data = target ? [target.entry] : screen === 'type-playground' ? await listing().catch(() => []) : await listing();
    const entries = data.map(entry => ({ entry, asset: downloadFor(entry) })).filter(({ entry, asset }) => slug ||
      ((!script || (Array.isArray(entry.payload.scripts) && entry.payload.scripts.includes(script))) &&
        (!category || (asset?.category ?? entry.payload.category) === category) &&
        (!weight || (asset?.metadata.axes?.wght ? weight >= asset.metadata.axes.wght.min && weight <= asset.metadata.axes.wght.max :
          entry.payload.weight === weight))));
    const title = target?.entry.title ?? screenTitle(locale, screen);
    if (screen === 'fonts') {
      const cards = entries.map(({ entry, asset }) => {
        const group = asset?.category ?? entry.payload.category;
        const weightAxis = asset?.metadata.axes?.wght;
        const weightLabel = weightAxis ? `${weightAxis.min}–${weightAxis.max}` : String(entry.payload.weight ?? '');
        const categoryLabel = isFontCategory(group) ? t(group) : '';
        const metadata = slug ? '<p>' + t('author') + ' · ' + html(entry.attribution ?? '') + '<br>' + t('source') + ' · ' +
          external(entry.sourceUri, (entry.sourceVersion ?? entry.origin).slice(0, 18)) + '<br>' + t('license') + ' · ' +
          external(entry.licenseUri, entry.licenseId) + '<br>' + t('scripts') + ' · ' + html(String(entry.payload.scripts ?? '')) + '</p>' : '';
        return '<li class="collection-card" data-font-face="' + html(JSON.stringify(asset)) + '"><div class="collection-card-body">' +
          (slug ? '' : '<h2><a href="' + pathFor(locale, screen, entry.slug) + '" data-focus-key="entry-' + entry.slug + '">' + html(entry.title) + '</a></h2>') +
          '<p class="font-card-meta">' + [categoryLabel, weightLabel ? t('weight') + ' ' + html(weightLabel) : ''].filter(Boolean).join(' · ') + '</p>' +
          '<p>' + html(entry.summary) + '</p><p data-font-sample class="font-sample">' + t('example') + '</p><p data-font-status role="status"></p>' + metadata +
          (asset ? '<div class="studio-actions"><a class="button primary" href="' + pathFor(locale, 'type-playground') + '#font=' + entry.slug +
            '">' + t('open') + '</a><a class="button" download href="' + asset.font + '">' + t('download') +
            '</a></div><p><a href="' + asset.notice + '">' + t('license') + '</a></p>' : '') + '</div></li>';
      }).join('');
      const option = (value: string, label: string, selected: string) => '<option value="' + value + '"' +
        (value === selected ? ' selected' : '') + '>' + label + '</option>';
      const filters = '<form class="studio discovery-form" method="get" action="' + pathFor(locale, screen) + '">' +
        '<label>' + t('family') + '<input type="search" name="q" maxlength="120" value="' + html(query) + '"></label>' +
        '<label>' + t('category') + '<select name="category">' + option('', t('allCategories'), category) +
        fontCategories.map(value => option(value, t(value), category)).join('') + '</select></label>' +
        '<label>' + t('scripts') + '<select name="script">' + option('', t('allScripts'), script) +
        (['Latn', 'Grek', 'Cyrl'] as const).map(value => option(value, t(value), script)).join('') + '</select></label><label>' +
        t('weight') + '<input type="number" name="weight" min="1" max="1000" value="' + (weight || '') + '"></label>' +
        '<div class="studio-actions"><button class="button primary" type="submit">' + t('search') + '</button><a class="secondary-link" href="' +
        pathFor(locale, 'fonts') + '">' + t('clear') + '</a></div></form>';
      return { title, index: Boolean(slug) || (!query && !category && !script && !weight),
        content: '<section class="studio fonts-ui"><h1>' + html(title) + '</h1>' + (slug ? '<a class="secondary-link" href="' +
          pathFor(locale, 'fonts') + '">' + html(screenTitle(locale, 'fonts')) + '</a>' : filters) +
        '<label class="font-preview-control">' + t('sample') + '<input id="font-library-sample" maxlength="180" value="' + t('example') + '"></label>' +
        (cards ? '<ul class="collection-grid font-library-grid' + (slug ? ' font-library-detail' : '') + '">' + cards + '</ul>' :
          '<p role="status">' + t('empty') + '</p>') + '</section>' };
    }
    const fonts = entries.flatMap(({ asset }) => asset ? [asset] : []);
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
