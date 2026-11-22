import { convertColor, toHex } from '../color/convert.js';
import { assertColor, parseColor } from '../color/parse.js';
import type { ColorValue } from '../model/color.js';
import type { Locale } from '../model/locales.js';
import type { CatalogEntry } from './repository.js';

export type CatalogFilters = Readonly<{
  query?: string; family?: string; mood?: string; colorCount?: number; lightness?: 'dark' | 'medium' | 'light';
}>;
export type CatalogTags = readonly Readonly<{ facet: 'hue' | 'mood' | 'use' | 'style'; slug: string }>[];
export type NormalizedFilters = Readonly<{
  query: string; hex: string | null; family: string | null; mood: string | null;
  colorCount: number | null; lightness: NonNullable<CatalogFilters['lightness']> | null;
}>;

function fold(value: string, locale: Locale) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase(locale);
}

export function normalizeCatalogFilters(input: CatalogFilters, locale: Locale): NormalizedFilters {
  const query = (input.query ?? '').trim();
  if (query.length > 120 || /[\u0000-\u001f]/.test(query)) throw new RangeError('Invalid catalog search bounds.');
  const facet = (value: string | undefined) => {
    if (value === undefined) return null;
    if (value.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new RangeError('Invalid catalog facet.');
    return value;
  };
  const colorCount = input.colorCount ?? null;
  const lightness = input.lightness ?? null;
  if ((colorCount !== null && (!Number.isInteger(colorCount) || colorCount < 2 || colorCount > 12)) ||
      (lightness !== null && !['dark', 'medium', 'light'].includes(lightness))) throw new RangeError('Invalid color facet.');
  const hex = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(query) ? toHex(parseColor(query)).hex : null;
  return { query: hex ?? fold(query, locale), hex, family: facet(input.family), mood: facet(input.mood), colorCount, lightness };
}

type Searchable = Pick<CatalogEntry, 'kind' | 'slug' | 'title' | 'locale' | 'payload'>;

function readColors({ kind, payload }: Searchable): ColorValue[] {
  const values: unknown[] = kind === 'palette' && Array.isArray(payload.swatches) ? payload.swatches.map(item => item.color)
    : kind === 'gradient' && Array.isArray(payload.stops) ? payload.stops.map(item => item.color)
    : kind === 'color' ? [payload.color] : [];
  return values.map(value => {
    assertColor(value);
    return value;
  });
}

function hueFamily(color: ColorValue) {
  const [, chroma, hue] = convertColor(color, 'oklch').color.components;
  if (chroma < 0.03) return 'neutral';
  if (hue < 45 || hue >= 350) return 'red';
  if (hue < 85) return 'orange';
  if (hue < 120) return 'yellow';
  if (hue < 175) return 'green';
  if (hue < 235) return 'cyan';
  if (hue < 285) return 'blue';
  if (hue < 330) return 'violet';
  return 'magenta';
}

export function matchesCatalog(entry: Searchable, filters: NormalizedFilters, tags: CatalogTags = []) {
  if (filters.query && !filters.hex) {
    const names = [entry.title, entry.slug, entry.payload.family, entry.payload.keyword, ...tags.map(tag => tag.slug)];
    if (!names.some(name => typeof name === 'string' && fold(name, entry.locale).includes(filters.query))) return false;
  }
  if (filters.mood && !tags.some(tag => tag.facet === 'mood' && tag.slug === filters.mood)) return false;
  if (!filters.hex && !filters.family && !filters.colorCount && !filters.lightness) return true;
  const colors = readColors(entry);
  if (filters.colorCount !== null && (entry.kind !== 'palette' || colors.length !== filters.colorCount)) return false;
  if (filters.hex && !colors.some(color => toHex(color).hex === filters.hex)) return false;
  if (filters.family && !tags.some(tag => tag.facet === 'hue' && tag.slug === filters.family) &&
      !colors.some(color => hueFamily(color) === filters.family)) return false;
  if (filters.lightness) {
    if (!colors.length) return false;
    const average = colors.reduce((sum, color) => sum + convertColor(color, 'oklch').color.components[0], 0) / colors.length;
    if ((average < 0.4 ? 'dark' : average < 0.7 ? 'medium' : 'light') !== filters.lightness) return false;
  }
  return true;
}
