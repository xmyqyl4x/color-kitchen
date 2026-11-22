import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { parseColor } from '../src/color/parse.js';
import { gameFixtureProvider } from '../src/game-preview/fixtures.js';
import { createProject, listThemeAssets, readThemeRevision } from '../src/projects/repository.js';
import { themeRoleKeys } from '../src/projects/snapshot.js';
import { developerThemes } from '../src/projects/workflows.js';
import { withMigratedDatabase } from './postgres.js';

function timedOperation() {
  const clock = Date.now().toString(16).padStart(12, '0');
  return clock.slice(0, 8) + '-' + clock.slice(8) + '-7' + randomUUID().slice(15);
}

test('developer themes fork and restore immutable revisions, export exact tokens and recheck preview access', async () => {
  await withMigratedDatabase(async (client, url) => {
    const organizationId = randomUUID(), principalId = randomUUID(), viewerId = randomUUID(), projectId = randomUUID();
    const owner = { organizationId, principalId }, viewer = { organizationId, principalId: viewerId };
    const assetId = randomUUID(), forkId = randomUUID(), target = { projectId, assetId };
    await client.query("INSERT INTO ck.project_organization VALUES ($1,'fixture','theme-workflows')", [organizationId]);
    await client.query("INSERT INTO ck.project_principal VALUES ($1,$2,'owner'),($1,$3,'viewer')", [organizationId,principalId,viewerId]);
    await createProject(client, owner, projectId, 'Fixture');
    await client.query("INSERT INTO ck.project_member (organization_id,project_id,principal_id,granted_by,role) VALUES ($1,$2,$3,$4,'viewer')",
      [organizationId,projectId,viewerId,principalId]);
    const workflows = developerThemes(client, owner);
    const snapshot = { swatches: [{ id: 'paper', color: parseColor('#fff') }, { id: 'ink', color: parseColor('#123') }],
      roles: Object.fromEntries(themeRoleKeys.map(role => [role, role.endsWith('text') || role.endsWith('label') ? 'ink' : 'paper'])) };
    const create = { ...target, name: 'Theme', snapshot, operationId: randomUUID() };
    assert.equal((await workflows.create(create)).status, 'saved');
    const changed = { ...snapshot, swatches: [snapshot.swatches[0]!, { id: 'ink', color: parseColor('#678') }] };
    assert.equal((await workflows.edit({ ...create, snapshot: changed, operationId: randomUUID(), expectedRevision: 1 })).status, 'saved');
    assert.deepEqual((await workflows.compare({ ...target, before: 1, after: 2 }))?.changedRoles, ['action.label', 'tile.text']);
    const fork = await workflows.fork({ projectId, assetId: forkId, sourceAssetId: assetId, sourceRevision: 1,
      operationId: randomUUID(), name: 'Copy' });
    assert.equal(fork.status, 'saved');
    assert.deepEqual((await readThemeRevision(client, owner, projectId, forkId, 1))?.basedOn, { assetId, revision: 1 });
    const restored = { ...target, sourceRevision: 1, expectedRevision: 2, operationId: randomUUID(), name: 'Theme' };
    assert.equal((await workflows.restore(restored)).status, 'saved');
    assert.deepEqual((await readThemeRevision(client, owner, projectId, assetId, 3))?.basedOn, { assetId, revision: 1 });
    assert.equal((await workflows.restore(restored)).status, 'saved');
    const rival = new pg.Client({ connectionString: url });
    await rival.connect();
    try {
      const asset = (await listThemeAssets(client, owner, projectId)).find(item => item.assetId === assetId)!;
      const release = { ...target, revision: 1, expectedVersion: asset.version, operationId: timedOperation() };
      const [a, b] = await Promise.all([workflows.release(release), developerThemes(rival, owner).release(release)]);
      assert.deepEqual(a, b);
      assert.equal(a.status, 'released');
      if (a.status !== 'released') assert.fail();
      assert.equal((await client.query('SELECT count(*)::int AS count FROM ck.asset_release WHERE asset_id=$1', [assetId])).rows[0].count, 1);
      const output = await workflows.exportRevision({ ...target, revision: 1, format: 'json' });
      assert(output);
      const document = JSON.parse(output.body);
      assert.equal(document.status, 'released');
      assert.deepEqual(document.swatches, snapshot.swatches);
      assert(!Object.hasOwn(document, 'basedOn'));
      assert.match((await workflows.exportRevision({ ...target, revision: 1, format: 'css' }))!.body, /--tile-text: /);
      const localized = await developerThemes(client, viewer).preview({ ...target, revision: 1, locale: 'fr' });
      assert.equal(localized.status, 'ready');
      if (localized.status !== 'ready') assert.fail();
      assert.equal(localized.source, 'fixture');
      assert.equal(localized.scenes.length, 6);
      assert(localized.contrast.every(pair => pair.measurement && pair.measurement.ratio > 4.5));
      const live = await developerThemes(client, viewer).preview({ ...target, revision: 1, locale: 'fr', mode: 'live' });
      assert.deepEqual(live, { status: 'unavailable' });
      const failing = developerThemes(client, viewer, { fixture: () => ({ source: 'fixture', async read() { throw Error('fixture outage'); } }) });
      assert.deepEqual(await failing.preview({ ...target, revision: 1, locale: 'fr' }), { status: 'unavailable' });
      const racing = developerThemes(client, viewer, { fixture: (scope, actor, now) => {
        const provider = gameFixtureProvider(scope, actor, now);
        return { source: 'fixture', async read(request, principal) {
          await rival.query('UPDATE ck.project_member SET inactive_at=now() WHERE project_id=$1 AND principal_id=$2', [projectId, viewerId]);
          return provider.read(request, principal);
        } };
      } });
      assert.deepEqual(await racing.preview({ ...target, revision: 1, locale: 'fr' }), { status: 'unavailable' });
      assert.equal(await developerThemes(client, viewer).exportRevision({ ...target, revision: 1, format: 'json' }), null);
      assert.equal((await workflows.withdraw({ ...target, releaseId: a.releaseId, expectedVersion: a.version, operationId: timedOperation() })).status, 'withdrawn');
    } finally { await rival.end(); }
  });
});
