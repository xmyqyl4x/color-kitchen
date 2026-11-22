import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { getCatalogEntry, listCatalog } from '../src/catalog/repository.js';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { withMigratedDatabase } from './postgres.js';

test('a repeatable catalog import only projects current public, locale-filtered records', async () => {
  await withMigratedDatabase(async client => {
    assert.deepEqual(await seedCatalog(client, sampleCatalog), { inserted: 5, unchanged: 0 });
    assert.deepEqual(await seedCatalog(client, sampleCatalog), { inserted: 0, unchanged: 5 });
    assert.equal((await getCatalogEntry(client, 'palette', 'forest-study', 'fr'))?.title, 'Étude forestière');
    assert.equal((await getCatalogEntry(client, 'font', 'source-sans-3', 'de'))?.licenseId, 'OFL-1.1');
    const first = await listCatalog(client, { kind: 'palette', locale: 'en', limit: 1 });
    assert.equal(first.items[0]?.slug, 'forest-study');
    assert(first.nextCursor);
    const next = await listCatalog(client, { kind: 'palette', locale: 'en', limit: 1, cursor: first.nextCursor });
    assert.equal(next.items[0]?.slug, 'morning-stone');
    assert.equal(next.nextCursor, null);
    await assert.rejects(listCatalog(client, { kind: 'palette', locale: 'de', cursor: first.nextCursor }), /cursor/);
    assert.equal((await listCatalog(client, { kind: 'palette', locale: 'en', query: '%' })).items.length, 0);
    assert.equal((await listCatalog(client, { kind: 'color', locale: 'pt', query: '#000000' })).items[0]?.slug, 'black');

    const source = sampleCatalog[0];
    assert.deepEqual(await seedCatalog(client, [{ ...source, revision: 2, colors: ['#102020', '#ABCDEF'] }]), { inserted: 1, unchanged: 0 });
    await seedCatalog(client, [source]);
    assert.equal((await getCatalogEntry(client, 'palette', source.slug, 'en'))?.revision, 2);
    await client.query("INSERT INTO ck.catalog_item (item_id, kind, slug) VALUES ($1, 'palette', 'draft')", [randomUUID()]);
    assert.equal(await getCatalogEntry(client, 'palette', 'draft', 'en'), null);
  });
});

test('invalid provenance or conflicting seed revisions do not publish partial data', async () => {
  await withMigratedDatabase(async client => {
    await assert.rejects(seedCatalog(client, [sampleCatalog[0], { ...sampleCatalog[4], licenseId: '' }]), /license/);
    await assert.rejects(seedCatalog(client, [{ ...sampleCatalog[4], sourceDigest: '0'.repeat(64) }]), /checksum/);
    assert.equal((await client.query('SELECT item_id FROM ck.catalog_item')).rowCount, 0);
    await seedCatalog(client, [sampleCatalog[0]]);
    await assert.rejects(seedCatalog(client, [{ ...sampleCatalog[0], colors: ['#000000', '#FFFFFF'] }]), /conflict/);
    assert.equal((await getCatalogEntry(client, 'palette', 'forest-study', 'en'))?.revision, 1);
  });
});
