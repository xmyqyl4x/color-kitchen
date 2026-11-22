import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { deliverCatalogInvalidation, type CatalogInvalidator } from '../src/catalog/invalidation.js';
import { catalogModeration } from '../src/catalog/moderation.js';
import { publicCatalogDetail } from '../src/catalog/public.js';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { locales } from '../src/model/locales.js';
import { withMigratedDatabase } from './postgres.js';

test('catalog moderation compares source translations and retries invalidation after a single committed publication', async () => {
  await withMigratedDatabase(async (client, url) => {
    await seedCatalog(client, sampleCatalog);
    const organizationId = randomUUID(), editorId = randomUUID(), publisherId = randomUUID();
    await client.query("INSERT INTO ck.project_organization VALUES ($1,'fixture','moderation')", [organizationId]);
    await client.query("INSERT INTO ck.project_principal VALUES ($1,$2,'editor'),($1,$3,'publisher')", [organizationId, editorId, publisherId]);
    await client.query("INSERT INTO ck.catalog_staff (organization_id,principal_id,role) VALUES ($1,$2,'editor'),($1,$3,'publisher')",
      [organizationId, editorId, publisherId]);
    const editor = catalogModeration(client, { organizationId, principalId: editorId });
    const delivered: string[] = [];
    const invalidate: CatalogInvalidator = async job => {
      delivered.push(job.idempotencyKey);
      if (delivered.length === 1) throw new Error('private provider detail');
    };
    const publisher = catalogModeration(client, { organizationId, principalId: publisherId }, invalidate);
    const listing = await editor.items({ kind: 'palette', query: 'FOREST-STUDY' });
    assert.equal(listing.entries.length, 1);
    const { itemId } = listing.entries[0]!;
    const publicVersions = async () => {
      const versions = [];
      for (const locale of locales) versions.push(await publicCatalogDetail(client, 'palette', 'forest-study', locale));
      return versions;
    };
    const original = await publicVersions();
    const draft = (await editor.fork(itemId, 1))!;
    const english = draft.translations.find(entry => entry.locale === 'en')!;
    await editor.translate({ ...english, title: 'Revised forest', itemId, revision: 2, expectedEditVersion: draft.editVersion });
    const stale = (await publisher.draft(itemId, 2))!;
    assert.deepEqual([...stale.staleLocales].sort(), ['de', 'es', 'fr', 'pt']);
    const french = stale.translations.find(entry => entry.locale === 'fr')!;
    await editor.translate({ ...french, itemId, revision: 2, expectedEditVersion: stale.editVersion });
    const compared = (await publisher.compare(itemId, 1, 2))!;
    assert.deepEqual(compared.translations.map(entry => entry.locale), ['en']);
    assert.deepEqual([...(await publisher.draft(itemId, 2))!.staleLocales].sort(), ['de', 'es', 'pt']);
    assert.deepEqual(await publicVersions(), original);

    const stamp = Date.now().toString(16).padStart(12, '0');
    const operation = () => stamp.slice(0, 8) + '-' + stamp.slice(8) + '-7' + randomUUID().slice(15);
    const command = { itemId, revision: 2, mode: 'publish' as const, expectedItemVersion: stale.itemVersion,
      expectedEditVersion: compared.targetEditVersion, operationId: operation() };
    assert.equal((await publisher.review(command)).status, 'allowed');
    const committed = await publisher.publish(command);
    assert.equal(committed.status, 'published');
    assert.deepEqual((await publicVersions()).map(value => value?.entry.revision), [2, 2, 2, 2, 2]);
    assert.deepEqual(await publisher.publish(command), committed);
    assert.equal(delivered.length, 1);
    const first = await client.query('SELECT attempts,last_failure_at,finished_at FROM ck.catalog_invalidation WHERE item_id=$1', [itemId]);
    assert.equal(first.rows[0].attempts, 1);
    assert(first.rows[0].last_failure_at);
    assert.equal(first.rows[0].finished_at, null);
    await client.query('UPDATE ck.catalog_invalidation SET available_at=now() WHERE item_id=$1', [itemId]);
    const rival = new pg.Client({ connectionString: url });
    await rival.connect();
    let claimedTwice: boolean | undefined;
    try {
      assert.equal(await deliverCatalogInvalidation(client, async job => {
        claimedTwice = await deliverCatalogInvalidation(rival, invalidate);
        await invalidate(job);
      }), true);
    } finally { await rival.end(); }
    assert.equal(claimedTwice, false);
    assert.equal(await deliverCatalogInvalidation(client, invalidate), false);
    assert.equal(delivered[1], delivered[0]);
    const audit = await publisher.audit({ itemId });
    assert.deepEqual(audit.entries.map(entry => [entry.action, entry.principalId]), [['catalog.publish', publisherId]]);
    const previous = (await publisher.draft(itemId, 1))!;
    assert.equal((await publisher.publish({ ...command, revision: 1, mode: 'rollback', operationId: operation(),
      expectedItemVersion: previous.itemVersion, expectedEditVersion: previous.editVersion })).status, 'rolled-back');
    assert.deepEqual(await publicVersions(), original);
    assert.deepEqual((await publisher.revisions(itemId)).entries.map(entry => [entry.revision, entry.published]), [[2, false], [1, true]]);
  });
});
