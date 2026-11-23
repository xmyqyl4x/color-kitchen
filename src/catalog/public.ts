import type { ClientBase } from 'pg';
import { convertColor } from '../color/convert.js';
import { assertColor, parseColor } from '../color/parse.js';
import { inTransaction } from '../db/transaction.js';
import type { ColorValue } from '../model/color.js';
import { isLocale, locales, type Locale } from '../model/locales.js';
import { catalogProjection, catalogKinds, getCatalogRelease, type CatalogEntry, type CatalogKind } from './repository.js';
import { chooseCatalogSort, popularityWindow, unfeaturedRank, type CatalogSort } from './ranking.js';
import { compactColorName, matchesCatalog, normalizeCatalogFilters, type CatalogFilters, type CatalogTags } from './search.js';

const paths: Record<Exclude<CatalogKind, 'policy'>, string> = {
  palette: 'palettes', gradient: 'gradients', color: 'colors', font: 'fonts', template: 'design-preview',
};
const policies = ['licensing', 'terms', 'privacy', 'cookies'] as const;
type Policy = typeof policies[number];

export function publicCatalogPath(kind: CatalogKind, slug: string, locale: Locale) {
  return kind === 'policy' ? `/${locale}/${slug}` : `/${locale}/${paths[kind]}/${slug}`;
}

export async function publicCatalogDetail(client: ClientBase, kind: CatalogKind, slug: string, locale: Locale) {
  if (!isLocale(locale)) throw new RangeError('A supported locale is required.');
  let release = await getCatalogRelease(client, kind, slug);
  if (!release && kind === 'color') {
    const { rows: [alias] } = await client.query<{ slug: string }>(`SELECT slug FROM ck.published_catalog
      WHERE kind='color' AND locale=$1 AND payload->'aliases' ? $2 ORDER BY slug LIMIT 1`, [locale, slug]);
    if (alias) release = await getCatalogRelease(client, kind, alias.slug);
  }
  if (!release) return null;
  const entry = release.translations[locale];
  return {
    entry,
    metadata: {
      title: entry.title, description: entry.summary, locale, canonical: publicCatalogPath(kind, entry.slug, locale),
      alternates: Object.fromEntries(locales.map(language => [language, publicCatalogPath(kind, entry.slug, language)])) as Record<Locale, string>,
    },
  };
}

function labCoordinates(color: ColorValue) {
  const [l, c, h] = convertColor(color, 'oklch').color.components;
  const radians = h * Math.PI / 180;
  return [l, c * Math.cos(radians), c * Math.sin(radians)];
}

export async function nearestPublishedColor(client: ClientBase, locale: Locale, hex: string) {
  const target = labCoordinates(parseColor(hex));
  const { rows } = await client.query<CatalogEntry>(`SELECT ${catalogProjection} FROM ck.published_catalog
    WHERE kind='color' AND locale=$1 ORDER BY featured_rank NULLS LAST,item_id`, [locale]);
  let nearest: CatalogEntry | undefined;
  let best = Infinity;
  for (const item of rows) {
    const color = item.payload.color;
    assertColor(color);
    if (color.alpha !== 1) continue;
    const distance = labCoordinates(color).reduce((sum, channel, index) => sum + (channel - target[index]!) ** 2, 0);
    if (distance < best) { nearest = item; best = distance; }
  }
  return nearest;
}

export async function publicPolicy(client: ClientBase, slug: Policy, locale: Locale) {
  if (!policies.includes(slug)) throw new RangeError('Unsupported policy.');
  return publicCatalogDetail(client, 'policy', slug, locale);
}

type PageAnchor = { itemId: string; score: string };
type RankedRow = CatalogEntry & PageAnchor & { tags: CatalogTags };
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

function cursorAnchor(input: string, key: string): PageAnchor {
  try {
    if (input.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(input)) throw new Error();
    const { query, itemId, score } = JSON.parse(Buffer.from(input, 'base64url').toString('utf8'));
    if (query !== key || typeof itemId !== 'string' || !uuid.test(itemId) ||
        typeof score !== 'string' || !/^-?\d{1,40}$/.test(score)) throw new Error();
    return { itemId, score };
  } catch {
    throw new RangeError('The catalog cursor does not apply to this listing.');
  }
}

const aggregate = `
  SELECT d.item_id, sum(d.event_count) AS events FROM ck.usage_day AS d
  JOIN ck.catalog_item AS p ON p.item_id = d.item_id AND p.kind = 'palette' AND p.published_rev IS NOT NULL
  WHERE d.action = 'open_in_studio' AND d.day_utc >= $1::date AND d.day_utc < $2::date
    AND d.event_count > 0
  GROUP BY d.item_id
`;

export async function publicCatalogListing(client: ClientBase, request: Readonly<{
  locale: Locale; kind: CatalogKind; filters?: CatalogFilters; sort?: CatalogSort;
  cursor?: string; limit?: number; now: Date; measurement: boolean;
}>) {
  const { locale, kind, limit = 20, sort = 'featured' } = request;
  if (!isLocale(locale) || !catalogKinds.includes(kind) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new RangeError('Invalid public listing bounds.');
  }
  const filters = normalizeCatalogFilters(request.filters ?? {}, locale, kind === 'color' || kind === 'gradient');
  const keyword = kind === 'color' && !filters.hex ? compactColorName(filters.query) : '';
  const exact = /^[a-z]+$/.test(keyword) ? keyword : null;
  const window = popularityWindow(request.now);
  return inTransaction(client, async () => {
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    let totals = { events: 0n, palettes: 0 };
    if (sort === 'popular' && kind === 'palette' && request.measurement) {
      const { rows } = await client.query<{ events: string; palettes: string }>(`
        SELECT COALESCE(sum(events),0)::text AS events, count(*)::text AS palettes FROM (${aggregate}) AS current
      `, [window.from, window.before]);
      const total = rows[0]!;
      totals = { events: BigInt(total.events), palettes: Number(total.palettes) };
    }
    const mode = chooseCatalogSort(sort, kind, request.measurement, totals);
    const popular = mode.sort === 'popular';
    const key = JSON.stringify([kind, locale, sort, mode.sort, mode.reason, filters, popular ? window.before : null]);
    let anchor = request.cursor === undefined ? null : cursorAnchor(request.cursor, key);
    const matches: RankedRow[] = [];
    const batch = Math.max(50, limit + 1);
    while (matches.length <= limit) {
      const { rows } = await client.query<RankedRow>(`
        WITH measured AS (${popular ? aggregate : 'SELECT NULL::uuid AS item_id, NULL::numeric AS events WHERE false AND $1::date < $2::date'}),
        ranked AS (
          SELECT c.*, CASE WHEN $3::boolean THEN COALESCE(m.events, 0)
            ELSE (CASE WHEN c.slug=$10 OR c.payload->>'keyword'=$10 OR c.payload->'aliases' ? $10 THEN 2147483648::numeric ELSE 0 END)
              -COALESCE(c.featured_rank, $8::integer)::numeric END AS score
          FROM ck.published_catalog AS c LEFT JOIN measured AS m USING (item_id)
          WHERE c.kind = $4 AND c.locale = $5
        )
        SELECT ${catalogProjection}, ranked.score::text AS score,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('facet', t.facet, 'slug', t.slug) ORDER BY t.slug)
            FROM ck.catalog_revision_tag AS rt JOIN ck.tag AS t USING (tag_id)
            WHERE rt.item_id = ranked.item_id AND rt.rev = ranked.rev), '[]'::jsonb) AS tags
        FROM ranked
        WHERE $6::numeric IS NULL OR ranked.score < $6::numeric OR (ranked.score = $6::numeric AND ranked.item_id > $7::uuid)
        ORDER BY ranked.score DESC, ranked.item_id ASC LIMIT $9
      `, [window.from, window.before, popular, kind, locale, anchor?.score ?? null, anchor?.itemId ?? null, unfeaturedRank, batch, exact]);
      for (const row of rows) {
        if (matchesCatalog(row, filters, row.tags)) matches.push(row);
        if (matches.length > limit) break;
      }
      if (rows.length < batch) break;
      anchor = rows.at(-1)!;
    }
    const items = matches.slice(0, limit).map(({ score, tags, ...entry }) => ({
      entry, tags, measuredOpens: popular ? score : null,
    }));
    const last = matches[limit - 1];
    const nextCursor = matches.length > limit && last
      ? Buffer.from(JSON.stringify({ query: key, itemId: last.itemId, score: last.score })).toString('base64url') : null;
    return { ...mode, items, nextCursor, window: popular ? window : null };
  });
}
