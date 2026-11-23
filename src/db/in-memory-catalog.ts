import type { ClientBase } from 'pg';
import { baseCatalog } from '../catalog/base-data.js';
import { unfeaturedRank } from '../catalog/ranking.js';
import type { CatalogEntry, CatalogKind } from '../catalog/repository.js';
import type { CatalogTags } from '../catalog/search.js';
import type { CatalogSeed } from '../catalog/seed.js';
import { parseColor } from '../color/parse.js';
import type { Gradient } from '../gradient/gradient.js';
import type { GuideAdmission } from '../guide/service.js';
import { locales, type Locale } from '../model/locales.js';

type StoredItem = Readonly<{
  entry: CatalogEntry;
  featuredRank: number | null;
  tags: CatalogTags;
}>;

const exactBoost = 2147483648n;

function buildSeedRows(seeds: readonly CatalogSeed[]): StoredItem[] {
  const items: StoredItem[] = [];
  for (const seed of seeds) {
    let payload: Record<string, unknown>;
    let origin: 'original' | 'licensed' = 'original';
    let licenseId = 'Color-Kitchen-Original';
    let attribution: string | null = 'Color Kitchen design package';
    let sourceUri: string | null = null;
    let sourceVersion: string | null = null;
    let sourceDigest: string | null = null;
    let licenseUri: string | null = null;
    const tags: { facet: 'hue' | 'mood' | 'use' | 'style'; slug: string }[] = [];

    switch (seed.kind) {
      case 'palette':
        if (seed.mood) tags.push({ facet: 'mood', slug: seed.mood });
        if (seed.attribution !== undefined) attribution = seed.attribution.trim();
        payload = {
          swatches: seed.colors.map((hex, index) => ({ id: `swatch-${index + 1}`, color: parseColor(hex), locked: false })),
          roles: {},
        };
        break;
      case 'gradient': {
        if (seed.attribution !== undefined) attribution = seed.attribution.trim();
        const stops = seed.stops.map(stop => ({ position: stop.position, color: parseColor(stop.hex) }));
        const gradient: Omit<Gradient, 'stops'> & { stops: typeof stops } = {
          type: seed.type ?? 'linear',
          angle: seed.angle === undefined ? undefined : ((seed.angle % 360) + 360) % 360,
          center: seed.center,
          interpolation: 'srgb',
          stops,
        };
        payload = gradient as unknown as Record<string, unknown>;
        break;
      }
      case 'color':
        sourceUri = seed.sourceUri;
        attribution = 'CSS Color Module Level 4, W3C';
        payload = {
          color: parseColor(seed.hex),
          hex: seed.hex.toUpperCase(),
          keyword: seed.keyword,
          ...(seed.family !== undefined ? { family: seed.family } : {}),
          ...(seed.aliases?.length ? { aliases: [...new Set(seed.aliases)] } : {}),
        };
        break;
      case 'font':
        origin = 'licensed';
        ({ licenseId, attribution, sourceUri, sourceVersion, sourceDigest, licenseUri } = seed);
        payload = {
          family: seed.family,
          filename: seed.filename,
          notice: seed.notice,
          scripts: seed.scripts,
          weight: seed.weight,
          ...(seed.category !== undefined ? { category: seed.category } : {}),
          ...(seed.weightRange !== undefined ? { weightRange: seed.weightRange } : {}),
        };
        break;
    }

    for (const locale of locales) {
      const translation = seed.translations[locale];
      items.push({
        featuredRank: seed.featuredRank,
        tags,
        entry: {
          itemId: seed.itemId,
          kind: seed.kind,
          slug: seed.slug,
          revision: seed.revision,
          schemaVersion: 1,
          locale,
          title: translation.title.trim(),
          summary: translation.summary.trim(),
          body: null,
          effectiveAt: null,
          payload,
          origin,
          sourceUri,
          sourceVersion,
          sourceDigest,
          licenseId,
          licenseUri,
          attribution,
        },
      });
    }
  }
  return items;
}

function matchesPrefix(text: string, prefix: string) {
  const needle = prefix.endsWith('%') ? prefix.slice(0, -1).replace(/\\([%_\\])/g, '$1') : prefix;
  return text.toLowerCase().startsWith(needle.toLowerCase());
}

export function createInMemoryCatalogClient(seeds: readonly CatalogSeed[] = baseCatalog): ClientBase {
  const rows = buildSeedRows(seeds);
  const byKindSlug = new Map<string, StoredItem[]>();
  const byKindLocale = new Map<string, StoredItem[]>();

  for (const item of rows) {
    const ks = `${item.entry.kind}:${item.entry.slug}`;
    const list = byKindSlug.get(ks);
    if (list) list.push(item); else byKindSlug.set(ks, [item]);

    const kl = `${item.entry.kind}:${item.entry.locale}`;
    const localeList = byKindLocale.get(kl);
    if (localeList) localeList.push(item); else byKindLocale.set(kl, [item]);
  }

  async function query(sqlInput: string | { text: string; values?: unknown[] }, paramsInput?: unknown[]) {
    const sql = (typeof sqlInput === 'string' ? sqlInput : sqlInput.text).replace(/\s+/g, ' ').trim();
    const params = (typeof sqlInput === 'string' ? paramsInput : sqlInput.values) ?? [];

    if (/^(?:BEGIN|COMMIT|ROLLBACK|SET TRANSACTION)\b/i.test(sql)) {
      return { rows: [], rowCount: 0 };
    }

    // publicCatalogDetail / getCatalogRelease / getCatalogEntry
    if (sql.includes('FROM ck.published_catalog WHERE kind = $1 AND slug = $2 AND locale = $3')) {
      const [kind, slug, locale] = params as [CatalogKind, string, Locale];
      const found = (byKindSlug.get(`${kind}:${slug}`) ?? []).filter(item => item.entry.locale === locale).map(item => item.entry);
      return { rows: found, rowCount: found.length };
    }
    if (sql.includes('FROM ck.published_catalog WHERE kind = $1 AND slug = $2')) {
      const [kind, slug] = params as [CatalogKind, string];
      const found = (byKindSlug.get(`${kind}:${slug}`) ?? []).map(item => item.entry);
      return { rows: found, rowCount: found.length };
    }

    // publicCatalogDetail color alias lookup
    if (sql.includes("FROM ck.published_catalog WHERE kind='color' AND locale=$1 AND payload->'aliases' ? $2")) {
      const [locale, alias] = params as [Locale, string];
      const matches = (byKindLocale.get(`color:${locale}`) ?? [])
        .filter(item => Array.isArray(item.entry.payload.aliases) && item.entry.payload.aliases.includes(alias))
        .map(item => ({ slug: item.entry.slug }))
        .sort((a, b) => a.slug.localeCompare(b.slug))
        .slice(0, 1);
      return { rows: matches, rowCount: matches.length };
    }

    // nearestPublishedColor
    if (sql.includes("FROM ck.published_catalog WHERE kind='color' AND locale=$1 ORDER BY featured_rank NULLS LAST,item_id")) {
      const [locale] = params as [Locale];
      const matches = [...(byKindLocale.get(`color:${locale}`) ?? [])]
        .sort((a, b) => (a.featuredRank ?? unfeaturedRank) - (b.featuredRank ?? unfeaturedRank) || a.entry.itemId.localeCompare(b.entry.itemId))
        .map(item => item.entry);
      return { rows: matches, rowCount: matches.length };
    }

    // publicCatalogListing popularity totals
    if (sql.includes('COALESCE(sum(events),0)::text AS events')) {
      return { rows: [{ events: '0', palettes: '0' }], rowCount: 1 };
    }

    // publicCatalogListing ranked query
    if (sql.includes('WITH measured AS (') && sql.includes('FROM ck.published_catalog AS c LEFT JOIN measured AS m')) {
      const [, , popular, kind, locale, anchorScoreRaw, anchorItemId, fallbackRank, batch, exact] = params as [
        string, string, boolean, CatalogKind, Locale, string | null, string | null, number, number, string | null,
      ];
      const anchorScore = anchorScoreRaw === null ? null : BigInt(anchorScoreRaw);
      const ranked = (byKindLocale.get(`${kind}:${locale}`) ?? []).map(item => {
        const keyword = typeof item.entry.payload.keyword === 'string' ? item.entry.payload.keyword : null;
        const aliases = Array.isArray(item.entry.payload.aliases) ? item.entry.payload.aliases : [];
        const isExact = exact !== null && (item.entry.slug === exact || keyword === exact || aliases.includes(exact));
        const score = popular
          ? 0n
          : (isExact ? exactBoost : 0n) - BigInt(item.featuredRank ?? fallbackRank ?? unfeaturedRank);
        return { item, score };
      });
      ranked.sort((a, b) => (a.score > b.score ? -1 : a.score < b.score ? 1 : a.item.entry.itemId.localeCompare(b.item.entry.itemId)));
      const filtered = anchorScore === null
        ? ranked
        : ranked.filter(row => row.score < anchorScore || (row.score === anchorScore && row.item.entry.itemId > (anchorItemId ?? '')));
      const sliced = filtered.slice(0, batch).map(({ item, score }) => ({
        ...item.entry,
        score: score.toString(),
        tags: item.tags,
      }));
      return { rows: sliced, rowCount: sliced.length };
    }

    // publishedDiscoveryTopics
    if (sql.includes("SELECT DISTINCT 'palettes' AS screen")) {
      const result: { screen: string; slug: string }[] = [];
      const moods = new Set<string>();
      for (const item of byKindLocale.get('palette:en') ?? []) {
        for (const tag of item.tags) {
          if (tag.facet === 'mood' && !moods.has(tag.slug)) {
            moods.add(tag.slug);
            result.push({ screen: 'palettes', slug: tag.slug });
          }
        }
      }
      const types = new Set<string>();
      for (const item of byKindLocale.get('gradient:en') ?? []) {
        const type = item.entry.payload.type;
        if (typeof type === 'string' && !types.has(type)) {
          types.add(type);
          result.push({ screen: 'gradients', slug: type });
        }
      }
      return { rows: result, rowCount: result.length };
    }

    // seoHttp sitemap query
    if (sql.includes('SELECT kind, slug FROM ck.published_catalog')) {
      const [requestedLocales, expectedCount] = params as [readonly Locale[], number];
      const counts = new Map<string, { kind: CatalogKind; slug: string; count: number }>();
      for (const item of rows) {
        if (!requestedLocales.includes(item.entry.locale)) continue;
        if (!['palette', 'color', 'gradient', 'font'].includes(item.entry.kind)) continue;
        const key = `${item.entry.kind}:${item.entry.slug}`;
        const existing = counts.get(key);
        if (existing) existing.count++;
        else counts.set(key, { kind: item.entry.kind, slug: item.entry.slug, count: 1 });
      }
      const entries = [...counts.values()]
        .filter(entry => entry.count === expectedCount)
        .map(({ kind, slug }) => ({ kind, slug }))
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.slug.localeCompare(b.slug));
      return { rows: entries, rowCount: entries.length };
    }

    // listCatalog
    if (sql.includes('COALESCE(featured_rank, 2147483647) AS rank FROM ck.published_catalog')) {
      const [kind, locale, searchQuery, prefix, cursorRank, cursorId, limitPlusOne] = params as [
        CatalogKind, Locale, string, string, number | null, string | null, number,
      ];
      const matches = (byKindLocale.get(`${kind}:${locale}`) ?? [])
        .map(item => ({ ...item.entry, rank: item.featuredRank ?? unfeaturedRank }))
        .filter(item => {
          if (!searchQuery) return true;
          const hex = typeof item.payload.hex === 'string' ? item.payload.hex : '';
          return matchesPrefix(item.title, prefix) || matchesPrefix(item.slug, prefix) || hex.toLowerCase() === searchQuery.toLowerCase();
        })
        .sort((a, b) => a.rank - b.rank || a.itemId.localeCompare(b.itemId))
        .filter(item => cursorRank === null || item.rank > cursorRank || (item.rank === cursorRank && item.itemId > (cursorId ?? '')))
        .slice(0, limitPlusOne);
      return { rows: matches, rowCount: matches.length };
    }

    // operations palette existence check
    if (sql.includes("FROM ck.catalog_item WHERE item_id = $1 AND kind = 'palette'")) {
      const [itemId] = params as [string];
      const exists = (byKindLocale.get('palette:en') ?? []).some(item => item.entry.itemId === itemId);
      return { rows: exists ? [{ '?column?': 1 }] : [], rowCount: exists ? 1 : 0 };
    }

    return { rows: [], rowCount: 0 };
  }

  return { query } as unknown as ClientBase;
}

export function inMemoryGuideAdmission(): GuideAdmission {
  return {
    async reserve() {
      return { accepted: true };
    },
  };
}
