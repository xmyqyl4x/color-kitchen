import { createHash } from 'node:crypto';
import { advertisingEligibility } from '../operations/consent.js';
import { trustText } from './trust-text.js';
import { locales, type Locale } from '../model/locales.js';
import { topicPath, type DiscoveryTopic } from './discovery-topics.js';
import { pageSeo, seoLabels } from './seo-text.js';
import { createRoutes, exploreRoutes, helpRoutes, languageNames, screenTitle, webText, type Screen } from './strings.js';

export function html(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

const importMap = '{"imports":{"pdf-lib":"/vendor/pdf-lib.js"}}';
const importMapHash = createHash('sha256').update(importMap).digest('base64');
const policy = "default-src 'self'; script-src 'self' 'sha256-" + importMapHash +
  "'; img-src 'self' blob: data:; worker-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

export const pathFor = (locale: Locale, screen: Screen, slug?: string) =>
  '/' + locale + (screen ? '/' + screen : '') + (slug ? '/' + slug : '');

const socialLocales = { en: 'en_US', fr: 'fr_FR', es: 'es_ES', pt: 'pt_PT', de: 'de_DE' } as const;
type Crumb = { name: string; path: string };

function searchHead(url: URL, locale: Locale, title: string, description: string, localPath: (language: Locale) => string,
    type: 'WebPage' | 'CollectionPage', breadcrumbs: readonly Crumb[], home: boolean) {
  const canonical = new URL(localPath(locale), url).href;
  const image = new URL('/assets/social-card.png', url).href;
  const imageAlt = seoLabels(locale).image;
  const meta = (attr: 'name' | 'property', key: string, value: string) =>
    '<meta ' + attr + '="' + key + '" content="' + html(value) + '">';
  const alternates = [...locales.map(language => [language, localPath(language)] as const), ['x-default', localPath('en')] as const];
  const website = new URL('/', url).href;
  const websiteId = website + '#website';
  const graph: object[] = [
    { '@type': type, '@id': canonical + '#webpage', url: canonical, name: title, description, inLanguage: locale,
      isPartOf: { '@id': websiteId }, ...(breadcrumbs.length ? { breadcrumb: { '@id': canonical + '#breadcrumb' } } : {}) },
  ];
  if (home) graph.push({ '@type': 'WebSite', '@id': websiteId, url: website, name: 'Color Kitchen', inLanguage: locales });
  if (breadcrumbs.length) graph.push({
    '@type': 'BreadcrumbList', '@id': canonical + '#breadcrumb',
    itemListElement: breadcrumbs.map(({ name, path }, index) =>
      ({ '@type': 'ListItem', position: index + 1, name, item: new URL(path, url).href })),
  });
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replaceAll('<', '\\u003c');
  return [
    '<link rel="canonical" href="' + html(canonical) + '">',
    ...alternates.map(([language, path]) => '<link rel="alternate" hreflang="' + language + '" href="' + html(new URL(path, url).href) + '">'),
    meta('name', 'robots', 'max-image-preview:large'),
    ...Object.entries({
      'og:type': 'website', 'og:site_name': 'Color Kitchen', 'og:title': title, 'og:description': description, 'og:url': canonical,
      'og:locale': socialLocales[locale], 'og:image': image, 'og:image:type': 'image/png',
      'og:image:width': '1200', 'og:image:height': '630', 'og:image:alt': imageAlt,
    }).map(([key, value]) => meta('property', key, value)),
    ...locales.filter(language => language !== locale).map(language => meta('property', 'og:locale:alternate', socialLocales[language])),
    ...Object.entries({
      'twitter:card': 'summary_large_image', 'twitter:title': title, 'twitter:description': description,
      'twitter:image': image, 'twitter:image:alt': imageAlt,
    }).map(([key, value]) => meta('name', key, value)),
    '<script type="application/ld+json">' + json + '</script>',
  ].join('');
}

function breadcrumbNav(locale: Locale, breadcrumbs: readonly Crumb[]) {
  if (!breadcrumbs.length) return '';
  return '<nav class="breadcrumbs" aria-label="' + html(seoLabels(locale).breadcrumb) + '"><ol>' +
    breadcrumbs.map(({ name, path }, index) => '<li>' + (index === breadcrumbs.length - 1
      ? '<span aria-current="page">' + html(name) + '</span>'
      : '<a href="' + html(path) + '">' + html(name) + '</a>') + '</li>').join('') + '</ol></nav>';
}

export function approvedAdFrame(config?: string) {
  if (!config) return undefined;
  const url = new URL(config);
  if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048) {
    throw new RangeError('Ad frame configuration requires an approved HTTPS URL.');
  }
  return url;
}

function link(locale: Locale, path: Screen, label: string, key: string, className = '') {
  return '<a class="' + className + '" data-focus-key="' + key + '" href="' + pathFor(locale, path) + '">' + html(label) + '</a>';
}

function menu(locale: Locale, label: string, screens: readonly Screen[], key: string) {
  return '<details><summary>' + html(label) + '</summary><div class="menu-panel">' +
    screens.map(screen => link(locale, screen, screenTitle(locale, screen), key + '-' + screen)).join('') + '</div></details>';
}

export function homeScreen(locale: Locale) {
  const t = (key: Parameters<typeof webText>[1]) => html(webText(locale, key));
  const action = (screen: Screen, title: string, key: string, css: string) => link(locale, screen, title, key, css);
  return `<section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">${t('free')}</p>
      <h1>${t('heading').replace('\n', '<br>')}</h1>
      <p class="hero-description">${t('intro')}</p>
      <div class="actions">
        ${action('palette-studio', webText(locale, 'start'), 'hero-create', 'button primary')}
        ${action('palettes', webText(locale, 'browse'), 'hero-explore', 'button')}
      </div>
    </div>
    <figure class="palette-study">
      <figcaption>${t('artwork')}</figcaption>
      <div class="landscape" aria-hidden="true"><i class="sun"></i><i class="ridge distant"></i>
        <i class="ridge near"></i><i class="river"></i></div>
      <div class="study-colors">
        <span>#213C35</span><span>#6F8F7B</span><span>#E4B363</span><span>#E9DED0</span><span>#F8F5EF</span>
      </div>
      ${action('image-to-palette', webText(locale, 'tryImage'), 'hero-image', 'image-link')}
    </figure>
  </section>
  <section class="quick-tools" aria-label="${t('navigation')}">
    ${action('palette-studio', screenTitle(locale, 'palette-studio'), 'quick-create', 'quick create')}
    ${action('image-to-palette', screenTitle(locale, 'image-to-palette'), 'quick-image', 'quick image')}
    ${action('contrast', webText(locale, 'pair'), 'quick-contrast', 'quick contrast')}
  </section>
  <section class="continue">
    <h2>${t('more')}</h2><p>${t('draft')}</p>
    <div class="actions">${(['design-preview', 'gradient-studio', 'fonts'] as const).map(screen =>
      action(screen, screenTitle(locale, screen), 'continue-' + screen, 'secondary-link')).join('')}</div>
  </section>`;
}

export function renderShell(request: Request, options: Readonly<{
  locale: Locale; screen: Screen; title: string; content: string; slug?: string; topic?: DiscoveryTopic; index?: boolean;
  status?: number; seoTitle?: string; description?: string; module?: string; adFrame?: URL;
}>) {
  const { locale, screen, slug, topic, title, content, status = 200, module } = options;
  const index = options.index === true && status === 200;
  const t = (key: Parameters<typeof webText>[1]) => html(webText(locale, key));
  const url = new URL(request.url);
  const localPath = (language: Locale) => topic ? topicPath(language, topic) : pathFor(language, screen, slug);
  const copy = index && !slug && !topic ? pageSeo(locale, screen) : undefined;
  const pageTitle = options.seoTitle ?? copy?.[0] ?? title;
  const fullTitle = pageTitle === 'Color Kitchen' ? pageTitle : pageTitle + ' | Color Kitchen';
  const description = options.description ?? copy?.[1] ?? webText(locale, 'intro');
  const breadcrumbs = index && (slug || topic) ? [
    { name: webText(locale, 'home'), path: pathFor(locale, '') },
    { name: screenTitle(locale, screen), path: pathFor(locale, screen) },
    { name: title, path: localPath(locale) },
  ] : [];
  const collection = !slug && (exploreRoutes as readonly string[]).includes(screen);
  const metadata = index ? searchHead(url, locale, fullTitle, description, localPath, collection ? 'CollectionPage' : 'WebPage',
    breadcrumbs, screen === '') : '<meta name="robots" content="noindex">';
  const ad = status === 200 && options.adFrame && advertisingEligibility({ route: screen, viewportWidth: 1280,
    consent: { advertising: true, analytics: false }, approvedProvider: true, documentHasAdScript: false }).placement
    ? options.adFrame : undefined;
  const adLabel = html(trustText(locale, 'ads'));
  const main = '<main id="main" tabindex="-1">' + breadcrumbNav(locale, breadcrumbs) + content + '</main>';
  const layout = ad ? '<div class="ad-layout">' + main + '<aside class="ad-frame" data-ad-frame="' + html(ad.href) +
      '" data-ad-route="' + screen + '" aria-label="' + adLabel + '"><p>' + adLabel + '</p></aside></div>' : main;
  const languageParams = new URLSearchParams(url.search);
  languageParams.delete('cursor');
  const languageQuery = languageParams.size ? '?' + languageParams.toString() : '';
  const languages = locales.map(language => {
    const current = language === locale ? ' aria-current="true"' : '';
    return '<a data-focus-key="language-' + language + '" href="' + html(localPath(language) + languageQuery) +
      '" hreflang="' + language + '" lang="' + language + '"' + current + '>' + languageNames[language] + '</a>';
  }).join('');
  const markup = `<!doctype html><html lang="${locale}"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${html(fullTitle)}</title>
    <meta name="description" content="${html(description)}">
    ${metadata}<link rel="stylesheet" href="/assets/kitchen.css">
    <script type="importmap">${importMap}</script><script type="module" src="/src/web/shell-client.js"></script>
    ${module ? '<script type="module" src="' + html(module) + '"></script>' : ''}
    ${ad ? '<script type="module" src="/src/web/ad-client.js"></script>' : ''}
    </head><body>
    <a class="skip" href="#main">${t('skip')}</a>
    <header class="site-header"><div class="header-inner">
      <a class="brand" href="${pathFor(locale, '')}" data-focus-key="home"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>Color Kitchen</a>
      <nav aria-label="${t('navigation')}">
        ${menu(locale, webText(locale, 'create'), createRoutes, 'create')}
        ${menu(locale, webText(locale, 'explore'), exploreRoutes, 'explore')}
        ${menu(locale, webText(locale, 'browser'), ['browser-companion'], 'browser')}
      </nav>
      <div class="preferences">
        ${link(locale, 'collection', screenTitle(locale, 'collection'), 'collection')}
        <details class="languages"><summary aria-label="${t('language')}: ${languageNames[locale]}">${languageNames[locale]}</summary>
          <div class="menu-panel">${languages}</div>
        </details>
      </div>
    </div></header>
    ${layout}
    <footer><div class="site-footer"><p>Color Kitchen</p><nav aria-label="${t('help')}">
      ${helpRoutes.map(screen => link(locale, screen, screenTitle(locale, screen), 'help-' + screen)).join('')}
    </nav></div></footer>
    </body></html>`;
  return new Response(request.method === 'HEAD' ? null : markup, { status, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Content-Language': locale,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...(index ? {} : { 'X-Robots-Tag': 'noindex' }),
    'Content-Security-Policy': policy + '; frame-src ' + (ad?.origin ?? "'none'"),
    'Set-Cookie': 'ck_locale=' + locale + '; Path=/; Max-Age=31536000; SameSite=Lax' + (url.protocol === 'https:' ? '; Secure' : ''),
  } });
}
