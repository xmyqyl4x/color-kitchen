import { randomUUID } from 'node:crypto';
import { isLocale } from '../model/locales.js';
import type { ContactKeys } from '../operations/contact-crypto.js';
import { publicSupport } from '../operations/public-support.js';
import { issueCatalogOpen, recordCatalogOpen } from '../operations/usage.js';
import { consentCookie } from './consent-cookie.js';
import type { CatalogHttpDependencies } from './public-catalog.js';
import { fields, readJsonBody, RequestBodyError, sameOrigin } from './request.js';
import { apiError, json } from './response.js';

const consentPath = '/api/v1/consent';
const eventsPath = '/api/v1/events/catalog-open';
const noncePath = eventsPath + '/nonce';
const supportPath = '/api/v1/inquiries/contact';
const advertisingPath = '/api/v1/inquiries/advertising';
const paths = new Set([consentPath, eventsPath, noncePath, supportPath, advertisingPath]);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export function operationsHttp(deps: CatalogHttpDependencies & Readonly<{
  contact?: { keys: ContactKeys; retentionMs: number };
  consentKey?: Uint8Array;
  eventKey?: Uint8Array;
}>) {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!paths.has(path)) return null;
    if (url.search) return apiError(400, 'invalid_query');
    if (!sameOrigin(request)) return apiError(403, 'origin_denied');
    const now = deps.now?.() ?? new Date();
    const cookie = consentCookie(request, deps.consentKey);
    const success = (data: unknown, status = 200, headers?: HeadersInit) => json({ version: 1, data }, { status, headers });
    if (path === consentPath && request.method === 'GET') return success(cookie.read(now));
    if (request.method !== 'POST') return apiError(405, 'method_not_allowed',
      { Allow: path === consentPath ? 'GET, POST' : 'POST' });

    try {
      const value = await readJsonBody(request, path === supportPath || path === advertisingPath ? 76_800 : 1024);
      if (path === consentPath) {
        const input = fields(value, ['advertising', 'analytics']);
        if (typeof input?.advertising !== 'boolean' || typeof input.analytics !== 'boolean') return apiError(400, 'invalid_consent');
        if (!deps.consentKey) return apiError(503, 'consent_unavailable');
        const choice = { advertising: input.advertising, analytics: input.analytics };
        return success(choice, 200, { 'Set-Cookie': cookie.update(choice, now) });
      }
      if (path === noncePath || path === eventsPath) {
        const enabled = deps.measurement === true && cookie.read(now).analytics;
        const input = fields(value, path === noncePath ? ['itemId'] : ['token']);
        if (path === noncePath) {
          const itemId = input?.itemId;
          if (typeof itemId !== 'string' || !uuid.test(itemId)) return apiError(400, 'invalid_event');
          if (!enabled || !deps.eventKey) return apiError(403, 'measurement_disabled');
          const published = await deps.withClient(async client => (await client.query(
            "SELECT 1 FROM ck.catalog_item WHERE item_id = $1 AND kind = 'palette' AND published_rev IS NOT NULL", [itemId])).rowCount);
          if (!published) return apiError(404, 'not_found');
          return success({ token: issueCatalogOpen(deps.eventKey, { eventId: randomUUID(), itemId, issuedAt: now }) });
        }
        const token = input?.token;
        if (typeof token !== 'string' || token.length > 512 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) {
          return apiError(400, 'invalid_event');
        }
        const signingKey = deps.eventKey;
        if (!enabled || !signingKey) return apiError(403, 'measurement_disabled');
        const result = await deps.withClient(client => recordCatalogOpen(client, { signingKey, token, consent: true, now }));
        switch (result) {
          case 'accepted': return success({ status: 'accepted' }, 202);
          case 'conflict': return apiError(409, 'event_conflict');
          case 'expired': return apiError(410, 'event_expired');
          case 'unpublished': return apiError(404, 'not_found');
          default: return apiError(400, 'invalid_event');
        }
      }
      const input = fields(value, ['requestId', 'purpose', 'locale', 'replyEmail', 'message']);
      const requestId = input?.requestId;
      const { purpose, locale, replyEmail, message } = input ?? {};
      if (typeof requestId !== 'string' || !uuid.test(requestId) || !isLocale(locale) ||
          typeof replyEmail !== 'string' || typeof message !== 'string' ||
          (purpose !== 'support' && purpose !== 'privacy' && purpose !== 'accessibility' &&
            purpose !== 'licensing' && purpose !== 'advertising')) return apiError(400, 'invalid_inquiry');
      const contact = deps.contact;
      if (!contact) return apiError(503, 'inquiry_unavailable');
      const result = await deps.withClient(client => publicSupport({ ...contact, client, now: () => now })
        .submit(path === advertisingPath ? 'advertising' : 'contact', { requestId, purpose, locale, replyEmail, message }));
      if (result.status === 'conflict') return apiError(409, 'inquiry_conflict');
      if (result.status === 'expired') return apiError(410, 'inquiry_expired');
      return success(result, 202, { 'Content-Language': locale });
    } catch (cause) {
      if (cause instanceof RequestBodyError) return apiError(cause.status, cause.code,
        cause.status === 413 ? { Connection: 'close' } : undefined);
      if (cause instanceof RangeError && (path === supportPath || path === advertisingPath)) return apiError(400, 'invalid_inquiry');
      return apiError(503, 'operations_unavailable');
    }
  };
}
