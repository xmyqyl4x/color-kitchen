import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { parseColor } from '../src/color/parse.js';
import { extensionState } from '../src/extension/state.js';
import { withMigratedDatabase } from './postgres.js';

test('connector grants require explicit same-organization project selections and stop resolving when revoked', async () => {
  await withMigratedDatabase(async client => {
    const organization = randomUUID(), foreignOrganization = randomUUID();
    const actor = randomUUID(), other = randomUUID(), project = randomUUID(), foreignProject = randomUUID();
    const grant = randomUUID();
    await client.query("INSERT INTO ck.project_organization VALUES ($1,'fixture','a'),($2,'fixture','b')", [organization, foreignOrganization]);
    await client.query("INSERT INTO ck.project_principal VALUES ($1,$2,'actor'),($3,$4,'other')", [organization, actor, foreignOrganization, other]);
    await client.query('BEGIN');
    for (const [org, account, id] of [[organization, actor, project], [foreignOrganization, other, foreignProject]]) {
      await client.query("INSERT INTO ck.project (project_id,organization_id,name,created_by) VALUES ($1,$2,'Fixture',$3)", [id, org, account]);
      await client.query("INSERT INTO ck.project_member (project_id,organization_id,principal_id,role,granted_by) VALUES ($1,$2,$3,'owner',$3)", [id, org, account]);
    }
    await client.query('COMMIT');
    const issue = () => client.query(`INSERT INTO ck.connector_grant
      (organization_id,grant_id,actor_id,client_id,expires_at) VALUES ($1,$2,$3,'fixture-client',now()+interval '1 hour')`,
      [organization, grant, actor]);
    const allow = (id: string) => client.query('INSERT INTO ck.connector_grant_project VALUES ($1,$2,$3)', [organization, grant, id]);
    await assert.rejects(issue(), { code: '23514' });
    await client.query('BEGIN');
    await issue();
    await client.query('SAVEPOINT tenant_check');
    await assert.rejects(allow(foreignProject), { code: '23503' });
    await client.query('ROLLBACK TO SAVEPOINT tenant_check');
    await allow(project);
    await client.query('COMMIT');
    const current = () => client.query('SELECT project_id,scope FROM ck.current_connector_grant WHERE grant_id=$1', [grant]);
    assert.deepEqual((await current()).rows, [{ project_id: project, scope: 'project:read' }]);
    await assert.rejects(client.query('DELETE FROM ck.connector_grant_project WHERE grant_id=$1', [grant]), { code: '23514' });
    await client.query('UPDATE ck.connector_grant SET revoked_at=now() WHERE grant_id=$1', [grant]);
    assert.equal((await current()).rowCount, 0);
    await assert.rejects(client.query('UPDATE ck.connector_grant SET revoked_at=NULL WHERE grant_id=$1', [grant]), { code: '23514' });
    const expired = randomUUID();
    await client.query('BEGIN');
    await client.query(`INSERT INTO ck.connector_grant (organization_id,grant_id,actor_id,client_id,issued_at,expires_at)
      VALUES ($1,$2,$3,'fixture-client',now()-interval '2 hours',now()-interval '1 hour')`, [organization, expired, actor]);
    await client.query('INSERT INTO ck.connector_grant_project VALUES ($1,$2,$3)', [organization, expired, project]);
    await client.query('COMMIT');
    assert.equal((await client.query('SELECT grant_id FROM ck.current_connector_grant WHERE grant_id=$1', [expired])).rowCount, 0);
  });
});

test('extension state upgrades selected colors and persists only versioned local values', () => {
  const selected = extensionState({ version: 1, selectedHex: ['#ABC', '#11223380'], captureMode: 'styles',
    pageUrl: 'https://private.example.test/', pageText: 'private page fixture' });
  assert.deepEqual(selected, { version: 2, swatches: [parseColor('#abc'), parseColor('#11223380')], captureMode: 'styles' });
  assert.deepEqual(extensionState(selected), selected);
  assert.deepEqual(extensionState(undefined), { version: 2, swatches: [], captureMode: 'pick' });
  assert.throws(() => extensionState({ version: 3, swatches: [] }), RangeError);
  assert.throws(() => extensionState({ version: 2, swatches: [parseColor('color(display-p3 0.4 0.2 0.1)')] }), RangeError);
  assert.throws(() => extensionState({ version: 1, selectedHex: Array(13).fill('#fff') }), RangeError);
});
