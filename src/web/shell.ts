import { createHash } from 'node:crypto';
import { locales, type Locale } from '../model/locales.js';
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
  locale: Locale; screen: Screen; title: string; content: string; slug?: string; index?: boolean;
  status?: number; description?: string; module?: string;
}>) {
  const { locale, screen, slug, title, content, index = false, status = 200, module } = options;
  const t = (key: Parameters<typeof webText>[1]) => html(webText(locale, key));
  const url = new URL(request.url);
  const canonical = pathFor(locale, screen, slug);
  const alternate = index ? [
    '<link rel="canonical" href="' + html(new URL(canonical, url).href) + '">',
    ...locales.map(value => '<link rel="alternate" hreflang="' + value +
      '" href="' + html(new URL(pathFor(value, screen, slug), url).href) + '">'),
    '<link rel="alternate" hreflang="x-default" href="' + html(new URL(pathFor('en', screen, slug), url).href) + '">',
  ].join('') : '<meta name="robots" content="noindex">';
  const languageParams = new URLSearchParams(url.search);
  languageParams.delete('cursor');
  const languageQuery = languageParams.size ? '?' + languageParams.toString() : '';
  const languages = locales.map(language => {
    const current = language === locale ? ' aria-current="true"' : '';
    return '<a data-focus-key="language-' + language + '" href="' + pathFor(language, screen, slug) + html(languageQuery) +
      '" hreflang="' + language + '" lang="' + language + '"' + current + '>' + languageNames[language] + '</a>';
  }).join('');
  const markup = `<!doctype html><html lang="${locale}"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${html(title === 'Color Kitchen' ? title : title + ' | Color Kitchen')}</title>
    <meta name="description" content="${html(options.description ?? webText(locale, 'intro'))}">
    ${alternate}<link rel="stylesheet" href="/assets/kitchen.css">
    <script type="importmap">${importMap}</script><script type="module" src="/src/web/shell-client.js"></script>
    ${module ? '<script type="module" src="' + html(module) + '"></script>' : ''}
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
    <main id="main" tabindex="-1">${content}</main>
    <footer><div class="site-footer"><p>Color Kitchen</p><nav aria-label="${t('help')}">
      ${helpRoutes.map(screen => link(locale, screen, screenTitle(locale, screen), 'help-' + screen)).join('')}
    </nav></div></footer>
    </body></html>`;
  return new Response(request.method === 'HEAD' ? null : markup, { status, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Content-Language': locale,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': policy,
    'Set-Cookie': 'ck_locale=' + locale + '; Path=/; Max-Age=31536000; SameSite=Lax' + (url.protocol === 'https:' ? '; Secure' : ''),
  } });
}
