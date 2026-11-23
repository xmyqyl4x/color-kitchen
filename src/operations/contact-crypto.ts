import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type ContactKey = Readonly<{ id: string; encryptKey: Uint8Array; hmacKey: Uint8Array }>;
export type ContactKeys = Readonly<{ active: ContactKey; resolve: (id: string) => ContactKey | undefined }>;
type Field = 'replyEmail' | 'message';

function contactKey(id: string, fields: { encryptKey?: unknown; hmacKey?: unknown } | null, setting: string): ContactKey {
  const { encryptKey, hmacKey } = fields ?? {};
  const hex = /^[0-9a-f]{64}$/i;
  if (!/^[a-z0-9_-]{1,48}$/i.test(id) || typeof encryptKey !== 'string' || !hex.test(encryptKey) ||
      typeof hmacKey !== 'string' || !hex.test(hmacKey)) {
    throw new Error('Configure a valid key ID and two 32-byte hexadecimal keys for ' + setting + '.');
  }
  return { id, encryptKey: Buffer.from(encryptKey, 'hex'), hmacKey: Buffer.from(hmacKey, 'hex') };
}

export function contactKeysFromEnvironment(env: NodeJS.ProcessEnv): ContactKeys | undefined {
  const { COLOR_KITCHEN_CONTACT_ENCRYPT_KEY: encryptKey, COLOR_KITCHEN_CONTACT_HMAC_KEY: hmacKey,
    COLOR_KITCHEN_CONTACT_PREVIOUS_KEYS: previous } = env;
  if (encryptKey === undefined && hmacKey === undefined && previous === undefined) return undefined;
  const active = contactKey(env.COLOR_KITCHEN_CONTACT_KEY_ID ?? 'contact-v1', { encryptKey, hmacKey }, 'active inquiry encryption');
  const keys = new Map([[active.id, active]]);
  if (previous !== undefined) {
    const setting = 'COLOR_KITCHEN_CONTACT_PREVIOUS_KEYS';
    let entries: unknown;
    try { entries = JSON.parse(previous); } catch { throw new Error('Set ' + setting + ' to a JSON object keyed by retained key ID.'); }
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
      throw new Error('Set ' + setting + ' to a JSON object keyed by retained key ID.');
    }
    for (const [id, fields] of Object.entries(entries)) {
      if (keys.has(id)) throw new Error('Use a new active inquiry key ID when retaining older keys.');
      keys.set(id, contactKey(id, fields, setting));
    }
  }
  return { active, resolve: id => keys.get(id) };
}

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
