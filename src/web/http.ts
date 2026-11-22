import { readFile } from 'node:fs/promises';
import { publicCatalogDetail, publicCatalogListing } from '../catalog/public.js';
import { slugPattern, type CatalogKind } from '../catalog/repository.js';
import type { CatalogHttpDependencies } from '../http/public-catalog.js';
import { resolveLocale } from '../i18n/resolve.js';
import { isLocale, type Locale } from '../model/locales.js';
import { homeScreen, html, pathFor, renderShell } from './shell.js';
import { screenRoutes, screenTitle, webText, type Screen } from './strings.js';
import { paletteStudio } from './studio.js';
import { collectionScreen } from './collection.js';
import { imageToolsScreen } from './image-tools.js';

const knownScreens = new Set<string>(screenRoutes);
const listings = { palettes: 'palette', colors: 'color', gradients: 'gradient', fonts: 'font' } as const;
const policySlugs = new Set(['licensing', 'terms', 'privacy', 'cookies']);
const fileRoutes: Record<string, [string, string]> = {
  '/assets/kitchen.css': ['../../../src/web/kitchen.css', 'text/css; charset=utf-8'],
  '/assets/source-sans.woff2': ['../../../catalog/fonts/SourceSans3-Regular.woff2', 'font/woff2'],
  '/assets/source-sans-license.txt': ['../../../catalog/fonts/SourceSans3-OFL.txt', 'text/plain; charset=utf-8'],
  '/vendor/pdf-lib.js': ['../../../node_modules/pdf-lib/dist/pdf-lib.esm.min.js', 'text/javascript; charset=utf-8'],
};
const clientModule = /^\/src\/(?:(?:browser|color|export|gradient|image|media|model|palette|preview|tailwind|typography|workspace)\/[a-z0-9-]+|i18n\/messages|operations\/consent|web\/(?:draft|shell-client|strings|studio-client|studio-text|ui|collection-client|collection-text|export-drawer|image-tools-client|image-tools-text))\.js$/;

async function webFile(request: Request, path: string) {
  const asset = Object.hasOwn(fileRoutes, path) ? fileRoutes[path] : undefined;
  const file = asset ?? (clientModule.test(path) ? ['../..' + path, 'text/javascript; charset=utf-8'] : undefined);
  if (!file) return null;
  try {
    const bytes = await readFile(new URL(file[0], import.meta.url));
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), { headers: {
      'Content-Type': file[1], 'Cache-Control': 'public, max-age=0, must-revalidate', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch { return new Response(null, { status: 404 }); }
}

function navigationLocale(request: Request) {
  const saved = /(?:^|;\s*)ck_locale=(en|fr|es|pt|de)(?:;|$)/.exec(request.headers.get('cookie') ?? '')?.[1];
  return resolveLocale({ saved, browser: request.headers.get('accept-language') ?? undefined }).locale;
}

export function webHttp(dependencies: CatalogHttpDependencies) {
  async function catalogContent(locale: Locale, screen: Screen, kind: CatalogKind, slug?: string) {
    if (slug) {
      const found = await dependencies.withClient(client => publicCatalogDetail(client, kind, slug, locale));
      if (!found) return null;
      const { title, summary, body } = found.entry;
      const content = '<h1>' + html(title) + '</h1><p>' + html(summary) + '</p>' + (body ? '<p>' + html(body) + '</p>' : '');
      return { title, content, description: summary, index: true };
    }
    const listing = await dependencies.withClient(client => publicCatalogListing(client, {
      locale, kind, now: dependencies.now?.() ?? new Date(), measurement: false,
    }));
    const title = screenTitle(locale, screen);
    const cards = listing.items.map(({ entry }) => '<li><a href="' + pathFor(locale, screen, entry.slug) +
      '" data-focus-key="entry-' + entry.slug + '"><h2>' + html(entry.title) + '</h2><p>' + html(entry.summary) + '</p></a></li>').join('');
    return { title, content: '<h1>' + html(title) + '</h1>' + (cards ? '<ul class="catalog-grid">' + cards + '</ul>' :
      '<p>' + html(webText(locale, 'empty')) + '</p>'), index: true };
  }

  return async (request: Request) => {
    const url = new URL(request.url);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const file = await webFile(request, url.pathname);
    if (file) return file;
    const route = /^\/([^/]+)?(?:\/([^/]+))?(?:\/([^/]+))?\/?$/.exec(url.pathname);
    const first = route?.[1];
    const locale = isLocale(first) ? first : navigationLocale(request);
    if (route && (!first || (!isLocale(first) && knownScreens.has(first) && !route[3]))) {
      return new Response(null, { status: 302, headers: {
        Location: '/' + locale + (first ? url.pathname : '') + url.search,
        'Cache-Control': 'no-store', Vary: 'Accept-Language, Cookie',
      } });
    }
    const screen = route?.[2] ?? '';
    const entry = route?.[3];
    const heading = (value: string) => '<h1>' + html(value) + '</h1>';
    const notice = (key: 'unavailable' | 'unreleased' | 'loadError') => '<p>' + html(webText(locale, key)) + '</p>';
    const missing = () => renderShell(request, { locale, screen: '', title: webText(locale, 'missing'),
      content: heading(webText(locale, 'missing')) + '<p><a href="' + pathFor(locale, '') + '">' +
        html(webText(locale, 'home')) + '</a></p>', status: 404 });
    if (!route || !isLocale(first) || !knownScreens.has(screen) || (entry && (entry.length > 100 || !slugPattern.test(entry)))) return missing();
    const namedScreen = screen as Screen;
    const title = screenTitle(locale, namedScreen);
    const base = { locale, screen: namedScreen, title, slug: entry };
    if (!screen && !entry) return renderShell(request, { ...base, content: homeScreen(locale), index: true });
    if (screen === 'palette-studio' && !entry) return renderShell(request, { ...base, content: paletteStudio(locale),
      index: true, module: '/src/web/studio-client.js' });
    if (screen === 'collection' && !entry) return renderShell(request, { ...base, content: collectionScreen(locale),
      module: '/src/web/collection-client.js' });
    if ((screen === 'image-to-palette' || screen === 'moodboard') && !entry) return renderShell(request, {
      ...base, content: imageToolsScreen(locale, screen), module: '/src/web/image-tools-client.js', index: true,
    });
    const kind = Object.hasOwn(listings, screen) ? listings[screen as keyof typeof listings] : undefined;
    try {
      if (kind) {
        const content = await catalogContent(locale, namedScreen, kind, entry);
        return content ? renderShell(request, { ...base, ...content }) : missing();
      }
      if (entry) return missing();
      if (policySlugs.has(screen)) {
        const content = await catalogContent(locale, namedScreen, 'policy', screen);
        if (content) return renderShell(request, { ...base, ...content });
      }
    } catch {
      return renderShell(request, { ...base, content: heading(title) + notice('loadError'), status: 503 });
    }
    return renderShell(request, { ...base, content: heading(title) + notice(screen === 'browser-companion' ? 'unreleased' : 'unavailable') });
  };
}
