import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { forkCatalogDraft, readCatalogDraft, saveCatalogTranslation, saveCatalogMetadata,
  publishStaffCatalog, listCatalogAudit } from '../src/catalog/moderation-repository.js';
import { publicCatalogDetail } from '../src/catalog/public.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { withMigratedDatabase } from './postgres.js';

test('staff publication commits review, public pointer, receipt and audit together', async () => {
  await withMigratedDatabase(async client => {
    await seedCatalog(client, sampleCatalog);
    const organizationId = randomUUID(), editorId = randomUUID(), publisherId = randomUUID(), guestId = randomUUID();
    const editor = { organizationId, principalId: editorId }, publisher = { organizationId, principalId: publisherId };
    await client.query("INSERT INTO ck.project_organization VALUES ($1,'fixture','catalog')", [organizationId]);
    await client.query("INSERT INTO ck.project_principal VALUES ($1,$2,'editor'),($1,$3,'publisher'),($1,$4,'guest')",
      [organizationId, editorId, publisherId, guestId]);
    await client.query("INSERT INTO ck.catalog_staff (organization_id,principal_id,role) VALUES ($1,$2,'editor'),($1,$3,'publisher')",
      [organizationId, editorId, publisherId]);
    const publicEntry = () => publicCatalogDetail(client, 'palette', 'forest-study', 'de');
    const old = (await publicEntry())!;
    const itemId = old.entry.itemId;
    assert.equal(await forkCatalogDraft(client, { organizationId, principalId: guestId }, itemId, 1), null);
    const draft = (await forkCatalogDraft(client, editor, itemId, 1))!;
    assert.equal(draft.revision, 2);
    const edit = { itemId, revision: draft.revision, expectedEditVersion: draft.editVersion, locale: 'de' as const,
      title: 'Redigierter Wald', summary: 'Eine redigierte Palette.', body: null };
    assert.equal((await saveCatalogTranslation(client, editor, edit)).status, 'saved');
    assert.equal((await saveCatalogTranslation(client, editor, edit)).status, 'stale');
    assert.deepEqual(await publicEntry(), old);
    const reviewed = (await readCatalogDraft(client, publisher, itemId, 2))!;
    const stamp = Date.now().toString(16).padStart(12, '0');
    const operation = () => stamp.slice(0, 8) + '-' + stamp.slice(8) + '-7' + randomUUID().slice(15);
    const operationId = operation();
    const originalApproval = { itemId, revision: 2, operationId, expectedItemVersion: reviewed.itemVersion,
      expectedEditVersion: reviewed.editVersion, mode: 'publish' as const };
    const metadataEdit = await saveCatalogMetadata(client, editor, { ...edit, expectedEditVersion: reviewed.editVersion },
      { ...reviewed.metadata, licenseId: 'updated-license' });
    assert.equal(metadataEdit.status, 'saved');
    if (metadataEdit.status !== 'saved') assert.fail();
    assert.equal((await publishStaffCatalog(client, publisher, originalApproval)).status, 'stale');
    const input = { ...originalApproval, expectedEditVersion: metadataEdit.editVersion };
    assert.equal((await publishStaffCatalog(client, editor, input)).status, 'unavailable');
    await client.query(`CREATE FUNCTION ck.reject_audit_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'controlled audit failure'; END $$;
      CREATE TRIGGER reject_audit_fixture BEFORE INSERT ON ck.audit_event FOR EACH ROW EXECUTE FUNCTION ck.reject_audit_fixture()`);
    await assert.rejects(publishStaffCatalog(client, publisher, input), /controlled audit failure/);
    await client.query('DROP TRIGGER reject_audit_fixture ON ck.audit_event');
    assert.deepEqual(await publicEntry(), old);
    assert.equal((await client.query('SELECT review_id FROM ck.catalog_review WHERE item_id=$1', [itemId])).rowCount, 0);
    assert.equal((await client.query('SELECT operation_id FROM ck.command_receipt WHERE operation_id=$1', [operationId])).rowCount, 0);
    const release = await publishStaffCatalog(client, publisher, input);
    assert.equal(release.status, 'published');
    assert.equal((await publicEntry())?.entry.title, edit.title);
    assert.deepEqual(await publishStaffCatalog(client, publisher, input), release);
    const audit = await listCatalogAudit(client, publisher, { itemId, limit: 1 });
    assert.deepEqual(audit.entries.map(entry => [entry.action, entry.previousRevision, entry.revision]), [['catalog.publish', 1, 2]]);
    assert.equal(audit.next, null);
    const previous = (await readCatalogDraft(client, publisher, itemId, 1))!;
    assert.equal((await publishStaffCatalog(client, publisher, { ...input, mode: 'rollback', revision: 1,
      operationId: operation(), expectedItemVersion: previous.itemVersion, expectedEditVersion: previous.editVersion })).status, 'rolled-back');
    assert.deepEqual(await publicEntry(), old);
    const latest = await listCatalogAudit(client, publisher, { itemId, limit: 1 });
    assert.equal(latest.entries[0]?.action, 'catalog.rollback');
    assert(latest.next);
    const earlier = await listCatalogAudit(client, publisher, { itemId, limit: 1, before: latest.next });
    assert.equal(earlier.entries[0]?.action, 'catalog.publish');
    assert.deepEqual(await listCatalogAudit(client, { organizationId, principalId: guestId }), { entries: [], next: null });
  });
});
