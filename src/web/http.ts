import { readFile } from 'node:fs/promises';
import { publicCatalogDetail } from '../catalog/public.js';
import { slugPattern } from '../catalog/repository.js';
import type { CatalogHttpDependencies } from '../http/public-catalog.js';
import { resolveLocale } from '../i18n/resolve.js';
import { isLocale } from '../model/locales.js';
import { approvedAdFrame, homeScreen, html, pathFor, renderShell } from './shell.js';
import { screenRoutes, screenTitle, webText, type Screen } from './strings.js';
import { paletteStudio } from './studio.js';
import { collectionScreen } from './collection.js';
import { imageToolsScreen } from './image-tools.js';
import { colorToolsScreen } from './color-tools.js';
import { previewToolsScreen } from './preview-tools.js';
import { discoveryKinds, discoveryPage } from './discovery.js';
import { gradientToolsScreen } from './gradient-tools.js';
import { fontToolsPage } from './font-tools.js';
import { guideScreen } from './guide.js';
import { publishedPolicy, trustScreen } from './trust.js';
import type { VerifyIdentity } from '../http/identity.js';
import { adminPortal } from './admin.js';

const knownScreens = new Set<string>(screenRoutes);
const fileRoutes: Record<string, [string, string]> = {
  '/assets/kitchen.css': ['../../../src/web/kitchen.css', 'text/css; charset=utf-8'],
  '/assets/source-sans.woff2': ['../../../catalog/fonts/SourceSans3-Regular.woff2', 'font/woff2'],
  '/assets/source-sans-license.txt': ['../../../catalog/fonts/SourceSans3-OFL.txt', 'text/plain; charset=utf-8'],
  '/assets/fonts/SourceSans3-Regular.woff2': ['../../../catalog/fonts/SourceSans3-Regular.woff2', 'font/woff2'],
  '/vendor/pdf-lib.js': ['../../../node_modules/pdf-lib/dist/pdf-lib.esm.min.js', 'text/javascript; charset=utf-8'],
};
const clientModule = /^\/src\/(?:(?:browser|color|export|gradient|image|media|model|palette|preview|tailwind|typography|workspace)\/[a-z0-9-]+|i18n\/(?:messages|admin-errors)|guide\/(?:local|response)|operations\/consent|web\/(?:draft|shell-client|strings|studio-client|studio-text|ui|collection-client|collection-text|export-drawer|image-tools-client|image-tools-text|color-tools-client|color-tools-text|preview-tools-client|preview-tools-text|discovery-client|discovery-text|gradient-tools-client|gradient-tools-text|font-tools-client|font-tools-text|guide-client|guide-text|trust-client|trust-text|ad-client|admin-client|admin-text))\.js$/;

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

export function webHttp(dependencies: CatalogHttpDependencies & { adFrameUrl?: string; verifyIdentity?: VerifyIdentity }) {
  const discovery = discoveryPage(dependencies);
  const fonts = fontToolsPage(dependencies);
  const adFrame = approvedAdFrame(dependencies.adFrameUrl);

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
    if (screen === 'catalog-admin' && !entry) return adminPortal(request, locale, dependencies);
    const title = screenTitle(locale, namedScreen);
    const base = { locale, screen: namedScreen, title, slug: entry, adFrame };
    if (!screen && !entry) return renderShell(request, { ...base, content: homeScreen(locale), index: true });
    if (screen === 'palette-studio' && !entry) return renderShell(request, { ...base, content: paletteStudio(locale),
      index: true, module: '/src/web/studio-client.js' });
    if (screen === 'collection' && !entry) return renderShell(request, { ...base, content: collectionScreen(locale),
      module: '/src/web/collection-client.js' });
    if ((screen === 'image-to-palette' || screen === 'moodboard') && !entry) return renderShell(request, {
      ...base, content: imageToolsScreen(locale, screen), module: '/src/web/image-tools-client.js', index: true,
    });
    if ((screen === 'contrast' || screen === 'color-inspector') && !entry) return renderShell(request, {
      ...base, content: colorToolsScreen(locale, screen), module: '/src/web/color-tools-client.js', index: true,
    });
    if ((screen === 'design-preview' || screen === 'tailwind') && !entry) return renderShell(request, {
      ...base, content: previewToolsScreen(locale, screen), module: '/src/web/preview-tools-client.js', index: true,
    });
    if ((screen === 'gradient-studio' || screen === 'gradient-steps') && !entry) return renderShell(request, {
      ...base, content: gradientToolsScreen(locale, screen), module: '/src/web/gradient-tools-client.js', index: true,
    });
    if (screen === 'color-guide' && !entry) return renderShell(request, {
      ...base, content: guideScreen(locale), module: '/src/web/guide-client.js', index: true,
    });
    if ((screen === 'cookie-preferences' || screen === 'contact' || screen === 'advertise') && !entry) {
      return renderShell(request, { ...base, content: trustScreen(locale, screen),
        module: '/src/web/trust-client.js', index: screen !== 'cookie-preferences' });
    }
    try {
      if (Object.hasOwn(discoveryKinds, screen)) {
        const result = await discovery(request, screen as keyof typeof discoveryKinds, locale, entry);
        if (result instanceof Response) return result;
        return result ? renderShell(request, { ...base, ...result, module: '/src/web/discovery-client.js' }) : missing();
      }
      if (screen === 'fonts' || (screen === 'type-playground' && !entry)) {
        const result = await fonts(request, locale, screen, entry);
        return result ? renderShell(request, { ...base, ...result, module: '/src/web/font-tools-client.js' }) : missing();
      }
      if (entry) return missing();
      if (screen === 'licensing' || screen === 'terms' || screen === 'privacy' || screen === 'cookies') {
        const found = await dependencies.withClient(client => publicCatalogDetail(client, 'policy', screen, locale));
        return renderShell(request, { ...base, ...publishedPolicy(locale, screen, found?.entry) });
      }
    } catch {
      return renderShell(request, { ...base, content: heading(title) + notice('loadError'), status: 503 });
    }
    return renderShell(request, { ...base, content: heading(title) + notice(screen === 'browser-companion' ? 'unreleased' : 'unavailable') });
  };
}
