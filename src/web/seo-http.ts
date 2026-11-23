import { publicCatalogPath } from '../catalog/public.js';
import type { CatalogKind } from '../catalog/repository.js';
import { inTransaction } from '../db/transaction.js';
import type { CatalogHttpDependencies } from '../http/public-catalog.js';
import { locales } from '../model/locales.js';
import { publishedDiscoveryTopics, topicPath } from './discovery-topics.js';
import { publicScreens } from './seo-text.js';
import { html, pathFor } from './shell.js';

const collections = { palettes: 'palette', colors: 'color', gradients: 'gradient', fonts: 'font' } as const;
type Collection = keyof typeof collections;

export const hasDiscoveryFilters = (params: URLSearchParams, keys: readonly string[]) =>
  keys.some(key => params.getAll(key).some(value => value.trim() !== ''));

export function seoHttp(dependencies: CatalogHttpDependencies, indexing = true) {
  return async (request: Request, url: URL) => {
    const head = request.method === 'HEAD';
    if (url.pathname === '/robots.txt') {
      const text = 'User-agent: *\nDisallow: /api/\n' + (indexing ? '\nSitemap: ' + new URL('/sitemap.xml', url).href + '\n' : '');
      return new Response(head ? null : text, { headers: {
        'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300',
      } });
    }
    if (url.pathname !== '/sitemap.xml') return null;
    if (!indexing) return new Response(null, { status: 404, headers: { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' } });
    try {
      const { entries, topics } = await dependencies.withClient(client => inTransaction(client, async () => {
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const { rows: entries } = await client.query<{ kind: CatalogKind; slug: string }>(`
          SELECT kind, slug FROM ck.published_catalog
          WHERE locale=ANY($1::text[]) AND (kind IN ('palette','color','gradient','font') OR
            (kind='policy' AND slug IN ('licensing','terms','privacy','cookies')))
          GROUP BY kind, slug HAVING count(*)=$2 ORDER BY kind, slug
        `, [locales, locales.length]);
        return { entries, topics: await publishedDiscoveryTopics(client) };
      }));
      const publishedKinds = new Set(entries.map(entry => entry.kind));
      const screens = publicScreens.filter(screen => !Object.hasOwn(collections, screen) ||
        publishedKinds.has(collections[screen as Collection]));
      const paths = locales.flatMap(locale => [
        ...screens.map(screen => pathFor(locale, screen)),
        ...topics.map(topic => topicPath(locale, topic)),
        ...entries.map(({ kind, slug }) => publicCatalogPath(kind, slug, locale)),
      ]);
      const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        paths.map(path => '  <url><loc>' + html(new URL(path, url).href) + '</loc></url>').join('\n') + '\n</urlset>\n';
      return new Response(head ? null : body, { headers: {
        'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache',
      } });
    } catch {
      return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
    }
  };
}
