import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import pg from 'pg';
import { sampleCatalog } from '../src/catalog/sample-data.js';
import { seedCatalog } from '../src/catalog/seed.js';
import { postgresGuideBudget, purgeGuideBudget } from '../src/operations/budget.js';
import { acceptInquiry, claimInquiry, completeInquiry, failInquiry, openInquiryClaim,
  recoverExpiredInquiryLeases } from '../src/operations/contacts.js';
import { issueCatalogOpen, recordCatalogOpen } from '../src/operations/usage.js';
import { withMigratedDatabase } from './postgres.js';

test('concurrent Guide reservations cannot overdraw the shared remaining budget', async () => {
  await withMigratedDatabase(async (first, connectionString) => {
    const second = new pg.Client({ connectionString });
    await second.connect();
    try {
      const now = new Date('2026-01-01T00:00:00Z');
      const request = { bucket: 'service', units: 7, limit: 10, windowSeconds: 60, now } as const;
      const results = await Promise.all([first, second].map(client => postgresGuideBudget(client).reserve(request)));
      assert.equal(results.filter(result => result.accepted).length, 1);
      assert.equal((await first.query('SELECT used FROM ck.guide_budget')).rows[0].used, '7');
      const retryAt = results[0]!.retryAt;
      assert.equal(await purgeGuideBudget(first, retryAt), 1);
      assert.equal((await postgresGuideBudget(first).reserve({ ...request, now: retryAt })).accepted, true);
    } finally { await second.end(); }
  });
});

test('catalog opens are consented, signed, bound to the original UTC date and counted once', async () => {
  await withMigratedDatabase(async client => {
    await seedCatalog(client, sampleCatalog.slice(0, 2));
    const eventId = randomUUID();
    const signingKey = randomBytes(32);
    const issuedAt = new Date('2026-01-01T23:59:00Z');
    const token = issueCatalogOpen(signingKey, { eventId, itemId: sampleCatalog[0].itemId, issuedAt });
    const now = new Date('2026-01-02T00:02:00Z');
    const request = { token, signingKey, now, consent: true };
    assert.equal(await recordCatalogOpen(client, { ...request, consent: false }), 'disabled');
    assert.equal(await recordCatalogOpen(client, { ...request, signingKey: randomBytes(32) }), 'invalid');
    assert.equal(await recordCatalogOpen(client, request), 'accepted');
    assert.equal(await recordCatalogOpen(client, request), 'accepted');
    const wrongItem = issueCatalogOpen(signingKey, { eventId, itemId: sampleCatalog[1].itemId, issuedAt });
    assert.equal(await recordCatalogOpen(client, { ...request, token: wrongItem }), 'conflict');
    assert.equal(await recordCatalogOpen(client, { ...request, now: new Date('2026-01-03T00:00:00Z') }), 'expired');
    assert.deepEqual((await client.query('SELECT day_utc::text AS day, event_count FROM ck.usage_day')).rows,
      [{ day: '2026-01-01', event_count: '1' }]);
  });
});

test('intake replays across key rotation and workers claim and complete an inquiry at most once', async () => {
  await withMigratedDatabase(async (client, connectionString) => {
    const worker = new pg.Client({ connectionString });
    await worker.connect();
    try {
      const makeKey = (id: string) => ({ id, encryptKey: randomBytes(32), hmacKey: randomBytes(32) });
      const first = makeKey('first');
      const rotated = makeKey('rotated');
      const keys = { active: first, resolve: (id: string) => [first, rotated].find(key => key.id === id) };
      const now = new Date('2026-01-01T00:00:00Z');
      const purgeAt = new Date('2026-02-01T00:00:00Z');
      const inquiry = { requestId: randomUUID(), purpose: 'support', locale: 'fr',
        replyEmail: 'Fixture@EXAMPLE.COM', message: 'A sample contact message' } as const;
      assert.equal((await acceptInquiry(client, inquiry, keys, now, purgeAt)).status, 'accepted');
      assert.equal((await acceptInquiry(client, inquiry, { ...keys, active: rotated }, now, purgeAt)).status, 'accepted');
      assert.equal((await acceptInquiry(client, { ...inquiry, message: 'changed' }, keys, now, purgeAt)).status, 'conflict');
      const claims = await Promise.all([client, worker].map(connection => claimInquiry(connection, now)));
      const claimed = claims.filter(claim => claim !== null);
      assert.equal(claimed.length, 1);
      const claim = claimed[0]!;
      assert(!claim.messageCipher.includes(Buffer.from(inquiry.message)));
      assert.equal(openInquiryClaim(claim, keys).replyEmail, 'Fixture@example.com');
      assert.equal(openInquiryClaim(claim, keys).message, inquiry.message);
      assert.equal(await completeInquiry(client, { ...claim, leaseToken: randomUUID() }, null, now), false);
      assert.equal(await completeInquiry(client, claim, 'provider-ref', now), true);
      assert.equal(await completeInquiry(client, claim, 'provider-ref', now), false);
      assert.equal(await claimInquiry(client, now), null);
    } finally { await worker.end(); }
  });
});

test('safe retries keep their provider key and ambiguous expired leases go to review', async () => {
  await withMigratedDatabase(async client => {
    const active = { id: 'fixture', encryptKey: randomBytes(32), hmacKey: randomBytes(32) };
    const keys = { active, resolve: (id: string) => id === active.id ? active : undefined };
    const now = new Date('2026-01-01T00:00:00Z');
    const purgeAt = new Date('2026-02-01T00:00:00Z');
    await acceptInquiry(client, { requestId: randomUUID(), purpose: 'support', locale: 'en',
      replyEmail: 'fixture@example.com', message: 'Fixture' }, keys, now, purgeAt);
    const first = await claimInquiry(client, now);
    assert(first);
    assert.equal(await failInquiry(client, first, { code: 'provider_unavailable', definitelyNotSent: true }, now), 'retry');
    assert.equal(await claimInquiry(client, now), null);
    const second = await claimInquiry(client, new Date('2026-01-01T00:01:00Z'), 30);
    assert(second);
    assert.notEqual(second.leaseToken, first.leaseToken);
    assert.equal(openInquiryClaim(second, keys).providerIdempotencyKey, openInquiryClaim(first, keys).providerIdempotencyKey);
    assert.equal(await completeInquiry(client, first, null, new Date('2026-01-01T00:01:01Z')), false);
    const after = new Date('2026-01-01T00:01:31Z');
    assert.equal(await recoverExpiredInquiryLeases(client, after), 1);
    assert.equal(await claimInquiry(client, after), null);
    assert.equal((await client.query('SELECT delivery_state FROM ck.contact_request')).rows[0].delivery_state, 'needs_review');
  });
});
