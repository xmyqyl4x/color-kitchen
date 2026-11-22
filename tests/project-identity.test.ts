import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { migrate, migrationFolder, readMigrations } from '../src/db/migrate.js';
import { catalogHttp } from '../src/http/public-catalog.js';
import { locales } from '../src/model/locales.js';
import { withHttp } from './http.js';
import { withTestDatabase } from './postgres.js';

test('project migration preserves public HTTP and prevents cross-organization membership or ownerless commits', async () => {
  await withTestDatabase(async url => {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      const migrations = await readMigrations(fileURLToPath(migrationFolder));
      await migrate(client, migrations.filter(migration => migration.version <= '0004'));
      await seedCatalog(client, sampleCatalog);
      await withHttp(catalogHttp({ withClient: work => work(client) }), async origin => {
        async function published() {
          const content = [];
          for (const locale of locales) {
            const response = await fetch(origin + '/api/v1/catalog/palette/forest-study?locale=' + locale);
            assert.equal(response.status, 200);
            content.push(await response.json());
          }
          return content;
        }
        const before = await published();
        await migrate(client, migrations);
        const [tenant, otherTenant, owner, successor, stranger, project, otherProject] =
          Array.from({ length: 7 }, () => randomUUID()) as [string, string, string, string, string, string, string];
        await client.query(`INSERT INTO ck.project_organization VALUES
          ($1,'https://issuer.example.test','alpha'),($2,'https://issuer.example.test','beta')`, [tenant, otherTenant]);
        await client.query(`INSERT INTO ck.project_principal (organization_id,principal_id,external_subject) VALUES
          ($1,$2,'subject-a'),($1,$3,'subject-b'),($4,$5,'subject-a')`, [tenant, owner, successor, otherTenant, stranger]);
        const create = (id: string) => client.query(
          "INSERT INTO ck.project (project_id,organization_id,name,created_by) VALUES ($1,$2,'Theme fixture',$3)", [id, tenant, owner]);
        const grant = (id: string, principal: string, role: string) => client.query(
          'INSERT INTO ck.project_member (project_id,organization_id,principal_id,role,granted_by) VALUES ($1,$2,$3,$4,$5)',
          [id, tenant, principal, role, owner]);
        await assert.rejects(create(project), { code: '23514' });
        await client.query('BEGIN');
        await create(project);
        await grant(project, owner, 'owner');
        await grant(project, successor, 'editor');
        await create(otherProject);
        await grant(otherProject, owner, 'owner');
        await grant(otherProject, successor, 'viewer');
        await client.query('COMMIT');
        await assert.rejects(grant(project, stranger, 'viewer'), { code: '23503' });
        const activeRole = async (id: string) => (await client.query(
          'SELECT role FROM ck.project_member WHERE project_id=$1 AND principal_id=$2 AND inactive_at IS NULL', [id, successor])).rows[0]?.role;
        assert.equal(await activeRole(project), 'editor');
        assert.equal(await activeRole(otherProject), 'viewer');
        const deactivate = () => client.query(
          'UPDATE ck.project_member SET inactive_at=now() WHERE project_id=$1 AND principal_id=$2', [project, owner]);
        await assert.rejects(deactivate(), { code: '23514' });
        await client.query('BEGIN');
        await deactivate();
        await client.query("UPDATE ck.project_member SET role='owner' WHERE project_id=$1 AND principal_id=$2", [project, successor]);
        await client.query('COMMIT');
        assert.equal(await activeRole(project), 'owner');
        await client.query('UPDATE ck.project_member SET inactive_at=NULL WHERE project_id=$1 AND principal_id=$2', [project, owner]);
        const concurrent = new pg.Client({ connectionString: url });
        await concurrent.connect();
        try {
          await concurrent.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
          await concurrent.query('SELECT project_id FROM ck.project WHERE project_id=$1', [project]);
          await deactivate();
          await assert.rejects(concurrent.query(
            'UPDATE ck.project_member SET inactive_at=now() WHERE project_id=$1 AND principal_id=$2', [project, successor]),
          { code: '40001' });
        } finally { await concurrent.end(); }
        assert.equal(await activeRole(project), 'owner');
        assert.deepEqual(await published(), before);
      });
    } finally { await client.end(); }
  });
});
