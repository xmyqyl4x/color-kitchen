import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { parseColor } from '../src/color/parse.js';
import { searchConnectorCatalog, readConnectorPublicTheme, readConnectorProjectTheme } from '../src/connector/repository.js';
import { readConnector } from '../src/connector/projections.js';
import { extensionRepository, extensionStateKey } from '../src/extension/repository.js';
import { changeThemeRelease, createProject, listThemeAssets, saveThemeRevision } from '../src/projects/repository.js';
import { themeRoleKeys } from '../src/projects/snapshot.js';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { withMigratedDatabase } from './postgres.js';

test('connector reads bind exact grant, client, membership, project and current release in one query', async () => {
  await withMigratedDatabase(async client => {
    await seedCatalog(client, sampleCatalog);
    const catalog = await searchConnectorCatalog(client, { kind: 'palette', locale: 'fr', limit: 1 });
    assert.deepEqual(catalog.items.map(item => item.entry.locale), ['fr']);
    const organizationId = randomUUID(), principalId = randomUUID(), readerId = randomUUID(), projectId = randomUUID();
    const unselectedProject = randomUUID(), assetId = randomUUID(), grantId = randomUUID();
    const owner = { organizationId, principalId };
    const reader = { organizationId, principalId: readerId, grantId, clientId: 'fixture-client', scopes: ['project:read'] };
    await client.query("INSERT INTO ck.project_organization VALUES ($1,'fixture','connector')", [organizationId]);
    await client.query("INSERT INTO ck.project_principal VALUES ($1,$2,'owner'),($1,$3,'reader')", [organizationId, principalId, readerId]);
    for (const id of [projectId, unselectedProject]) {
      await createProject(client, owner, id, 'Fixture');
      await client.query("INSERT INTO ck.project_member (project_id,organization_id,principal_id,role,granted_by) VALUES ($1,$2,$3,'viewer',$4)",
        [id, organizationId, readerId, principalId]);
    }
    await client.query('BEGIN');
    await client.query(`INSERT INTO ck.connector_grant (organization_id,grant_id,actor_id,client_id,expires_at)
      VALUES ($1,$2,$3,'fixture-client',now()+interval '1 hour')`, [organizationId, grantId, readerId]);
    await client.query('INSERT INTO ck.connector_grant_project VALUES ($1,$2,$3)', [organizationId, grantId, projectId]);
    await client.query('COMMIT');
    const snapshot = { swatches: [{ id: 'a', color: parseColor('#225577') }],
      roles: Object.fromEntries(themeRoleKeys.map(role => [role, 'a'])) };
    const save = { projectId, assetId, snapshot, name: 'Private title', operationId: randomUUID(), expectedRevision: 0 };
    await saveThemeRevision(client, owner, save);
    const target = { projectId, assetId };
    assert.equal(await readConnectorProjectTheme(client, reader, target), null);
    const operation = () => {
      const prefix = Date.now().toString(16).padStart(12, '0');
      return prefix.slice(0, 8) + '-' + prefix.slice(8) + '-7' + randomUUID().slice(15);
    };
    const publish = async (audience: 'project' | 'public') => {
      const [asset] = await listThemeAssets(client, owner, projectId);
      const result = await changeThemeRelease(client, owner, { type: 'release', projectId, assetId, revision: 1, audience,
        confirmPublic: audience === 'public', operationId: operation(), expectedVersion: asset!.version });
      if (result.status !== 'released') assert.fail(result.status);
      return result.releaseId;
    };
    const scopedRelease = await publish('project');
    assert.equal(await readConnectorPublicTheme(client, scopedRelease), null);
    const access = (actor = reader, resource = target) => readConnectorProjectTheme(client, actor, resource);
    const permitted = (await access())!;
    assert.deepEqual(permitted.payload, snapshot);
    assert.deepEqual(Object.keys(permitted).sort(), ['digest','payload','releaseId','revision','schemaVersion']);
    const projected = await readConnector(client, { operation: 'theme.project', ...target }, reader);
    assert(projected.status === 'ok' && projected.operation === 'theme.project');
    assert.equal(projected.data.releaseId, scopedRelease);
    assert.equal(await access({ ...reader, clientId: 'other-client' }), null);
    assert.equal(await access({ ...reader, scopes: [] }), null);
    assert.equal(await access(reader, { ...target, projectId: unselectedProject }), null);
    await saveThemeRevision(client, owner, { ...save, name: 'New draft', operationId: randomUUID(), expectedRevision: 1 });
    assert.equal((await access())?.revision, 1);
    const publicRelease = await publish('public');
    assert.equal((await access())?.releaseId, publicRelease);
    assert.equal(await readConnectorPublicTheme(client, scopedRelease), null);
    assert((await readConnectorPublicTheme(client, publicRelease))?.payload);
    await client.query('UPDATE ck.project_member SET inactive_at=now() WHERE project_id=$1 AND principal_id=$2', [projectId, readerId]);
    assert.equal(await access(), null);
    assert.deepEqual(await readConnector(client, { operation: 'theme.project', ...target }, reader), { status: 'unavailable' });
    await client.query('UPDATE ck.project_member SET inactive_at=NULL WHERE project_id=$1 AND principal_id=$2', [projectId, readerId]);
    await client.query('UPDATE ck.connector_grant SET revoked_at=now() WHERE grant_id=$1', [grantId]);
    assert.equal(await access(), null);
  });
});

test('extension persistence keeps a profile boundary and rewrites legacy selections as clean v2 values', async () => {
  function profile(initial: Record<string, unknown> = {}) {
    return {
      data: { ...initial },
      async get(key: string) { return { [key]: this.data[key] }; },
      async set(values: Record<string, unknown>) { Object.assign(this.data, structuredClone(values)); },
    };
  }
  const first = profile({ [extensionStateKey]: { version: 1, selectedHex: ['#369'], pageUrl: 'private-fixture' } });
  const other = profile();
  const firstRepo = extensionRepository(first);
  const otherRepo = extensionRepository(other);
  const state = await firstRepo.load();
  assert.deepEqual(state.swatches, [parseColor('#369')]);
  await firstRepo.save(state);
  assert.deepEqual(first.data[extensionStateKey], state);
  assert.deepEqual((await otherRepo.load()).swatches, []);
  await assert.rejects(firstRepo.save({ ...state, swatches: Array(13).fill(parseColor('#fff')) }), RangeError);
  assert.deepEqual(await firstRepo.load(), state);
});
