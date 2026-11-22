import { randomUUID } from 'node:crypto';
import type { ClientBase } from 'pg';
import { isLocale, type Locale } from '../model/locales.js';
import { contactDigest, decryptContact, encryptContact, matchingContactDigest, type ContactKeys } from './contact-crypto.js';

const purposes = ['support', 'accessibility', 'advertising', 'privacy', 'licensing'] as const;
type Purpose = typeof purposes[number];
const retryWindowMs = 24 * 60 * 60 * 1000;
const maxAttempts = 5;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

type Inquiry = Readonly<{
  requestId: string;
  purpose: Purpose;
  locale: Locale;
  replyEmail: string;
  message: string;
}>;

export async function acceptInquiry(client: ClientBase, input: Inquiry, keys: ContactKeys, now: Date, purgeAt: Date) {
  const id = input.requestId.toLowerCase();
  const address = input.replyEmail.trim().normalize('NFC');
  const at = address.lastIndexOf('@');
  const email = address.slice(0, at + 1) + address.slice(at + 1).toLowerCase();
  const message = input.message.trim().normalize('NFC');
  const clock = now.getTime();
  if (!uuid.test(id) || !purposes.includes(input.purpose) || !isLocale(input.locale) ||
      email.length > 254 || !/^[^\s@\x00-\x1f]+@[^\s@\x00-\x1f]+$/.test(email) ||
      !message || message.length > 12_000 || !Number.isFinite(clock) || !Number.isFinite(purgeAt.getTime()) ||
      purgeAt.getTime() < clock + retryWindowMs) {
    throw new RangeError('Invalid inquiry fields or retention deadline.');
  }
  const canonical = [input.purpose, input.locale, email, message];
  const active = keys.active;
  const { rowCount } = await client.query(`
    INSERT INTO ck.contact_request (request_id, purpose, locale, reply_email_cipher, message_cipher,
      key_id, created_at, purge_at, input_hmac, hmac_key_id, next_attempt_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$6,$7)
    ON CONFLICT (request_id) DO NOTHING RETURNING request_id
  `, [id, input.purpose, input.locale, encryptContact(email, active, id, 'replyEmail'),
    encryptContact(message, active, id, 'message'), active.id, now, purgeAt, contactDigest(active, canonical)]);
  const accepted = { status: 'accepted', requestId: id } as const;
  if (rowCount) return accepted;

  const { rows } = await client.query<{ digest: Buffer; keyId: string; createdAt: Date }>(`
    SELECT input_hmac AS digest, hmac_key_id AS "keyId", created_at AS "createdAt"
    FROM ck.contact_request WHERE request_id = $1
  `, [id]);
  const saved = rows[0];
  if (!saved || clock >= saved.createdAt.getTime() + retryWindowMs) return { status: 'expired' } as const;
  const key = keys.resolve(saved.keyId);
  if (!key) throw new Error('The inquiry replay key is unavailable.');
  return matchingContactDigest(saved.digest, key, canonical) ? accepted : { status: 'conflict' } as const;
}

type EncryptedClaim = {
  requestId: string;
  purpose: Purpose;
  locale: Locale;
  emailCipher: Buffer;
  messageCipher: Buffer;
  keyId: string;
  leaseToken: string;
  leaseUntil: Date;
  attempt: number;
};

export async function claimInquiry(client: ClientBase, now: Date, leaseSeconds = 120) {
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 600) {
    throw new RangeError('Invalid inquiry lease duration.');
  }
  const { rows } = await client.query<EncryptedClaim>(`
    WITH due AS (
      SELECT request_id FROM ck.contact_request WHERE delivery_state IN ('queued', 'retry')
        AND next_attempt_at <= $1 AND purge_at > $1 AND attempt_count < $4
      ORDER BY next_attempt_at, request_id LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    UPDATE ck.contact_request AS row SET delivery_state = 'sending', attempt_count = attempt_count + 1,
      lease_token = $2, lease_until = LEAST(purge_at, $1 + make_interval(secs => $3)), next_attempt_at = NULL
    FROM due WHERE row.request_id = due.request_id
    RETURNING row.request_id AS "requestId", purpose, locale, reply_email_cipher AS "emailCipher",
      message_cipher AS "messageCipher", key_id AS "keyId", lease_token AS "leaseToken",
      lease_until AS "leaseUntil", attempt_count AS attempt
  `, [now, randomUUID(), leaseSeconds, maxAttempts]);
  return rows[0] ?? null;
}

export function openInquiryClaim(claim: EncryptedClaim, keys: ContactKeys) {
  const key = keys.resolve(claim.keyId);
  if (!key) throw new Error('The inquiry content key is unavailable.');
  return {
    requestId: claim.requestId, purpose: claim.purpose, locale: claim.locale,
    providerIdempotencyKey: `color-kitchen-contact-${claim.requestId}`,
    replyEmail: decryptContact(claim.emailCipher, key, claim.requestId, 'replyEmail'),
    message: decryptContact(claim.messageCipher, key, claim.requestId, 'message'),
  };
}

type Lease = Pick<EncryptedClaim, 'requestId' | 'leaseToken'>;

export async function completeInquiry(client: ClientBase, lease: Lease, providerRef: string | null, now: Date) {
  if (providerRef && providerRef.length > 240) throw new RangeError('Provider reference is too long.');
  const result = await client.query(`
    UPDATE ck.contact_request SET delivery_state = 'sent', delivered_at = $3, provider_ref = $4,
      lease_token = NULL, lease_until = NULL, last_error_code = NULL
    WHERE request_id = $1 AND lease_token = $2 AND delivery_state = 'sending' AND lease_until > $3
  `, [lease.requestId, lease.leaseToken, now, providerRef]);
  return result.rowCount === 1;
}

export async function failInquiry(client: ClientBase, lease: Lease, failure: Readonly<{
  code: string;
  definitelyNotSent?: boolean;
  retrySafeUntil?: Date;
}>, now: Date) {
  if (!/^[a-z0-9_]{1,64}$/.test(failure.code)) throw new RangeError('Use a bounded, safe delivery error code.');
  const { rows } = await client.query<{ state: 'retry' | 'needs_review' }>(`
    WITH retry AS (
      SELECT request_id, $3::timestamptz + make_interval(mins => (1 << (attempt_count - 1))) AS next_at,
        attempt_count, purge_at
      FROM ck.contact_request WHERE request_id = $1 AND lease_token = $2 AND delivery_state = 'sending'
        AND lease_until > $3 FOR UPDATE
    ), decision AS (
      SELECT request_id, CASE WHEN attempt_count < $7 AND next_at < purge_at
        AND ($5::boolean OR next_at < $6::timestamptz) THEN next_at END AS next_at FROM retry
    )
    UPDATE ck.contact_request AS row SET delivery_state = CASE WHEN decision.next_at IS NULL THEN 'needs_review' ELSE 'retry' END,
      next_attempt_at = decision.next_at, lease_token = NULL, lease_until = NULL, last_error_code = $4
    FROM decision WHERE row.request_id = decision.request_id RETURNING delivery_state AS state
  `, [lease.requestId, lease.leaseToken, now, failure.code, failure.definitelyNotSent ?? false,
    failure.retrySafeUntil ?? null, maxAttempts]);
  return rows[0]?.state ?? 'stale_lease';
}

export async function recoverExpiredInquiryLeases(client: ClientBase, now: Date, max = 100) {
  if (!Number.isInteger(max) || max < 1 || max > 1000) throw new RangeError('Invalid recovery batch size.');
  const result = await client.query(`
    WITH expired AS (
      SELECT request_id FROM ck.contact_request WHERE delivery_state = 'sending' AND lease_until <= $1
      ORDER BY lease_until, request_id LIMIT $2 FOR UPDATE SKIP LOCKED
    )
    UPDATE ck.contact_request AS row SET delivery_state = 'needs_review', lease_token = NULL, lease_until = NULL,
      last_error_code = 'ambiguous_expired_lease'
    FROM expired WHERE row.request_id = expired.request_id
  `, [now, max]);
  return result.rowCount ?? 0;
}
