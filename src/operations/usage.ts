import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ClientBase } from 'pg';
import { inTransaction } from '../db/transaction.js';

const dayMs = 24 * 60 * 60 * 1000;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const action = 'open_in_studio';

function sign(key: Uint8Array, encoded: string) {
  if (key.length < 32) throw new RangeError('A 32-byte or stronger nonce signing key is required.');
  return createHmac('sha256', key).update(encoded).digest();
}

export function issueCatalogOpen(key: Uint8Array, event: Readonly<{ eventId: string; itemId: string; issuedAt: Date }>) {
  const time = event.issuedAt.getTime();
  if (!uuid.test(event.eventId) || !uuid.test(event.itemId) || !Number.isSafeInteger(time)) {
    throw new RangeError('Invalid catalog event.');
  }
  const encoded = Buffer.from(JSON.stringify([1, event.eventId, event.itemId, action, time])).toString('base64url');
  return encoded + '.' + sign(key, encoded).toString('base64url');
}

function verify(key: Uint8Array, token: string, now: number) {
  if (token.length > 512 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [encoded, signature] = token.split('.') as [string, string];
  if (!timingSafeEqual(sign(key, encoded), Buffer.from(signature, 'base64url'))) return null;
  const claims: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!Array.isArray(claims) || claims.length !== 5) return null;
  const [version, eventId, itemId, name, occurredAt] = claims;
  if (version !== 1 || typeof eventId !== 'string' || typeof itemId !== 'string' || !uuid.test(eventId) ||
      !uuid.test(itemId) || name !== action || !Number.isSafeInteger(occurredAt) || occurredAt > now + 5 * 60_000) return null;
  return {
    eventId: eventId.toLowerCase(), itemId: itemId.toLowerCase(),
    day: new Date(occurredAt).toISOString().slice(0, 10), expiresAt: occurredAt + dayMs,
  };
}

export async function recordCatalogOpen(client: ClientBase, request: Readonly<{
  token: string; signingKey: Uint8Array; consent: boolean; now: Date;
}>) {
  if (!request.consent) return 'disabled';
  const time = request.now.getTime();
  if (!Number.isFinite(time)) throw new RangeError('Invalid event clock.');
  let claim;
  try { claim = verify(request.signingKey, request.token, time); }
  catch (error) { if (error instanceof SyntaxError) return 'invalid'; throw error; }
  if (!claim) return 'invalid';
  if (claim.expiresAt <= time) return 'expired';

  return inTransaction(client, async () => {
    const existingItem = await client.query(`
      SELECT 1 FROM ck.catalog_item WHERE item_id = $1 AND kind = 'palette' AND published_rev IS NOT NULL FOR SHARE
    `, [claim.itemId]);
    if (!existingItem.rowCount) return 'unpublished';
    const receipt = await client.query(`
      INSERT INTO ck.usage_receipt VALUES ($1, $2, 'open_in_studio', $3, $4)
      ON CONFLICT (event_id) DO NOTHING RETURNING event_id
    `, [claim.eventId, claim.itemId, claim.day, new Date(claim.expiresAt + dayMs)]);
    if (!receipt.rowCount) {
      const matched = await client.query(`
        SELECT 1 FROM ck.usage_receipt WHERE event_id = $1 AND item_id = $2 AND occurred_day = $3
          AND action = 'open_in_studio'
      `, [claim.eventId, claim.itemId, claim.day]);
      return matched.rowCount ? 'accepted' : 'conflict';
    }
    await client.query(`
      INSERT INTO ck.usage_day VALUES ($1, $2, 'open_in_studio', 1)
      ON CONFLICT (item_id, day_utc, action) DO UPDATE SET event_count = ck.usage_day.event_count + 1
    `, [claim.itemId, claim.day]);
    return 'accepted';
  });
}
