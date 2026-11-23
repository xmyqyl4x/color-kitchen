import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { ClientBase } from 'pg';
import { inTransaction } from '../db/transaction.js';
import { locales, type Locale } from '../model/locales.js';
import { catalogFont, isFontCategory, type FontCategory, type FontWeightRange } from '../typography/fonts.js';
import type { ColorValue } from '../model/color.js';
import { parseColor } from '../color/parse.js';
import { validateGradient, type Gradient, type GradientType } from '../gradient/gradient.js';
import { slugPattern } from './repository.js';
import { publishLocalizedRevision } from './publication.js';
import { paletteMoods, type PaletteMood } from './palette-moods.js';
import { atlasFamilies, type AtlasColorFamily } from './search.js';

type Translation = Readonly<{ title: string; summary: string }>;
type CommonSeed = Readonly<{
  itemId: string;
  slug: string;
  revision: number;
  featuredRank: number;
  translations: Readonly<Record<Locale, Translation>>;
}>;
type FontSeed = Readonly<{
  kind: 'font';
  family: string;
  sourceUri: string;
  sourceVersion: string;
  sourceDigest: string;
  licenseUri: string;
  licenseId: string;
  attribution: string;
  filename: string;
  notice: string;
  scripts: readonly string[];
  weight: number;
  weightRange?: FontWeightRange;
  category?: FontCategory;
}>;
export type CatalogSeed = CommonSeed & (
  | Readonly<{ kind: 'palette'; colors: readonly string[]; mood?: PaletteMood; attribution?: string }>
  | Readonly<{ kind: 'gradient'; type?: GradientType; angle?: number; center?: Gradient['center']; attribution?: string;
      stops: readonly Readonly<{ position: number; hex: string }>[] }>
  | Readonly<{ kind: 'color'; hex: string; keyword: string; aliases?: readonly string[]; family?: AtlasColorFamily; sourceUri: string }>
  | FontSeed
);

function hexColor(input: string): ColorValue {
  if (!/^#[\da-f]{6}$/i.test(input)) throw new RangeError(`Invalid seed color: ${input}`);
  return parseColor(input);
}

const fontAssets = new URL('../../../catalog/fonts/', import.meta.url);

async function prepare(entry: CatalogSeed) {
  if (!slugPattern.test(entry.slug) || entry.slug.length > 100 || !Number.isInteger(entry.revision) || entry.revision < 1 ||
      !Number.isInteger(entry.featuredRank) || entry.featuredRank < 0) {
    throw new RangeError('Invalid catalog seed identity or revision.');
  }
  const translations: Record<string, Translation & { body: null }> = {};
  if (Object.keys(entry.translations).length !== locales.length) throw new RangeError('Seeds require all five locales.');
  for (const locale of locales) {
    const translation = entry.translations[locale];
    if (!translation?.title.trim() || !translation.summary.trim()) throw new RangeError(`Missing ${locale} seed text.`);
    translations[locale] = { title: translation.title.trim(), summary: translation.summary.trim(), body: null };
  }
  let payload: Record<string, unknown>;
  let origin = 'original';
  let licenseId = 'Color-Kitchen-Original';
  let attribution = 'Color Kitchen design package';
  let sourceUri: string | null = null;
  let sourceVersion: string | null = null;
  let sourceDigest: string | null = null;
  let licenseUri: string | null = null;

  switch (entry.kind) {
    case 'palette':
      if (entry.mood !== undefined && !Object.hasOwn(paletteMoods, entry.mood)) throw new RangeError('Unknown palette mood.');
      if (entry.attribution !== undefined) {
        if (!entry.attribution.trim()) throw new RangeError('Missing palette attribution.');
        attribution = entry.attribution.trim();
      }
      payload = { swatches: entry.colors.map((hex, index) => ({ id: `swatch-${index + 1}`, color: hexColor(hex), locked: false })), roles: {} };
      break;
    case 'gradient': {
      if (entry.angle !== undefined && !Number.isFinite(entry.angle)) throw new RangeError('Gradient angle must be finite.');
      if (entry.attribution !== undefined) {
        if (!entry.attribution.trim()) throw new RangeError('Missing gradient attribution.');
        attribution = entry.attribution.trim();
      }
      const stops = entry.stops.map(stop => ({ position: stop.position, color: hexColor(stop.hex) }));
      const gradient: Gradient = {
        type: entry.type ?? 'linear', angle: entry.angle === undefined ? undefined : ((entry.angle % 360) + 360) % 360,
        center: entry.center, interpolation: 'srgb', stops: stops.map((stop, index) => ({ ...stop, id: 'stop-' + index })),
      };
      validateGradient(gradient);
      payload = { ...gradient, stops };
      break;
    }
    case 'color':
      sourceUri = entry.sourceUri;
      attribution = 'CSS Color Module Level 4, W3C';
      payload = { color: hexColor(entry.hex), hex: entry.hex.toUpperCase(), keyword: entry.keyword };
      if (entry.family !== undefined) {
        if (!atlasFamilies.includes(entry.family)) throw new RangeError('Unknown atlas color family.');
        payload.family = entry.family;
      }
      if (entry.aliases?.length) {
        if (entry.aliases.length > 12 || entry.aliases.some(alias => !/^[a-z]{2,30}$/.test(alias))) {
          throw new RangeError('Invalid CSS keyword alias.');
        }
        payload.aliases = [...new Set(entry.aliases)];
      }
      break;
    case 'font': {
      if (entry.licenseId !== 'OFL-1.1' || !entry.attribution.trim() || !entry.sourceVersion.trim() ||
          !/^https:\/\//.test(entry.sourceUri) || !/^https:\/\//.test(entry.licenseUri) ||
          !/^[A-Za-z0-9.-]+\.(?:ttf|woff2)$/.test(entry.filename) || !/^[A-Za-z0-9.-]+\.txt$/.test(entry.notice)) {
        throw new RangeError('Font metadata must include the approved license, source, and notice.');
      }
      const bytes = await readFile(new URL(entry.filename, fontAssets));
      const notice = await readFile(new URL(entry.notice, fontAssets), 'utf8');
      if (!notice.includes('SIL Open Font License') || createHash('sha256').update(bytes).digest('hex') !== entry.sourceDigest) {
        throw new Error('Font checksum or license notice mismatch.');
      }
      origin = 'licensed';
      ({ licenseId, attribution, sourceUri, sourceVersion, sourceDigest, licenseUri } = entry);
      payload = {
        family: entry.family, filename: entry.filename, notice: entry.notice, scripts: entry.scripts, weight: entry.weight,
        ...(entry.category !== undefined ? { category: entry.category } : {}),
        ...(entry.weightRange !== undefined ? { weightRange: entry.weightRange } : {}),
      };
      if (entry.category !== undefined && !isFontCategory(entry.category)) throw new RangeError('Unknown font category.');
      catalogFont(payload);
      break;
    }
  }
  return { payload, origin, licenseId, attribution, sourceUri, sourceVersion, sourceDigest, licenseUri, translations };
}

async function seedPaletteMood(client: ClientBase, mood: PaletteMood) {
  await client.query("INSERT INTO ck.tag (tag_id,slug,facet) VALUES ($1,$2,'mood') ON CONFLICT (slug) DO NOTHING", [randomUUID(), mood]);
  const { rows: [tag] } = await client.query<{ tag_id: string }>("SELECT tag_id FROM ck.tag WHERE slug=$1 AND facet='mood'", [mood]);
  if (!tag) throw new Error(`Conflicting catalog tag for ${mood}.`);
  const labels = paletteMoods[mood];
  await client.query(`INSERT INTO ck.tag_text (tag_id,locale,label)
    SELECT $1, labels.locale, labels.label FROM unnest($2::text[],$3::text[]) AS labels(locale,label)
    ON CONFLICT DO NOTHING`, [tag.tag_id, locales, locales.map(locale => labels[locale])]);
  return tag.tag_id;
}

export async function seedCatalog(client: ClientBase, entries: readonly CatalogSeed[]) {
  const prepared = await Promise.all(entries.map(async entry => ({ entry, content: await prepare(entry) })));
  prepared.sort((a, b) => a.entry.itemId.localeCompare(b.entry.itemId) || a.entry.revision - b.entry.revision);
  return inTransaction(client, async () => {
    const moods = new Set(entries.flatMap(entry => entry.kind === 'palette' && entry.mood ? [entry.mood] : []));
    const tagIds = new Map<PaletteMood, string>();
    for (const mood of [...moods].sort()) tagIds.set(mood, await seedPaletteMood(client, mood));
    let inserted = 0;
    for (const { entry, content } of prepared) {
      const { itemId, kind, slug, revision, featuredRank } = entry;
      const tagId = entry.kind === 'palette' && entry.mood ? tagIds.get(entry.mood)! : null;
      await client.query(`INSERT INTO ck.catalog_item (item_id, kind, slug, featured_rank)
        VALUES ($1, $2, $3, $4) ON CONFLICT (item_id) DO NOTHING`, [itemId, kind, slug, featuredRank]);
      const item = (await client.query<{ kind: string; slug: string; row_version: string }>(
        'SELECT kind, slug, row_version FROM ck.catalog_item WHERE item_id = $1 FOR UPDATE', [itemId],
      )).rows[0];
      if (!item || item.kind !== kind || item.slug !== slug) throw new Error(`Conflicting seed identity for ${slug}.`);

      const prior = (await client.query<{ sealed: boolean; matches: boolean }>(`
        SELECT sealed_at IS NOT NULL AS sealed,
          jsonb_build_object('payload', payload, 'origin', origin, 'licenseId', license_id,
            'attribution', attribution, 'sourceUri', source_uri, 'sourceVersion', source_version,
            'sourceDigest', source_digest, 'licenseUri', license_uri, 'translations',
            (SELECT jsonb_object_agg(t.locale, jsonb_build_object('title', t.title, 'summary', t.summary, 'body', t.body))
              FROM ck.catalog_text AS t WHERE t.item_id = r.item_id AND t.rev = r.rev))
          = $3::jsonb AND ($4::uuid IS NULL OR EXISTS (
            SELECT 1 FROM ck.catalog_revision_tag WHERE item_id=r.item_id AND rev=r.rev AND tag_id=$4
          )) AS matches
        FROM ck.catalog_revision AS r WHERE r.item_id = $1 AND r.rev = $2
      `, [itemId, revision, content, tagId])).rows[0];
      if (prior) {
        if (!prior.sealed || !prior.matches) throw new Error(`Seed revision conflict for ${slug}. Assign a new revision.`);
        continue;
      }
      if ((await client.query('SELECT 1 FROM ck.catalog_revision WHERE item_id = $1 AND rev >= $2', [itemId, revision])).rowCount) {
        throw new Error(`Seed would replace a newer revision of ${slug}.`);
      }
      await client.query(`INSERT INTO ck.catalog_revision
        (item_id, rev, payload, origin, source_uri, source_version, source_digest, license_id, license_uri, attribution)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [itemId, revision, content.payload, content.origin, content.sourceUri, content.sourceVersion,
        content.sourceDigest, content.licenseId, content.licenseUri, content.attribution]);
      for (const locale of locales) {
        const translation = content.translations[locale]!;
        await client.query('INSERT INTO ck.catalog_text (item_id, rev, locale, title, summary) VALUES ($1,$2,$3,$4,$5)',
          [itemId, revision, locale, translation.title, translation.summary]);
      }
      if (tagId) await client.query('INSERT INTO ck.catalog_revision_tag (item_id,rev,tag_id) VALUES ($1,$2,$3)', [itemId, revision, tagId]);
      await publishLocalizedRevision(client, { itemId, revision, itemVersion: item.row_version,
        editVersion: locales.length + 1 + Number(tagId !== null) });
      inserted++;
    }
    return { inserted, unchanged: prepared.length - inserted };
  });
}
