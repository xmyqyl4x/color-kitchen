import type { CatalogKind } from './repository.js';

export const popularity = { days: 30, minimumEvents: 25, minimumPalettes: 5 } as const;
export const unfeaturedRank = 2147483647;
export type CatalogSort = 'featured' | 'popular';
export type CatalogAnchor = Readonly<{ score: bigint; itemId: string }>;

export function popularityWindow(now: Date) {
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid catalog clock.');
  const before = new Date(now);
  before.setUTCHours(0, 0, 0, 0);
  const from = new Date(before);
  from.setUTCDate(from.getUTCDate() - popularity.days);
  return { from: from.toISOString().slice(0, 10), before: before.toISOString().slice(0, 10) };
}

export function chooseCatalogSort(requested: CatalogSort, kind: CatalogKind, measurement: boolean,
    counts: { events: bigint; palettes: number }) {
  if (requested !== 'featured' && requested !== 'popular') throw new RangeError('Unknown catalog sort.');
  if (requested === 'featured') return { sort: 'featured', reason: null } as const;
  if (kind !== 'palette') return { sort: 'featured', reason: 'unsupported-kind' } as const;
  if (!measurement) return { sort: 'featured', reason: 'measurement-disabled' } as const;
  if (counts.events < BigInt(popularity.minimumEvents) || counts.palettes < popularity.minimumPalettes) {
    return { sort: 'featured', reason: 'insufficient-activity' } as const;
  }
  return { sort: 'popular', reason: null } as const;
}

export function catalogAnchor(sort: CatalogSort, item: { itemId: string; featuredRank: number | null; events: bigint }) {
  return { itemId: item.itemId, score: sort === 'popular' ? item.events : -BigInt(item.featuredRank ?? unfeaturedRank) };
}

export function compareCatalogAnchors(a: CatalogAnchor, b: CatalogAnchor) {
  if (a.score !== b.score) return a.score > b.score ? -1 : 1;
  return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0;
}

export function catalogPage<T extends { itemId: string; featuredRank: number | null; events: bigint }>(
    items: readonly T[], sort: CatalogSort, size: number, after?: CatalogAnchor) {
  if (!Number.isInteger(size) || size < 1 || size > 50) throw new RangeError('Invalid catalog page size.');
  const ordered = items.map(item => ({ item, anchor: catalogAnchor(sort, item) }))
    .sort((a, b) => compareCatalogAnchors(a.anchor, b.anchor));
  const next = ordered.filter(entry => !after || compareCatalogAnchors(entry.anchor, after) > 0).slice(0, size + 1);
  return {
    items: next.slice(0, size).map(entry => entry.item),
    next: next.length > size ? next[size - 1]!.anchor : null,
  };
}
