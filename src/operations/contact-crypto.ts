import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type ContactKey = Readonly<{ id: string; encryptKey: Uint8Array; hmacKey: Uint8Array }>;
export type ContactKeys = Readonly<{ active: ContactKey; resolve: (id: string) => ContactKey | undefined }>;
type Field = 'replyEmail' | 'message';

function context(id: string, field: Field) {
  return Buffer.from(JSON.stringify([1, id, field]));
}

export function encryptContact(value: string, key: ContactKey, id: string, field: Field) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key.encryptKey, nonce, { authTagLength: 16 });
  cipher.setAAD(context(id, field));
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.of(1), nonce, cipher.getAuthTag(), body]);
}

export function decryptContact(value: Buffer, key: ContactKey, id: string, field: Field) {
  if (value[0] !== 1 || value.length < 30) throw new Error('Unsupported contact ciphertext.');
  const decipher = createDecipheriv('aes-256-gcm', key.encryptKey, value.subarray(1, 13), { authTagLength: 16 });
  decipher.setAAD(context(id, field));
  decipher.setAuthTag(value.subarray(13, 29));
  return Buffer.concat([decipher.update(value.subarray(29)), decipher.final()]).toString('utf8');
}

export function contactDigest(key: ContactKey, parts: readonly string[]) {
  if (key.hmacKey.length < 32) throw new RangeError('A 32-byte or stronger contact HMAC key is required.');
  return createHmac('sha256', key.hmacKey).update(JSON.stringify(parts)).digest();
}

export function matchingContactDigest(saved: Buffer, key: ContactKey, parts: readonly string[]) {
  return timingSafeEqual(saved, contactDigest(key, parts));
}
