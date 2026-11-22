import { createHash } from 'node:crypto';
import type { Locale } from '../model/locales.js';

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('X-Content-Type-Options', 'nosniff');
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function apiError(status: number, code: string, headers?: HeadersInit) {
  return json({ version: 1, error: { code } }, { status, headers });
}

export function cacheableJson(request: Request, locale: Locale, data: unknown, maxAge = 0) {
  const representation = JSON.stringify({ version: 1, locale, data });
  const tag = '"' + createHash('sha256').update(representation).digest('base64url') + '"';
  const headers = new Headers({
    'Cache-Control': 'public, max-age=' + maxAge + ', must-revalidate',
    'Content-Language': locale, 'Vary': 'Accept-Language', 'ETag': tag,
    'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff',
  });
  const matches = request.headers.get('if-none-match')?.split(',')
    .some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === tag);
  return new Response(matches || request.method === 'HEAD' ? null : representation, { status: matches ? 304 : 200, headers });
}
