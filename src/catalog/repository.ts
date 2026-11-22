import type { ClientBase } from 'pg';
import { isLocale, type Locale } from '../model/locales.js';

export const catalogKinds = ['palette', 'gradient', 'color', 'font', 'template', 'policy'] as const;
export type CatalogKind = typeof catalogKinds[number];

export type CatalogEntry = Readonly<{
  itemId: string;
  kind: CatalogKind;
  slug: string;
  revision: number;
  schemaVersion: number;
  locale: Locale;
  title: string;
  summary: string;
  body: string | null;
  effectiveAt: Date | null;
  payload: Record<string, unknown>;
  origin: 'original' | 'licensed';
  sourceUri: string | null;
  sourceVersion: string | null;
  sourceDigest: string | null;
  licenseId: string;
  licenseUri: string | null;
  attribution: string | null;
}>;

const projection = `
  item_id AS "itemId", kind, slug, rev AS revision, schema_version AS "schemaVersion",
  locale, title, summary, body, effective_at AS "effectiveAt", payload, origin,
  source_uri AS "sourceUri", source_version AS "sourceVersion", source_digest AS "sourceDigest",
  license_id AS "licenseId", license_uri AS "licenseUri", attribution
`;
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function validateKindAndLocale(kind: CatalogKind, locale: Locale) {
  if (!catalogKinds.includes(kind) || !isLocale(locale)) throw new RangeError('Unsupported catalog kind or locale.');
}

export async function getCatalogEntry(client: ClientBase, kind: CatalogKind, slug: string, locale: Locale) {
  validateKindAndLocale(kind, locale);
  if (slug.length > 100 || !slugPattern.test(slug)) throw new RangeError('Invalid catalog slug.');
  const { rows } = await client.query<CatalogEntry>(
    `SELECT ${projection} FROM ck.published_catalog WHERE kind = $1 AND slug = $2 AND locale = $3`,
    [kind, slug, locale],
  );
  return rows[0] ?? null;
}

type Cursor = Readonly<{ kind: CatalogKind; locale: Locale; query: string; rank: number; id: string }>;

function decodeCursor(encoded: string, filters: Pick<Cursor, 'kind' | 'locale' | 'query'>): Cursor {
  if (encoded.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new RangeError('Invalid catalog cursor.');
  let cursor: Partial<Cursor> | null;
  try {
    cursor = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<Cursor> | null;
  } catch {
    throw new RangeError('Invalid catalog cursor.');
  }
  if (!cursor || cursor.kind !== filters.kind || cursor.locale !== filters.locale || cursor.query !== filters.query ||
      !Number.isInteger(cursor.rank) || cursor.rank! < 0 || cursor.rank! > 2147483647 ||
      typeof cursor.id !== 'string' || !uuidPattern.test(cursor.id)) {
    throw new RangeError('Catalog cursor does not match this query.');
  }
  return cursor as Cursor;
}

export async function listCatalog(client: ClientBase, options: {
  kind: CatalogKind; locale: Locale; query?: string; limit?: number; cursor?: string;
}) {
  const { kind, locale, limit = 20 } = options;
  validateKindAndLocale(kind, locale);
  const query = (options.query ?? '').trim();
  if (query.length > 120 || query.includes('\0') || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new RangeError('Invalid catalog search bounds.');
  }
  const cursor = options.cursor === undefined ? undefined : decodeCursor(options.cursor, { kind, locale, query });
  const prefix = query.replace(/[\\%_]/g, value => '\\' + value) + '%';
  const { rows } = await client.query<CatalogEntry & { rank: number }>(`
    SELECT ${projection}, COALESCE(featured_rank, 2147483647) AS rank
      FROM ck.published_catalog
      WHERE kind = $1 AND locale = $2
        AND ($3 = '' OR title ILIKE $4 OR slug ILIKE $4 OR lower(payload->>'hex') = lower($3))
        AND ($5::integer IS NULL OR (COALESCE(featured_rank, 2147483647), item_id) > ($5::integer, $6::uuid))
      ORDER BY rank, item_id LIMIT $7
  `, [kind, locale, query, prefix, cursor?.rank ?? null, cursor?.id ?? null, limit + 1]);
  const items = rows.slice(0, limit).map(({ rank: _rank, ...entry }) => entry);
  const last = rows[limit - 1];
  const nextCursor = rows.length > limit && last
    ? Buffer.from(JSON.stringify({ kind, locale, query, rank: last.rank, id: last.itemId })).toString('base64url')
    : null;
  return { items, nextCursor };
}
