import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { advertisingEligibility, createConsentSession } from '../src/operations/consent.js';
import { publicSupport } from '../src/operations/public-support.js';
import { withMigratedDatabase } from './postgres.js';

test('optional processing stays disabled until confirmed and private navigation gets a clean document', async () => {
  let preference: unknown = { advertising: 'yes', analytics: true };
  let healthy = true;
  const session = createConsentSession({
    async read() { if (!healthy) throw new Error('unavailable'); return preference; },
    async update(choice) { preference = choice; },
  });
  const decision = (route: string, viewportWidth = 900, documentHasAdScript = false, approvedProvider = true) =>
    advertisingEligibility({ route, viewportWidth, documentHasAdScript, approvedProvider, consent: session.snapshot() });
  assert.equal(decision('palette-studio').placement, null);
  await session.refresh();
  assert.equal(session.snapshot().analytics, false);
  await session.update({ advertising: true, analytics: false });
  assert.equal(decision('palette-studio').placement, 'reserved-side');
  assert.equal(decision('palettes', 360).placement, 'after-content');
  assert.equal(decision('palettes', 250).placement, null);
  assert.equal(decision('palettes', 800, false, false).placement, null);
  for (const route of ['image-to-palette', 'moodboard', 'color-guide', 'collections', 'exports', 'projects', 'admin', 'unknown']) {
    assert.deepEqual(decision(route, 900, true), { placement: null, navigation: 'clean-document' });
  }
  const outstanding = session.update({ advertising: true, analytics: true });
  const withdrawal = session.withdraw();
  assert.deepEqual(decision('palettes', 900, true), { placement: null, navigation: 'clean-document' });
  await Promise.all([outstanding, withdrawal]);
  assert.deepEqual(preference, { advertising: false, analytics: false });
  healthy = false;
  await session.update({ advertising: true, analytics: true });
  assert.equal(decision('palette-studio').placement, null);
  assert.deepEqual(await createConsentSession().refresh(), { advertising: false, analytics: false });
});

test('a timed-out provider is replayed within its deduplication window using the same key', async () => {
  await withMigratedDatabase(async client => {
    const active = { id: 'test', encryptKey: randomBytes(32), hmacKey: randomBytes(32) };
    let clock = Date.parse('2026-01-01');
    const delivered = new Set<string>();
    let calls = 0;
    let aborts = 0;
    const support = publicSupport({
      client, keys: { active, resolve: () => active }, now: () => new Date(clock), retentionMs: 172_800_000,
      deliveryTimeoutMs: 20,
      provider: {
        deduplicationMs: 300_000,
        async deliver(inquiry, signal) {
          assert.equal(inquiry.locale, 'de');
          assert.equal(inquiry.replyEmail, 'team@example.com');
          delivered.add(inquiry.providerIdempotencyKey);
          if (++calls === 1) return new Promise(() => signal.addEventListener('abort', () => aborts++, { once: true }));
          return { delivered: true, reference: 'fixture-ref' };
        },
      },
    });
    const inquiry = { requestId: randomUUID(), purpose: 'advertising', locale: 'de',
      replyEmail: 'team@EXAMPLE.COM', message: 'Placement question' } as const;
    await assert.rejects(support.submit('contact', inquiry), RangeError);
    const receipt = await support.submit('advertising', inquiry);
    assert.deepEqual(receipt, { status: 'accepted', requestId: inquiry.requestId });
    assert.deepEqual(await support.submit('advertising', inquiry), receipt);
    assert.equal(await support.deliverNext(), 'retry');
    assert.equal(aborts, 1);
    clock += 65_000;
    assert.equal(await support.deliverNext(), 'sent');
    assert.equal(await support.deliverNext(), 'empty');
    assert.equal(delivered.size, 1);
    assert.equal(calls, 2);
    assert.deepEqual(await support.submit('advertising', { ...inquiry, requestId: randomUUID() }).then(r => r.status), 'accepted');
    assert.equal(await support.deliverNext(), 'sent');
  });
});
