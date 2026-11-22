import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { parseColor } from '../src/color/parse.js';
import { createProject, findProjectActor, listProjects, listThemeAssets, readThemeRevision,
  saveThemeRevision, changeThemeRelease, readPublicThemeRelease } from '../src/projects/repository.js';
import { themeRoleKeys } from '../src/projects/snapshot.js';
import { withMigratedDatabase } from './postgres.js';

test('repositories scope access, serialize theme edits and preserve the released revision and command replay', async () => {
  await withMigratedDatabase(async (client, connectionString) => {
    const [organization, foreignOrganization, principal, foreignPrincipal, viewerId, project, otherProject, assetId] =
      Array.from({ length: 8 }, () => randomUUID()) as [string, string, string, string, string, string, string, string];
    await client.query("INSERT INTO ck.project_organization VALUES ($1,'fixture-issuer','own'),($2,'fixture-issuer','other')", [organization, foreignOrganization]);
    await client.query("INSERT INTO ck.project_principal VALUES ($1,$2,'same-subject'),($3,$4,'same-subject'),($1,$5,'viewer')",
      [organization, principal, foreignOrganization, foreignPrincipal, viewerId]);
    const owner = (await findProjectActor(client, { issuer: 'fixture-issuer', organization: 'own', subject: 'same-subject' }))!;
    const other = (await findProjectActor(client, { issuer: 'fixture-issuer', organization: 'other', subject: 'same-subject' }))!;
    const viewer = { organizationId: organization, principalId: viewerId };
    assert.deepEqual(owner, { organizationId: organization, principalId: principal });
    await createProject(client, owner, project, 'Board');
    await createProject(client, other, otherProject, 'Other board');
    await client.query("INSERT INTO ck.project_member (project_id,organization_id,principal_id,role,granted_by) VALUES ($1,$2,$3,'viewer',$4)",
      [project, organization, viewerId, principal]);
    assert.deepEqual((await listProjects(client, viewer)).map(value => [value.projectId, value.role]), [[project, 'viewer']]);
    const snapshot = { swatches: [{ id: 'one', color: parseColor('#147') }],
      roles: Object.fromEntries(themeRoleKeys.map(role => [role, 'one'])) };
    const newTheme = { projectId: project, assetId, expectedRevision: 0, name: 'Theme', operationId: randomUUID(), snapshot };
    assert.equal((await saveThemeRevision(client, viewer, newTheme)).status, 'unavailable');
    assert.equal((await saveThemeRevision(client, owner, newTheme)).status, 'saved');
    assert.deepEqual(await listThemeAssets(client, other, project), []);
    assert.equal(await readThemeRevision(client, other, project, assetId, 1), null);
    assert.deepEqual((await readThemeRevision(client, viewer, project, assetId, 1))?.payload, snapshot);
    assert.equal((await saveThemeRevision(client, owner, newTheme)).status, 'saved');
    assert.equal((await saveThemeRevision(client, owner, { ...newTheme, name: 'Different' })).status, 'conflict');

    const concurrent = new pg.Client({ connectionString });
    await concurrent.connect();
    try {
      const edits = [client, concurrent].map(connection => saveThemeRevision(connection, owner,
        { ...newTheme, expectedRevision: 1, operationId: randomUUID(), name: 'New draft' }));
      assert.deepEqual((await Promise.all(edits)).map(result => result.status).sort(), ['saved', 'stale']);
    } finally { await concurrent.end(); }

    const version = (await listThemeAssets(client, owner, project))[0]!.version;
    const operation = () => {
      const millis = Date.now().toString(16).padStart(12, '0');
      return millis.slice(0, 8) + '-' + millis.slice(8) + '-7' + randomUUID().slice(15);
    };
    const publish = { projectId: project, assetId, expectedVersion: version, operationId: operation(),
      type: 'release' as const, revision: 1, audience: 'public' as const, confirmPublic: true };
    assert.equal((await changeThemeRelease(client, viewer, publish)).status, 'unavailable');
    assert.equal((await changeThemeRelease(client, owner, { ...publish, confirmPublic: false })).status, 'invalid');
    assert.equal((await changeThemeRelease(client, owner, { ...publish, operationId: randomUUID() })).status, 'expired');
    const publication = await changeThemeRelease(client, owner, publish);
    assert.equal(publication.status, 'released');
    if (publication.status !== 'released') assert.fail();
    assert.deepEqual((await readPublicThemeRelease(client, publication.releaseId))?.payload, snapshot);
    const withdraw = { projectId: project, assetId, expectedVersion: publication.version, operationId: operation(),
      type: 'withdraw' as const, releaseId: publication.releaseId };
    assert.equal((await changeThemeRelease(client, owner, withdraw)).status, 'withdrawn');
    assert.equal(await readPublicThemeRelease(client, publication.releaseId), null);
    assert.deepEqual(await changeThemeRelease(client, owner, publish), publication);
    assert.equal((await changeThemeRelease(client, owner, { ...publish, audience: 'project' })).status, 'conflict');
    await client.query('UPDATE ck.project_member SET inactive_at=now() WHERE project_id=$1 AND principal_id=$2', [project, viewerId]);
    assert.equal(await readThemeRevision(client, viewer, project, assetId, 1), null);
  });
});
