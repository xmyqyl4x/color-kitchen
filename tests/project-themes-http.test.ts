import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { parseColor } from '../src/color/parse.js';
import { identityFromEnvironment } from '../src/http/identity.js';
import { projectThemesHttp } from '../src/http/project-themes.js';
import { apiError } from '../src/http/response.js';
import { createProject } from '../src/projects/repository.js';
import { themeRoleKeys } from '../src/projects/snapshot.js';
import { withHttp } from './http.js';
import { identityFixture, operationKey } from './identity-fixture.js';
import { withMigratedDatabase } from './postgres.js';

test('application identity verifies type, issuer, audience, lifetime and signed organization', () => {
  const { issuer, token, verifyIdentity } = identityFixture();
  assert.deepEqual(verifyIdentity(token('viewer')), { issuer, organization: 'test', subject: 'viewer' });
  assert.equal(verifyIdentity(token('viewer', 'test', { aud: 'connector' })), null);
  assert.equal(verifyIdentity(token('viewer', 'test', { iss: 'https://other.test' })), null);
  assert.equal(verifyIdentity(token('viewer', 'test', { exp: 1 })), null);
  assert.equal(verifyIdentity(token('viewer', 'test', { org_id: null })), null);
  assert.equal(verifyIdentity(token('viewer', 'test', {}, 'JWT')), null);
  assert.equal(verifyIdentity(token('viewer').replace(/\.[^.]+$/, '.AAAA')), null);
  assert.equal(identityFromEnvironment({}), undefined);
  assert.throws(() => identityFromEnvironment({ COLOR_KITCHEN_IDENTITY_ISSUER: issuer }), /together/);
});

test('HTTP themes isolate tenants, enforce revisions and expose only current public releases', async () => {
  await withMigratedDatabase(async (client, url) => {
    const identity = identityFixture();
    const organizationId = randomUUID(), otherOrg = randomUUID(), principalId = randomUUID(), editor = randomUUID(), viewer = randomUUID();
    const projectId = randomUUID(), assetId = randomUUID(), otherProject = randomUUID(), otherOwner = randomUUID();
    await client.query("INSERT INTO ck.project_organization VALUES ($1,$2,'test'),($3,$2,'other')", [organizationId, identity.issuer, otherOrg]);
    await client.query("INSERT INTO ck.project_principal VALUES ($1,$2,'owner'),($1,$3,'editor'),($1,$4,'viewer'),($5,$6,'owner')",
      [organizationId, principalId, editor, viewer, otherOrg, otherOwner]);
    await createProject(client, { organizationId, principalId }, projectId, 'Themes');
    await createProject(client, { organizationId: otherOrg, principalId: otherOwner }, otherProject, 'Unrelated');
    await client.query(`INSERT INTO ck.project_member (organization_id,project_id,principal_id,granted_by,role)
      VALUES ($1,$2,$3,$4,'editor'),($1,$2,$5,$4,'viewer')`, [organizationId, projectId, editor, principalId, viewer]);
    const pool = new pg.Pool({ connectionString: url });
    const handler = projectThemesHttp({ verifyIdentity: identity.verifyIdentity, async withClient(work) {
      const connection = await pool.connect();
      try { return await work(connection); } finally { connection.release(); }
    } });
    try {
      await withHttp(async request => await handler(request) ?? apiError(404, 'not_found'), async origin => {
        const get = (path: string, actor?: string, org?: string) => fetch(origin + path,
          actor ? { headers: { Authorization: identity.bearer(actor, org) } } : undefined);
        const projects = '/api/v1/projects', assets = `${projects}/${projectId}/assets`, theme = `${assets}/${assetId}`;
        const retry = operationKey();
        const write = (path: string, actor: string, match: string | undefined, value?: unknown, key = operationKey(), options?: RequestInit) =>
          fetch(origin + path, { method: value === undefined ? 'DELETE' : 'POST', body: value === undefined ? undefined : JSON.stringify(value),
            headers: { Authorization: identity.bearer(actor), 'Idempotency-Key': key, 'Content-Type': 'application/json',
              ...(match === undefined ? {} : { 'If-Match': `"${match}"` }) }, ...options });
        const data = async (request: Promise<Response>) => (await (await request).json()).data;
        const save = `${theme}/revisions`, release = `${theme}/releases`;
        const snapshot = { swatches: [{ id: 'paper', color: parseColor('#fff') }, { id: 'ink', color: parseColor('#123') }],
          roles: Object.fromEntries(themeRoleKeys.map(role => [role, role.endsWith('text') || role.endsWith('label') ? 'ink' : 'paper'])) };
        const input = { name: 'Forest', snapshot };
        assert.equal((await get(projects)).status, 401);
        assert.deepEqual((await data(get(projects, 'owner', 'other'))).map((entry: { projectId: string }) => entry.projectId), [otherProject]);
        assert.equal((await get(assets, 'owner', 'other')).status, 404);
        assert.equal((await write(save, 'editor', undefined, input)).status, 428);
        assert.equal((await write(save, 'viewer', '0', input)).status, 404);
        assert.equal((await write(save, 'editor', '0', { name: 'Bad', snapshot: { swatches: [null], roles: {} } })).status, 400);
        const created = await write(save, 'editor', '0', input, retry);
        assert.equal(created.status, 201);
        assert.equal(created.headers.get('etag'), '"1"');
        assert.deepEqual(await data(write(save, 'editor', '0', input, retry)), (await created.json()).data);
        assert.equal((await write(save, 'editor', '0', { ...input, name: 'Altered' }, retry)).status, 409);
        assert.equal((await write(save, 'editor', '0', input)).status, 412);
        assert.equal((await get(`${theme}/revisions/1`, 'viewer')).status, 200);
        const exported = await get(`${theme}/revisions/1/export?format=css`, 'viewer');
        assert.equal(exported.headers.get('cache-control'), 'no-store');
        assert.match(await exported.text(), /--tile-text/);
        const preview = await data(get(`${theme}/revisions/1/preview?locale=pt`, 'viewer'));
        assert.equal(preview.source, 'fixture');
        assert.equal(preview.scenes.length, 6);
        assert.equal((await get(`${theme}/revisions/1/preview?mode=live`, 'viewer')).status, 404);
        const privateAsset = await data(get(theme, 'owner'));
        assert.equal((await write(release, 'editor', privateAsset.version, { revision: 1 })).status, 404);
        const cookieWrite = (requestOrigin?: string) => write(release, 'owner', privateAsset.version, { revision: 1 }, operationKey(),
          { headers: { Cookie: identity.cookie('owner'), 'Content-Type': 'application/json', 'Idempotency-Key': operationKey(),
            'If-Match': `"${privateAsset.version}"`, ...(requestOrigin ? { Origin: requestOrigin } : {}) } });
        assert.equal((await cookieWrite()).status, 403);
        assert.equal((await cookieWrite('https://unrelated.test')).status, 403);
        const privateRelease = (await (await cookieWrite(origin)).json()).data;
        const publicUrl = (id: string) => '/api/v1/theme-releases/' + id;
        assert.equal((await get(publicUrl(privateRelease.releaseId))).status, 404);
        assert.equal((await write(release, 'owner', privateRelease.version, { revision: 1, audience: 'public' })).status, 422);
        const key = operationKey(), publicReleaseInput = { revision: 1, audience: 'public', confirmPublic: true };
        const [first, second] = await Promise.all([write(release, 'owner', privateRelease.version, publicReleaseInput, key),
          write(release, 'owner', privateRelease.version, publicReleaseInput, key)]);
        assert.equal(first.status, 201);
        const live = (await first.json()).data;
        assert.deepEqual((await second.json()).data, live);
        assert.equal((await get(publicUrl(live.releaseId))).status, 200);
        assert.equal((await get(publicUrl(live.releaseId) + '/export?format=json')).status, 200);
        const withdrawn = await write(`${release}/${live.releaseId}`, 'owner', live.version);
        assert.equal(withdrawn.status, 200);
        assert.equal((await get(publicUrl(live.releaseId))).status, 404);
        await client.query('UPDATE ck.project_member SET inactive_at=now() WHERE project_id=$1 AND principal_id=$2', [projectId, viewer]);
        assert.equal((await get(`${theme}/revisions/1/preview`, 'viewer')).status, 404);
      });
    } finally { await pool.end(); }
  });
});
