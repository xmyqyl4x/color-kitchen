import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { gameReadFamilies, readGamePreview } from '../src/game-preview/adapters.js';
import { gameFixtureProvider } from '../src/game-preview/fixtures.js';
import { createProject } from '../src/projects/repository.js';
import { withMigratedDatabase } from './postgres.js';

const now = new Date('2026-11-22T18:00:00Z');
for (const family of gameReadFamilies) {
  test(family + ' adapter handles allowed, missing, stale, denied and unavailable previews', async () => {
    await withMigratedDatabase(async client => {
      const organizationId = randomUUID(), principalId = randomUUID(), projectId = randomUUID(), outsider = randomUUID();
      const actor = { organizationId, principalId };
      const scope = { organizationId, projectId, gameId: 'fixture-puzzle' };
      const input = { ...scope, family, recordId: 'sample', locale: 'fr' as const };
      await client.query("INSERT INTO ck.project_organization VALUES ($1,'fixture','preview')", [organizationId]);
      await client.query("INSERT INTO ck.project_principal VALUES ($1,$2,'owner'),($1,$3,'outsider')", [organizationId, principalId, outsider]);
      await createProject(client, actor, projectId, 'Preview fixture');
      const fixture = gameFixtureProvider(scope, principalId, now);
      const baseline = (await fixture.read(input, actor))!;
      const override = (values: Partial<typeof baseline>) => ({ source: fixture.source,
        async read() { return { ...baseline, ...values }; } });
      const read = (provider = fixture) => readGamePreview(client, actor, provider, input, now);
      const allowed = await read();
      assert.equal(allowed.status, 'ready');
      if (allowed.status !== 'ready') assert.fail();
      assert.equal(allowed.source, 'fixture');
      assert.deepEqual(await read(override({ data: { ...(baseline.data as object), answer: 'private-fixture',
        email: 'private-fixture', corpus: ['private-fixture'] } })), allowed);
      assert.deepEqual(await read({ source: 'fixture', async read() { return null; } }), { status: 'missing' });
      assert.deepEqual(await read(override({ observedAt: '2026-11-21T18:00:00Z' })), { status: 'stale' });
      assert.deepEqual(await read(override({ data: null })), { status: 'unavailable' });
      assert.deepEqual(await read(override({ projectId: randomUUID() })), { status: 'denied' });
      assert.deepEqual(await read(override({ visibility: 'private' })), { status: 'denied' });
      assert.deepEqual(await read(override({ visibility: 'unpublished' })), { status: 'denied' });
      if (family === 'user' || family === 'session') {
        assert.deepEqual(await read(override({ subjectId: outsider })), { status: 'denied' });
      }
      if (family === 'leaderboard') {
        const rows = (baseline.data as { rows: object[] }).rows.map(row => ({ ...row, subjectId: outsider }));
        assert.deepEqual(await read(override({ data: { rows } })), allowed);
      }
      assert.deepEqual(await readGamePreview(client, { organizationId, principalId: outsider }, fixture, input, now), { status: 'denied' });
      assert.deepEqual(await read({ source: 'fixture', async read() { throw new Error('fixture unavailable'); } }), { status: 'unavailable' });
    });
  });
}
