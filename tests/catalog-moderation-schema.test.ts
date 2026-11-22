import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { publicCatalogDetail } from '../src/catalog/public.js';
import { migrate, migrationFolder, readMigrations } from '../src/db/migrate.js';
import { locales } from '../src/model/locales.js';
import { withTestDatabase } from './postgres.js';

test('staff metadata upgrades current catalog content and keeps publication and review history', async () => {
  await withTestDatabase(async url => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const migrations = await readMigrations(fileURLToPath(migrationFolder));
      await migrate(client, migrations.filter(row => row.version <= '0006'));
      await seedCatalog(client, sampleCatalog);
      async function published() {
        const result = [];
        for (const locale of locales) result.push(await publicCatalogDetail(client, 'palette', 'forest-study', locale));
        return result;
      }
      const original = await published();
      const item = (await client.query("SELECT item_id FROM ck.catalog_item WHERE kind='palette' AND slug='forest-study'")).rows[0].item_id;
      await migrate(client, migrations);
      assert.deepEqual(await published(), original);
      const history = () => client.query('SELECT action, previous_rev, revision FROM ck.catalog_publication WHERE item_id=$1 ORDER BY item_version', [item]);
      assert.deepEqual((await history()).rows, [{ action: 'baseline', previous_rev: null, revision: 1 }]);
      const tenant = randomUUID(), staff = randomUUID();
      await client.query("INSERT INTO ck.project_organization VALUES ($1,'fixture-issuer','fixture-org')", [tenant]);
      await client.query("INSERT INTO ck.project_principal VALUES ($1,$2,'fixture-subject')", [tenant, staff]);
      await client.query(`INSERT INTO ck.catalog_revision
        (item_id,rev,schema_version,payload,origin,license_id,attribution)
        SELECT item_id,2,schema_version,payload,origin,license_id,attribution FROM ck.catalog_revision WHERE item_id=$1 AND rev=1`, [item]);
      const coverage = () => client.query('SELECT missing_locales,edit_version FROM ck.catalog_translation_coverage WHERE item_id=$1 AND rev=2', [item]);
      assert.deepEqual((await coverage()).rows[0].missing_locales, locales);
      const review = (version: string) => client.query(`INSERT INTO ck.catalog_review
        (review_id,item_id,rev,edit_version,organization_id,reviewer_id,decision) VALUES ($1,$2,2,$3,$4,$5,'approved')`,
        [randomUUID(), item, version, tenant, staff]);
      await assert.rejects(review('1'), { code: '23503' });
      await client.query("INSERT INTO ck.catalog_staff (organization_id,principal_id,role) VALUES ($1,$2,'publisher')", [tenant, staff]);
      await client.query(`INSERT INTO ck.catalog_text (item_id,rev,locale,title,summary,body)
        SELECT item_id,2,locale,title || ' (edited)',summary,body FROM ck.catalog_text WHERE item_id=$1 AND rev=1`, [item]);
      const complete = (await coverage()).rows[0];
      assert.deepEqual(complete.missing_locales, []);
      await review(complete.edit_version);
      assert.deepEqual(await published(), original);
      const switchTo = (revision: number) => client.query(`SELECT ck.publish_catalog_revision(i.item_id,r.rev,i.row_version,r.edit_version)
        FROM ck.catalog_item AS i JOIN ck.catalog_revision AS r USING (item_id) WHERE i.item_id=$1 AND r.rev=$2`, [item, revision]);
      await switchTo(2);
      assert.notDeepEqual(await published(), original);
      await switchTo(1);
      assert.deepEqual(await published(), original);
      assert.deepEqual((await history()).rows, [
        { action: 'baseline', previous_rev: null, revision: 1 },
        { action: 'publish', previous_rev: 1, revision: 2 },
        { action: 'rollback', previous_rev: 2, revision: 1 },
      ]);
      await assert.rejects(client.query('DELETE FROM ck.catalog_publication WHERE item_id=$1', [item]), { code: '23514' });
    } finally { await client.end(); }
  });
});
