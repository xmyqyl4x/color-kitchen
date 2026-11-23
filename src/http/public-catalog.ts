import type { ClientBase } from 'pg';
import { publicCatalogDetail, publicCatalogListing } from '../catalog/public.js';
import { catalogKinds, slugPattern, type CatalogKind } from '../catalog/repository.js';
import type { CatalogFilters } from '../catalog/search.js';
import { isGradientType } from '../gradient/gradient.js';
import { messages } from '../i18n/messages.js';
import { resolveLocale } from '../i18n/resolve.js';
import { isLocale, locales } from '../model/locales.js';
import { apiError, cacheableJson } from './response.js';

export type CatalogHttpDependencies = Readonly<{
  withClient<T>(work: (client: ClientBase) => Promise<T>): Promise<T>;
  measurement?: boolean;
  now?: () => Date;
}>;

const publicKinds: readonly string[] = catalogKinds.filter(kind => kind !== 'policy');
const policies = ['licensing', 'terms', 'privacy', 'cookies'];

export function catalogListOptions(query: { get(key: string): string | null | undefined }):
  Pick<Parameters<typeof publicCatalogListing>[1], 'filters' | 'cursor' | 'limit' | 'sort'> {
  const count = query.get('count') ?? undefined;
  const limit = query.get('limit') ?? undefined;
  const sort = query.get('sort') ?? undefined;
  const lightness = query.get('lightness') ?? undefined;
  const gradientType = query.get('type') ?? undefined;
  if ((count !== undefined && !/^[1-9]\d?$/.test(count)) || (limit !== undefined && !/^[1-9]\d?$/.test(limit)) ||
      (sort !== undefined && sort !== 'featured' && sort !== 'popular') || (gradientType !== undefined && !isGradientType(gradientType)) ||
      (lightness !== undefined && lightness !== 'light' && lightness !== 'medium' && lightness !== 'dark')) {
    throw new RangeError('Invalid listing filters.');
  }
  const filters: CatalogFilters = { query: query.get('q') ?? undefined, family: query.get('family') ?? undefined,
    mood: query.get('mood') ?? undefined, colorCount: count === undefined ? undefined : Number(count), lightness, gradientType };
  return { filters, cursor: query.get('cursor') ?? undefined, limit: limit === undefined ? undefined : Number(limit), sort };
}

export function catalogHttp(dependencies: CatalogHttpDependencies) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const match = /^\/api\/v1\/(catalog|locales|policies)(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(url.pathname);
    if (!match) return apiError(404, 'not_found');
    if (request.method !== 'GET' && request.method !== 'HEAD') return apiError(405, 'method_not_allowed', { Allow: 'GET, HEAD' });
    const [, resource, scope, slug] = match;
    const listing = resource === 'catalog' && !slug;
    const allowed = listing ? ['locale', 'q', 'family', 'mood', 'count', 'lightness', 'sort', 'cursor', 'limit'] : ['locale'];
    if (listing && scope === 'gradient') allowed.push('type');
    const query = new Map<string, string>();
    for (const [key, value] of url.searchParams) {
      if (!allowed.includes(key) || query.has(key)) return apiError(400, 'invalid_query');
      query.set(key, value);
    }
    const pathLocale = resource === 'locales' ? scope : undefined;
    const selected = query.get('locale') ?? pathLocale;
    if (selected !== undefined && !isLocale(selected)) return apiError(400, 'unsupported_locale');
    if (pathLocale !== undefined && pathLocale !== selected) return apiError(400, 'invalid_query');
    const { locale } = resolveLocale({ selected, browser: request.headers.get('accept-language') ?? undefined });
    const error = (status: number, code: string) => apiError(status, code,
      { 'Content-Language': locale, 'Vary': 'Accept-Language' });
    const success = (value: unknown, maxAge?: number) => cacheableJson(request, locale, value, maxAge);

    try {
      if (resource === 'locales') {
        if (slug) return error(404, 'not_found');
        return success({ locales, messages: messages[locale] }, 300);
      }
      if (resource === 'policies') {
        if (!scope || slug || !policies.includes(scope)) return error(404, 'not_found');
        const page = await dependencies.withClient(client => publicCatalogDetail(client, 'policy', scope, locale));
        return page ? success(page) : error(404, 'not_found');
      }
      if (!scope || !publicKinds.includes(scope)) return error(404, 'not_found');
      const kind = scope as CatalogKind;
      if (slug !== undefined) {
        if (slug.length > 100 || !slugPattern.test(slug)) return error(404, 'not_found');
        const page = await dependencies.withClient(client => publicCatalogDetail(client, kind, slug, locale));
        return page ? success(page) : error(404, 'not_found');
      }
      const options = catalogListOptions(query);
      const data = await dependencies.withClient(client => publicCatalogListing(client, {
        kind, locale, ...options, now: dependencies.now?.() ?? new Date(), measurement: dependencies.measurement === true,
      }));
      return success(data);
    } catch (cause) {
      return cause instanceof RangeError ? error(400, 'invalid_query') : error(503, 'catalog_unavailable');
    }
  };
}
