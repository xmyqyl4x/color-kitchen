import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { parseColor } from '../src/color/parse.js';
import { connectorReadRequest, projectConnectorRelease, readConnector } from '../src/connector/projections.js';
import { themeRoleKeys } from '../src/projects/snapshot.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { withMigratedDatabase } from './postgres.js';

test('read contract rejects write-like requests, revision selection, unknown fields and other cursor scopes', () => {
  const releaseId = randomUUID(), projectId = randomUUID(), assetId = randomUUID();
  const cases = [
    { operation: 'write', releaseId },
    { operation: 'theme.public', releaseId, revision: 1 },
    { operation: 'theme.project', projectId, assetId, releaseId },
    { operation: 'theme.project', projectId, assetId, query: 'all projects' },
    { operation: 'catalog.search', kind: 'palette', locale: 'en', limit: 100 },
    { operation: 'catalog.search', kind: 'palette', locale: 'en', cursor: 'project.v1.value' },
  ];
  for (const input of cases) assert.equal(connectorReadRequest(input), null);
  assert.deepEqual(connectorReadRequest({ operation: 'theme.public', releaseId }), { operation: 'theme.public', releaseId });
  assert.deepEqual(connectorReadRequest({ operation: 'theme.project', projectId, assetId }), { operation: 'theme.project', projectId, assetId });
});

test('theme projection exposes only versioned role and swatch fields', () => {
  const source = { releaseId: randomUUID(), revision: 2, schemaVersion: 1, digest: 'c'.repeat(64), projectTitle: 'private fixture name',
    payload: { swatches: [{ id: 'a', color: { ...parseColor('#147'), private: 'fixture' }, author: 'fixture' }],
      roles: Object.fromEntries(themeRoleKeys.map(key => [key, 'a'])), organization: 'private' } };
  const projected = projectConnectorRelease(source);
  assert(projected);
  assert.deepEqual(Object.keys(projected).sort(), ['releaseId', 'revision', 'roles', 'schemaVersion', 'swatches']);
  assert.deepEqual(projected.swatches, [{ id: 'a', color: parseColor('#147') }]);
  assert.equal(projectConnectorRelease({ ...source, payload: { ...source.payload, roles: {} } }), null);
  assert.equal(projectConnectorRelease({ ...source, schemaVersion: 2 }), null);
});

test('public catalog cursor is bound to its anonymous query and projected before return', async () => {
  await withMigratedDatabase(async client => {
    await seedCatalog(client, sampleCatalog);
    const search = { operation: 'catalog.search', kind: 'palette', locale: 'es', limit: 1 };
    const first = await readConnector(client, search);
    assert(first.status === 'ok' && first.operation === 'catalog.search' && first.data.nextCursor);
    assert.deepEqual(Object.keys(first.data.items[0]!).sort(),
      ['itemId', 'kind', 'licenseId', 'locale', 'revision', 'slug', 'summary', 'title']);
    const second = await readConnector(client, { ...search, cursor: first.data.nextCursor });
    assert(second.status === 'ok' && second.operation === 'catalog.search');
    assert.notEqual(first.data.items[0]?.slug, second.data.items[0]?.slug);
    assert.deepEqual(await readConnector(client, { ...search, locale: 'pt', cursor: first.data.nextCursor }), { status: 'invalid-request' });
    assert.deepEqual(await readConnector(client, { operation: 'theme.project', projectId: randomUUID(), assetId: randomUUID() }),
      { status: 'unavailable' });
  });
});
