import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { Client } from 'pg';
import { withMigratedDatabase } from './postgres.js';

async function projectFixture(client: Client) {
  const organization = randomUUID(), actor = randomUUID(), project = randomUUID(), foreignProject = randomUUID();
  await client.query("INSERT INTO ck.project_organization VALUES ($1,'https://issuer.example.test','theme-fixture')", [organization]);
  await client.query("INSERT INTO ck.project_principal VALUES ($1,$2,'fixture-owner')", [organization, actor]);
  await client.query('BEGIN');
  for (const id of [project, foreignProject]) {
    await client.query("INSERT INTO ck.project (project_id,organization_id,name,created_by) VALUES ($1,$2,'Fixture',$3)", [id, organization, actor]);
    await client.query("INSERT INTO ck.project_member (project_id,organization_id,principal_id,role,granted_by) VALUES ($1,$2,$3,'owner',$3)", [id, organization, actor]);
  }
  await client.query('COMMIT');
  return { organization, actor, project, foreignProject };
}

test('theme revisions are immutable and releases retain their scoped frozen snapshot across withdrawal', async () => {
  await withMigratedDatabase(async client => {
    const { organization, actor, project, foreignProject } = await projectFixture(client);
    const asset = randomUUID();
    await client.query("INSERT INTO ck.asset (asset_id,organization_id,project_id,kind,name) VALUES ($1,$2,$3,'theme','Board')", [asset, organization, project]);
    const roles = Object.fromEntries(['scene.background','tile.text','selection.fill','selection.outline','action.primary','action.label'].map(role => [role, 'a']));
    const snapshot = { swatches: [{ id: 'a', color: { space: 'srgb', components: [1, 0, 0], alpha: 1 } }], roles };
    const insert = (rev: number, value: unknown) => client.query(`INSERT INTO ck.asset_revision
      (organization_id,project_id,asset_id,rev,schema_version,payload,digest,author_id,operation_id,request_hash)
      VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$6)`, [organization, project, asset, rev, value, 'b'.repeat(64), actor, randomUUID()]);
    await assert.rejects(insert(1, { swatches: ['invalid'], roles: {} }), { code: '23514' });
    await assert.rejects(insert(1, { ...snapshot, roles: { ...roles, 'tile.text': 'missing' } }), { code: '23514' });
    await insert(1, snapshot);
    await insert(2, { ...snapshot, roles: {} });
    const release = (scope: string, rev: number) => client.query(`INSERT INTO ck.asset_release
      (release_id,organization_id,project_id,asset_id,rev,released_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING release_id,audience`,
      [randomUUID(), organization, scope, asset, rev, actor]);
    await assert.rejects(release(foreignProject, 1), { code: '23503' });
    await assert.rejects(release(project, 2), { code: '23514' });
    const current = (await release(project, 1)).rows[0];
    assert.equal(current.audience, 'project');
    await assert.rejects(release(project, 1), { code: '23505' });
    await assert.rejects(client.query("UPDATE ck.asset_revision SET payload='{}' WHERE asset_id=$1", [asset]), { code: '23514' });
    await assert.rejects(client.query("UPDATE ck.asset_release SET audience='public' WHERE release_id=$1", [current.release_id]), { code: '23514' });
    await client.query('UPDATE ck.asset_release SET withdrawn_at=now(), withdrawn_by=$2 WHERE release_id=$1', [current.release_id, actor]);
    const replacement = (await release(project, 1)).rows[0];
    assert.notEqual(replacement.release_id, current.release_id);
    assert.deepEqual((await client.query('SELECT payload FROM ck.asset_revision WHERE asset_id=$1 AND rev=1', [asset])).rows[0].payload, snapshot);
  });
});

test('a durable command receipt must complete in the transaction that reserves it', async () => {
  await withMigratedDatabase(async client => {
    const { organization, actor, project } = await projectFixture(client);
    const operation = randomUUID();
    const reserve = () => client.query(`INSERT INTO ck.command_receipt
      (organization_id,actor_id,operation_id,command,resource_kind,resource_id,request_hash,expires_at)
      VALUES ($1,$2,$3,'release','theme',$4,$5,now()+interval '2 days')`, [organization, actor, operation, project, 'c'.repeat(64)]);
    await assert.rejects(reserve(), { code: '23514' });
    await client.query('BEGIN');
    await reserve();
    await client.query("UPDATE ck.command_receipt SET http_status=201,result=jsonb_build_object('version',1) WHERE operation_id=$1", [operation]);
    await client.query('COMMIT');
    assert.equal((await client.query('SELECT http_status FROM ck.command_receipt WHERE operation_id=$1', [operation])).rows[0].http_status, 201);
    await assert.rejects(client.query('DELETE FROM ck.command_receipt WHERE operation_id=$1', [operation]), { code: '23514' });
  });
});
