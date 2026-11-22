import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { sessionCookieName, signedIdentity } from '../src/http/identity.js';

export function identityFixture() {
  const issuer = 'https://identity.color-kitchen.test';
  const audience = 'color-kitchen-app';
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const config = { issuer, audience, publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
  function token(subject: string, organization = 'test', claims: Record<string, unknown> = {}, typ = 'at+jwt') {
    const segment = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const source = segment({ alg: 'RS256', typ }) + '.' + segment({ iss: issuer, aud: audience, org_id: organization,
      sub: subject, iat: now, exp: now + 180, ...claims });
    return source + '.' + sign('sha256', Buffer.from(source), privateKey).toString('base64url');
  }
  return { issuer, config, verifyIdentity: signedIdentity(config), token,
    bearer: (subject: string, organization?: string) => 'Bearer ' + token(subject, organization),
    cookie: (subject: string, organization?: string) => sessionCookieName + '=' + token(subject, organization) };
}

export function operationKey() {
  const timestamp = Date.now().toString(16).padStart(12, '0');
  return timestamp.slice(0, 8) + '-' + timestamp.slice(8) + '-7' + randomUUID().slice(15);
}
