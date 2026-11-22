import { identifyRequest, type VerifyIdentity } from './identity.js';
import { RequestBodyError } from './request.js';
import { apiError, json } from './response.js';

export const apiUuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export class ApiInputError extends Error {
  constructor(readonly status: 400 | 428, readonly code: string) { super(code); }
}

export function apiVersion(value: unknown) {
  return typeof value === 'string' && /^(?:0|[1-9]\d{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n;
}

export function apiRevision(value: unknown) {
  const text = typeof value === 'number' ? String(value) : value;
  return typeof text === 'string' && /^[1-9]\d{0,9}$/.test(text) && Number(text) <= 2147483647 ? Number(text) : null;
}

export function requireMatch(request: Request) {
  const value = request.headers.get('if-match');
  if (value === null) throw new ApiInputError(428, 'precondition_required');
  const match = /^"([0-9]+)"$/.exec(value)?.[1];
  if (!match || !apiVersion(match)) throw new ApiInputError(400, 'invalid_precondition');
  return match;
}

export function etag(version: string | number) { return { ETag: `"${version}"` }; }
export function apiData(data: unknown, status = 200, headers?: HeadersInit) {
  return json({ version: 1, data }, { status, headers });
}

export function authorizeApi(request: Request, verify: VerifyIdentity | undefined) {
  const identity = identifyRequest(request, verify);
  if (!identity) return apiError(401, 'authentication_required', { 'WWW-Authenticate': 'Bearer' });
  const origin = request.headers.get('origin');
  const safe = request.method === 'GET' || request.method === 'HEAD';
  if ((origin !== null || (!safe && identity.credential === 'cookie')) && origin !== new URL(request.url).origin) {
    return apiError(403, 'origin_denied');
  }
  return identity.claims;
}

export function protectedApiError(error: unknown, unavailable: string) {
  if (error instanceof ApiInputError || error instanceof RequestBodyError) {
    return apiError(error.status, error.code, error.status === 413 ? { Connection: 'close' } : undefined);
  }
  if (error instanceof RangeError) return apiError(400, 'invalid_input');
  return apiError(503, unavailable);
}
