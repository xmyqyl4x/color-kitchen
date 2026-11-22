import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { withMigratedDatabase } from './postgres.js';

test('operational schema rejects duplicate intake and inconsistent queue and case states', async () => {
  await withMigratedDatabase(async client => {
    const request = randomUUID();
    const insert = `
      INSERT INTO ck.contact_request (request_id, purpose, locale, reply_email_cipher, message_cipher,
        key_id, input_hmac, hmac_key_id, purge_at)
      VALUES ($1, 'licensing', 'de', decode('a1', 'hex'), decode('b2', 'hex'),
        'fixture', decode(repeat('ab', 32), 'hex'), 'fixture', now() + interval '30 days')
    `;
    await client.query(insert, [request]);
    await assert.rejects(client.query(insert, [request]), { code: '23505' });
    await assert.rejects(client.query("UPDATE ck.contact_request SET delivery_state = 'sending'"), { code: '23514' });
    await assert.rejects(client.query("UPDATE ck.contact_request SET state = 'closed'"), { code: '23514' });
    assert.deepEqual((await client.query('SELECT state, delivery_state, attempt_count FROM ck.contact_request')).rows,
      [{ state: 'received', delivery_state: 'queued', attempt_count: 0 }]);
  });
});

test('bounded retention removes expired rows and preserves current evidence', async () => {
  await withMigratedDatabase(async client => {
    const item = randomUUID();
    await client.query("INSERT INTO ck.catalog_item (item_id, kind, slug) VALUES ($1, 'palette', 'fixture')", [item]);
    for (const age of [91, 90]) {
      await client.query(`INSERT INTO ck.usage_day VALUES ($1, date '2026-11-21' - $2::integer, 'open_in_studio', 1)`,
        [item, age]);
    }
    for (const expiry of ['2026-11-20', '2026-11-22']) {
      await client.query(`INSERT INTO ck.usage_receipt VALUES ($1, $2, 'open_in_studio', '2026-11-18', $3)`,
        [randomUUID(), item, expiry]);
    }
    for (const expiry of ['2026-11-16', '2026-11-20', '2026-11-22']) {
      await client.query(`
        INSERT INTO ck.contact_request (request_id, purpose, locale, reply_email_cipher, message_cipher,
          key_id, input_hmac, hmac_key_id, created_at, purge_at)
        VALUES ($1, 'support', 'en', decode('a1', 'hex'), decode('b2', 'hex'), 'fixture',
          decode(repeat('ab', 32), 'hex'), 'fixture', '2026-11-12', $2)
      `, [randomUUID(), expiry]);
    }
    const purge = () => client.query("SELECT * FROM ck.purge_expired_operations('2026-11-21T00:00:00Z', 1)");
    assert.deepEqual((await purge()).rows, [{ contact_count: '1', receipt_count: '1', usage_count: '1' }]);
    assert.deepEqual((await purge()).rows, [{ contact_count: '1', receipt_count: '0', usage_count: '0' }]);
    assert.deepEqual((await purge()).rows, [{ contact_count: '0', receipt_count: '0', usage_count: '0' }]);
    assert.equal((await client.query('SELECT request_id FROM ck.contact_request')).rowCount, 1);
    await assert.rejects(client.query('SELECT * FROM ck.purge_expired_operations(now(), 0)'), { code: '22023' });
  });
});
