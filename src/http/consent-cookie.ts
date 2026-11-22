import { createHmac, timingSafeEqual } from 'node:crypto';
import { readConsent, type ConsentChoice } from '../operations/consent.js';

const seconds = 90 * 24 * 60 * 60;
const name = 'ck_optional';

function sign(claim: string, key: Uint8Array) {
  return createHmac('sha256', key).update('consent-v1:' + claim).digest();
}

export function consentCookie(request: Request, key?: Uint8Array) {
  if (key && key.length < 32) throw new RangeError('The consent signing key is too short.');
  const secure = new URL(request.url).protocol === 'https:';
  const cookieName = secure ? '__Host-' + name : name;
  const attributes = '; Path=/; HttpOnly; SameSite=Lax' + (secure ? '; Secure' : '');
  return {
    read(now: Date) {
      const header = request.headers.get('cookie') ?? '';
      const tokens = header.length <= 8192 ? header.split(';').map(token => token.trim())
        .filter(token => token.startsWith(cookieName + '=')) : [];
      const match = tokens.length === 1 ? /^([01])([01])\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/
        .exec(tokens[0]!.slice(cookieName.length + 1)) : null;
      if (!key || !match || Number(match[3]) <= Math.floor(now.getTime() / 1000)) return readConsent(null);
      const expected = sign(match[0].slice(0, -44), key);
      if (!timingSafeEqual(expected, Buffer.from(match[4]!, 'base64url'))) return readConsent(null);
      return readConsent({ advertising: match[1] === '1', analytics: match[2] === '1' });
    },
    update(choice: ConsentChoice, now: Date) {
      if (!key) throw new Error('The consent signing key is unavailable.');
      if (!choice.advertising && !choice.analytics) return cookieName + '=; Max-Age=0' + attributes;
      const claim = Number(choice.advertising) + String(Number(choice.analytics)) + '.' + (Math.floor(now.getTime() / 1000) + seconds);
      return cookieName + '=' + claim + '.' + sign(claim, key).toString('base64url') + '; Max-Age=' + seconds + attributes;
    },
  };
}
