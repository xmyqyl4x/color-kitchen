import { constants, createPublicKey, verify } from 'node:crypto';
import type { ClientBase } from 'pg';
import { findProjectActor } from '../projects/repository.js';

export const sessionCookieName = '__Host-ck_session';
type Claims = Parameters<typeof findProjectActor>[1];
export type VerifyIdentity = (token: string) => Claims | null;
type ProtectedDependencies = { verifyIdentity?: VerifyIdentity;
  withClient<T>(work: (client: ClientBase) => Promise<T>): Promise<T> };
export type { ProtectedDependencies };

function identityKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);
}

export function signedIdentity(config: { issuer: string; audience: string; publicKey: string; now?: () => Date }): VerifyIdentity {
  if (new URL(config.issuer).protocol !== 'https:' || config.issuer.length > 512 || !identityKey(config.audience)) {
    throw new Error('Invalid application identity issuer or audience.');
  }
  const key = createPublicKey(config.publicKey);
  if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
    throw new Error('Identity verification requires an RSA public key of at least 2048 bits.');
  }
  return token => {
    if (token.length > 8192 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return null;
    const [header, claims, signature] = token.split('.') as [string, string, string];
    try {
      const parameters = JSON.parse(Buffer.from(header, 'base64url').toString('utf8'));
      if (parameters?.alg !== 'RS256' || !['at+jwt', 'application/at+jwt'].includes(parameters.typ) || parameters.crit !== undefined ||
          !verify('sha256', Buffer.from(header + '.' + claims), { key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(signature, 'base64url'))) {
        return null;
      }
      const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(claims, 'base64url')));
      const now = Math.floor((config.now?.() ?? new Date()).getTime() / 1000);
      if (body?.iss !== config.issuer || (body.aud !== config.audience &&
          !(Array.isArray(body.aud) && body.aud.every((value: unknown) => typeof value === 'string') && body.aud.includes(config.audience))) ||
          !identityKey(body.sub) || !identityKey(body.org_id) || !Number.isSafeInteger(body.iat) || !Number.isSafeInteger(body.exp) ||
          body.iat > now || body.exp <= now || body.exp - body.iat > 900 ||
          (body.nbf !== undefined && (!Number.isSafeInteger(body.nbf) || body.nbf > now))) return null;
      return { issuer: body.iss, organization: body.org_id, subject: body.sub };
    } catch { return null; }
  };
}

export function identityFromEnvironment(env: NodeJS.ProcessEnv) {
  const { COLOR_KITCHEN_IDENTITY_ISSUER: issuer, COLOR_KITCHEN_IDENTITY_AUDIENCE: audience,
    COLOR_KITCHEN_IDENTITY_PUBLIC_KEY: publicKey } = env;
  if (!issuer && !audience && !publicKey) return undefined;
  if (!issuer || !audience || !publicKey) throw new Error('Configure the application identity issuer, audience, and public key together.');
  return signedIdentity({ issuer, audience, publicKey });
}

export function identifyRequest(request: Request, resolve: VerifyIdentity | undefined) {
  const authorization = request.headers.get('authorization');
  if (authorization !== null) {
    const token = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(authorization)?.[1];
    const claims = token && resolve?.(token);
    return claims ? { claims, credential: 'bearer' as const } : null;
  }
  const cookies = request.headers.get('cookie')?.split(';').map(value => value.trim())
    .filter(value => value.startsWith(sessionCookieName + '='));
  const claims = cookies?.length === 1 && resolve?.(cookies[0]!.slice(sessionCookieName.length + 1));
  return claims ? { claims, credential: 'cookie' as const } : null;
}
