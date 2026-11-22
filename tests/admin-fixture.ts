import { randomUUID } from 'node:crypto';
import pg, { type ClientBase } from 'pg';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { createProject } from '../src/projects/repository.js';
import { identityFixture } from './identity-fixture.js';

export async function adminFixture(client: ClientBase, url: string) {
  const identity = identityFixture();
  const organizationId = randomUUID(), editor = randomUUID(), publisher = randomUUID(), owner = randomUUID();
  await client.query("INSERT INTO ck.project_organization VALUES ($1,$2,'test')", [organizationId, identity.issuer]);
  await client.query("INSERT INTO ck.project_principal VALUES ($1,$2,'editor'),($1,$3,'publisher'),($1,$4,'owner')",
    [organizationId, editor, publisher, owner]);
  await client.query("INSERT INTO ck.catalog_staff (organization_id,principal_id,role) VALUES ($1,$2,'editor'),($1,$3,'publisher')",
    [organizationId, editor, publisher]);
  await createProject(client, { organizationId, principalId: owner }, randomUUID(), 'Owner without staff access');
  await seedCatalog(client, sampleCatalog);
  const pool = new pg.Pool({ connectionString: url });
  return { identity, pool, publisher, deps: { verifyIdentity: identity.verifyIdentity, async withClient<T>(work: (client: ClientBase) => Promise<T>) {
    const client = await pool.connect();
    try { return await work(client); } finally { client.release(); }
  } } };
}
