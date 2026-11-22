import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { getCatalogRelease } from '../src/catalog/repository.js';
import { publishLocalizedRevision } from '../src/catalog/publication.js';
import { compileMessageBundles, formatMessage } from '../src/i18n/bundles.js';
import { messages } from '../src/i18n/messages.js';
import { locales } from '../src/model/locales.js';
import { withMigratedDatabase } from './postgres.js';

const invalidPortuguese = { ...messages, pt: {
  ...messages.pt, 'inquiry.reference': 'Recebemos o seu pedido.',
} };

test('all five UI bundles preserve keys, parameters and plural syntax', () => {
  assert.equal(compileMessageBundles(messages).size, 5);
  assert.throws(() => compileMessageBundles(invalidPortuguese), /pt\/inquiry.reference.*placeholders/);
  const { 'contrast.invalid': _missing, ...incomplete } = messages.de;
  assert.throws(() => compileMessageBundles({ ...messages, de: incomplete }), /keys differ/);
  assert.throws(() => compileMessageBundles({ ...messages, es: {
    ...messages.es, 'palette.swatches': '{count, plural, one {# muestra}}',
  } }), /es\/palette.swatches/);
  assert.equal(formatMessage('fr', 'palette.swatches', { count: 0 }), '0 échantillon');
  assert.equal(formatMessage('de', 'palette.swatches', { count: 1 }), '1 Farbfeld');
  assert.equal(formatMessage('es', 'palette.swatches', { count: 7 }), '7 muestras');
  assert.match(formatMessage('pt', 'inquiry.reference', { reference: 'CK42' }), /CK42/);
});

test('publishing checks the UI bundle and policy translations separately and reads one complete release', async () => {
  await withMigratedDatabase(async client => {
    const itemId = randomUUID();
    await client.query("INSERT INTO ck.catalog_item (item_id, kind, slug) VALUES ($1, 'policy', 'terms')", [itemId]);
    for (const revision of [1, 2]) {
      await client.query(`INSERT INTO ck.catalog_revision
        (item_id, rev, payload, origin, license_id, attribution, effective_at)
        VALUES ($1, $2, '{}', 'original', 'fixture', 'Synthetic fixture', '2026-01-01T00:00:00Z')`,
      [itemId, revision]);
      for (const locale of locales) {
        if (revision === 2 && locale === 'de') continue;
        await client.query('INSERT INTO ck.catalog_text VALUES ($1,$2,$3,$4,$5,$6)',
          [itemId, revision, locale, `Title-${locale}`, `Summary-${locale}`, `Fixture-${locale}`]);
      }
    }
    const first = { itemId, revision: 1, itemVersion: 1, editVersion: 6 };
    await assert.rejects(publishLocalizedRevision(client, first, invalidPortuguese), /placeholders/);
    assert.equal(await getCatalogRelease(client, 'policy', 'terms'), null);
    assert.equal(await publishLocalizedRevision(client, first), '2');
    await assert.rejects(publishLocalizedRevision(client, { itemId, revision: 2, itemVersion: 2, editVersion: 5 }),
      /five locales/);
    const release = await getCatalogRelease(client, 'policy', 'terms');
    assert.equal(release?.revision, 1);
    assert.equal(release.effectiveAt?.toISOString(), '2026-01-01T00:00:00.000Z');
    assert.deepEqual(Object.keys(release.translations), locales);
    assert.equal(release.translations.de.body, 'Fixture-de');
  });
});
