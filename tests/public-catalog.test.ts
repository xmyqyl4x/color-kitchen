import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { issueCatalogOpen, recordCatalogOpen } from '../src/operations/usage.js';
import { publicCatalogDetail, publicCatalogListing, publicPolicy } from '../src/catalog/public.js';
import { publishLocalizedRevision } from '../src/catalog/publication.js';
import { locales } from '../src/model/locales.js';
import { withMigratedDatabase } from './postgres.js';

test('public details and policy metadata use one localized release and advertise stable alternate routes', async () => {
  await withMigratedDatabase(async client => {
    await seedCatalog(client, sampleCatalog.slice(0, 1));
    const fr = await publicCatalogDetail(client, 'palette', 'forest-study', 'fr');
    assert.equal(fr?.metadata.title, 'Étude forestière');
    assert.equal(fr.metadata.canonical, '/fr/palettes/forest-study');
    assert.equal(fr.metadata.alternates.de, '/de/palettes/forest-study');
    assert.equal(fr.entry.itemId, (await publicCatalogDetail(client, 'palette', 'forest-study', 'de'))?.entry.itemId);
    const id = randomUUID();
    await client.query("INSERT INTO ck.catalog_item (item_id, kind, slug) VALUES ($1, 'policy', 'cookies')", [id]);
    assert.equal(await publicPolicy(client, 'cookies', 'fr'), null);
    await client.query(`
      INSERT INTO ck.catalog_revision (item_id, rev, payload, origin, license_id, attribution, effective_at)
      VALUES ($1, 1, '{}', 'original', 'fixture', 'Test fixture', '2026-01-01')
    `, [id]);
    for (const locale of locales) await client.query('INSERT INTO ck.catalog_text VALUES ($1,1,$2,$3,$4,$5)',
      [id, locale, 'Test ' + locale, 'Summary ' + locale, 'Body ' + locale]);
    await publishLocalizedRevision(client, { itemId: id, revision: 1, itemVersion: 1, editVersion: 6 });
    const policy = await publicPolicy(client, 'cookies', 'fr');
    assert.equal(policy?.entry.body, 'Body fr');
    assert.equal(policy.metadata.alternates.pt, '/pt/cookies');
  });
});

test('Popular counts only public approved opens in complete UTC days before applying filters', async () => {
  await withMigratedDatabase(async client => {
    const items = [sampleCatalog[0], sampleCatalog[1], ...[1, 2, 3].map(n => ({
      ...sampleCatalog[0], itemId: randomUUID(), slug: 'extra-' + n, featuredRank: n + 1,
    }))];
    await seedCatalog(client, items);
    const hidden = randomUUID();
    await client.query("INSERT INTO ck.catalog_item (item_id,kind,slug) VALUES ($1,'palette','private-draft')", [hidden]);
    const now = new Date('2026-05-01T16:00:00Z');
    const options = { kind: 'palette', locale: 'en', sort: 'popular', now, measurement: true, limit: 2 } as const;
    const initial = await publicCatalogListing(client, options);
    assert.equal(initial.reason, 'insufficient-activity');
    assert.equal(initial.items[0]?.entry.slug, 'forest-study');
    const signingKey = randomBytes(32);
    async function open(itemId: string, issuedAt: Date, consent = true, clock = now) {
      return recordCatalogOpen(client, { signingKey, now: clock, consent,
        token: issueCatalogOpen(signingKey, { eventId: randomUUID(), itemId, issuedAt }) });
    }
    const previousDay = new Date('2026-04-30T21:00:00Z');
    assert.equal(await open(hidden, previousDay), 'unpublished');
    assert.equal(await open(items[0]!.itemId, previousDay, false), 'disabled');
    for (const [index, item] of items.entries()) {
      for (let i = 0; i < (index === 1 ? 9 : 4); i++) assert.equal(await open(item.itemId, previousDay), 'accepted');
    }
    assert.equal(await open(items[0]!.itemId, now), 'accepted');
    const first = await publicCatalogListing(client, options);
    assert.equal(first.sort, 'popular');
    assert.equal(first.items[0]?.entry.itemId, items[1]!.itemId);
    assert.equal(first.items[0]?.measuredOpens, '9');
    assert.equal(first.items[1]?.measuredOpens, '4');
    assert(first.nextCursor);
    const second = await publicCatalogListing(client, { ...options, cursor: first.nextCursor });
    assert.equal(new Set([...first.items, ...second.items].map(value => value.entry.itemId)).size, 4);
    await assert.rejects(publicCatalogListing(client, { ...options, locale: 'de', cursor: first.nextCursor }), /cursor/);
    const filtered = await publicCatalogListing(client, { ...options, filters: { query: 'morning' } });
    assert.equal(filtered.sort, 'popular');
    assert.deepEqual(filtered.items.map(value => value.entry.slug), ['morning-stone']);
    assert.equal((await publicCatalogListing(client, { ...options, measurement: false })).reason, 'measurement-disabled');
  });
});
