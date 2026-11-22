import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { withMigratedDatabase } from './postgres.js';

const locales = ['de', 'en', 'es', 'fr', 'pt'];

async function addText(client: Client, item: string, rev: number, locale: string, body: string | null = 'Policy body') {
  await client.query('INSERT INTO ck.catalog_text VALUES ($1, $2, $3, $4, $5, $6)',
    [item, rev, locale, `Title ${locale}`, `Summary ${locale}`, body]);
}

test('publication seals one complete five-locale revision and preserves the prior public head on failure', async () => {
  await withMigratedDatabase(async client => {
    const item = randomUUID();
    await client.query("INSERT INTO ck.catalog_item (item_id, kind, slug) VALUES ($1, 'policy', 'privacy')", [item]);
    await assert.rejects(client.query("INSERT INTO ck.catalog_item (item_id, kind, slug) VALUES ($1, 'policy', 'privacy')",
      [randomUUID()]), { code: '23505' });
    await assert.rejects(addText(client, item, 99, 'en'), { code: '23503' });
    for (const rev of [1, 2]) {
      await client.query(`
        INSERT INTO ck.catalog_revision (item_id, rev, payload, origin, license_id, attribution, effective_at)
        VALUES ($1, $2, '{}', 'original', 'fixture', 'Local original fixture', now() - interval '1 minute')
      `, [item, rev]);
    }
    for (const locale of locales) await addText(client, item, 1, locale);
    await assert.rejects(addText(client, item, 1, 'it'), { code: '23514' });
    await assert.rejects(client.query('UPDATE ck.catalog_item SET published_rev = 1 WHERE item_id = $1', [item]),
      /sealed revision/);
    await client.query('SELECT ck.publish_catalog_revision($1, 1, 1, 6)', [item]);
    assert.deepEqual((await client.query(`
      SELECT locale, rev FROM ck.published_catalog WHERE item_id = $1 ORDER BY locale
    `, [item])).rows, locales.map(locale => ({ locale, rev: 1 })));
    await assert.rejects(client.query("UPDATE ck.catalog_text SET title = 'Changed' WHERE item_id = $1 AND rev = 1",
      [item]), /sealed revisions/);

    for (const locale of locales.slice(1)) await addText(client, item, 2, locale);
    await assert.rejects(client.query('SELECT ck.publish_catalog_revision($1, 2, 2, 5)', [item]), /five locales/);
    await addText(client, item, 2, 'de', null);
    await assert.rejects(client.query('SELECT ck.publish_catalog_revision($1, 2, 2, 6)', [item]), /translated bodies/);
    assert.deepEqual((await client.query('SELECT DISTINCT rev FROM ck.published_catalog')).rows, [{ rev: 1 }]);
    await client.query("UPDATE ck.catalog_text SET body = 'Body' WHERE item_id = $1 AND rev = 2 AND locale = 'de'", [item]);
    await assert.rejects(client.query('SELECT ck.publish_catalog_revision($1, 2, 2, 6)', [item]), { code: 'P0412' });
    await client.query('SELECT ck.publish_catalog_revision($1, 2, 2, 7)', [item]);
    assert.deepEqual((await client.query('SELECT DISTINCT rev FROM ck.published_catalog')).rows, [{ rev: 2 }]);
  });
});

test('publication validates payload, provenance, and the five labels of assigned tags', async () => {
  await withMigratedDatabase(async client => {
    const item = randomUUID();
    const tag = randomUUID();
    await client.query("INSERT INTO ck.catalog_item (item_id, kind, slug) VALUES ($1, 'palette', 'test-palette')", [item]);
    await assert.rejects(client.query(`
      INSERT INTO ck.catalog_revision (item_id, rev, payload, origin, license_id)
      VALUES ($1, 1, '{}', 'licensed', 'fixture')
    `, [item]), { code: '23514' });
    await client.query(`
      INSERT INTO ck.catalog_revision (item_id, rev, payload, origin, license_id, attribution)
      VALUES ($1, 1, '{}', 'original', 'fixture', 'Local fixture')
    `, [item]);
    for (const locale of locales) await addText(client, item, 1, locale);
    await assert.rejects(client.query('SELECT ck.publish_catalog_revision($1, 1, 1, 6)', [item]), /requires swatches/);
    const swatches = [0, 1].map(value => ({
      id: `swatch-${value}`, color: { space: 'srgb', components: [value, value, value], alpha: 1 },
    }));
    await client.query('UPDATE ck.catalog_revision SET payload = $2 WHERE item_id = $1', [item, { swatches }]);
    await client.query("INSERT INTO ck.tag (tag_id, slug, facet) VALUES ($1, 'forest', 'mood')", [tag]);
    await client.query('INSERT INTO ck.catalog_revision_tag VALUES ($1, 1, $2)', [item, tag]);
    await assert.rejects(client.query('SELECT ck.publish_catalog_revision($1, 1, 1, 8)', [item]), /five labels/);
    for (const locale of locales) await client.query('INSERT INTO ck.tag_text VALUES ($1, $2, $3)', [tag, locale, locale]);
    await client.query('SELECT ck.publish_catalog_revision($1, 1, 1, 8)', [item]);
    await assert.rejects(client.query("DELETE FROM ck.tag_text WHERE tag_id = $1 AND locale = 'pt'", [tag]), /complete tag labels/);
  });
});
