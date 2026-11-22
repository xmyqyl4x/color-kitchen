import type { CatalogInvalidator } from '../catalog/invalidation.js';
import { catalogModeration } from '../catalog/moderation.js';
import type { Metadata } from '../catalog/moderation-repository.js';
import { catalogKinds, slugPattern } from '../catalog/repository.js';
import { adminErrorMessage } from '../i18n/admin-errors.js';
import { resolveLocale } from '../i18n/resolve.js';
import { isLocale, type Locale } from '../model/locales.js';
import { findProjectActor } from '../projects/repository.js';
import type { ProtectedDependencies } from './identity.js';
import { apiData, ApiInputError, apiQuery, apiRevision, apiUuid, apiVersion, authorizeApi, etag, requireMatch } from './protected-api.js';
import { fields, readJsonBody, RequestBodyError } from './request.js';
import { json } from './response.js';

export const adminCatalogPath = '/api/v1/admin/catalog';
type Catalog = ReturnType<typeof catalogModeration>;
const versioned = (value: unknown): value is string => apiVersion(value) && value !== '0';
const auditActions = ['catalog.publish', 'catalog.rollback'];
const accepts = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !value.includes('\0');

function catalogResponses(locale: Locale) {
  const headers = (values?: HeadersInit) => {
    const result = new Headers(values);
    result.set('Content-Language', locale);
    result.set('Vary', 'Accept-Language');
    return result;
  };
  return {
    data: (data: unknown, status = 200, version?: string) => apiData(data, status, headers(version ? etag(version) : undefined)),
    error: (status: number, code: string, extra?: object, values?: HeadersInit) =>
      json({ version: 1, error: { code, message: adminErrorMessage(locale, code), ...extra } }, { status, headers: headers(values) }),
  };
}

const metadataKeys = ['payload', 'origin', 'sourceUri', 'sourceVersion', 'sourceDigest', 'licenseId', 'licenseUri', 'attribution', 'effectiveAt'];
function catalogMetadata(value: unknown): Metadata | null {
  const input = fields(value, metadataKeys);
  if (!input) return null;
  const { payload, origin, sourceUri, sourceVersion, sourceDigest, licenseId, licenseUri, attribution, effectiveAt } = input;
  if (typeof payload !== 'object' || !payload || Array.isArray(payload) || Buffer.byteLength(JSON.stringify(payload)) > 60_000 ||
      (origin !== 'original' && origin !== 'licensed') || !accepts(licenseId, 200) || !licenseId.trim() ||
      ![sourceUri, sourceVersion, sourceDigest, licenseUri, attribution, effectiveAt].every(value => value == null || accepts(value, 2048)) ||
      (sourceDigest != null && !/^[a-f0-9]{64}$/.test(String(sourceDigest)))) return null;
  if ((origin === 'original' && !String(attribution ?? '').trim()) || (origin === 'licensed' &&
      (!String(sourceUri ?? '').trim() || !String(licenseUri ?? '').trim() || (!String(sourceVersion ?? '').trim() && !sourceDigest)))) return null;
  if (effectiveAt != null && (typeof effectiveAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(effectiveAt) ||
      !Number.isFinite(Date.parse(effectiveAt)))) return null;
  return { payload: payload as Record<string, unknown>, origin, licenseId, sourceUri: sourceUri as Metadata['sourceUri'],
    sourceVersion: sourceVersion as Metadata['sourceVersion'], sourceDigest: sourceDigest as Metadata['sourceDigest'],
    licenseUri: licenseUri as Metadata['licenseUri'], attribution: attribution as Metadata['attribution'], effectiveAt };
}

type CatalogRoute = { section: 'items' | 'roles' | 'audit' } | { section: 'revisions'; itemId: string } |
  { section: 'draft' | 'comparison' | 'metadata' | 'review' | 'publication'; itemId: string; revision: number } |
  { section: 'translations'; itemId: string; revision: number; language: Locale };

function relativeCatalog(path: string): CatalogRoute | null {
  const [item, revisions, rev, action, language, ...extra] = path.split('/');
  const revision = apiRevision(rev);
  if (extra.length || revisions !== 'revisions' || !item || !apiUuid.test(item) || (rev !== undefined && !revision)) return null;
  const itemId = item.toLowerCase();
  if (!revision) return { section: 'revisions' as const, itemId };
  if (action === 'translations' && isLocale(language)) return { section: 'translations' as const, itemId, revision, language };
  if (language !== undefined || (action !== undefined && action !== 'comparison' && action !== 'metadata' && action !== 'review' && action !== 'publication')) return null;
  return { section: action ?? 'draft' as const, itemId, revision };
}

function readAudit(service: Catalog, query: Map<string, string>, respond: ReturnType<typeof catalogResponses>) {
  const itemId = query.get('itemId'), action = query.get('action'), occurredAt = query.get('beforeTime'), eventId = query.get('beforeId');
  const limit = Number(query.get('limit') ?? '20');
  if ((itemId !== undefined && !apiUuid.test(itemId)) || (action !== undefined && !auditActions.includes(action)) ||
      !/^(?:[1-9]|[1-9][0-9]|100)$/.test(query.get('limit') ?? '20') ||
      (occurredAt === undefined) !== (eventId === undefined) || (occurredAt !== undefined &&
        (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(occurredAt) || !Number.isFinite(Date.parse(occurredAt)) || !apiUuid.test(eventId!)))) {
    return respond.error(400, 'invalid_query');
  }
  return service.audit({ itemId, action, limit, before: occurredAt && eventId ? { occurredAt, eventId } : undefined }).then(respond.data);
}

export function adminCatalogHttp(deps: ProtectedDependencies & { invalidate?: CatalogInvalidator }) {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url), path = url.pathname;
    if (path !== adminCatalogPath && !path.startsWith(adminCatalogPath + '/')) return null;
    const chosen = url.searchParams.get('locale');
    const { locale } = resolveLocale({ selected: chosen, browser: request.headers.get('accept-language') ?? undefined });
    const respond = catalogResponses(locale);
    const relative = path.slice(adminCatalogPath.length + 1);
    const route: CatalogRoute | null = path === adminCatalogPath ? { section: 'items' } : relative === 'roles' || relative === 'audit'
      ? { section: relative } : relativeCatalog(relative);
    if (!route) return respond.error(404, 'not_found');
    const { section } = route;
    const reading = request.method === 'GET' || request.method === 'HEAD';
    const method = section === 'metadata' || section === 'translations' ? 'PUT' : 'POST';
    const canRead = section !== 'metadata' && section !== 'translations' && section !== 'review' && section !== 'publication';
    const canWrite = !canRead || section === 'items' || section === 'revisions';
    if (reading ? !canRead : !canWrite || request.method !== method) {
      return respond.error(405, 'method_not_allowed', undefined, { Allow: canRead ? 'GET, HEAD' + (canWrite ? ', POST' : '') : method });
    }
    const identity = authorizeApi(request, deps.verifyIdentity);
    if (identity instanceof Response) return respond.error(identity.status, identity.status === 401 ? 'authentication_required' : 'origin_denied',
      undefined, identity.status === 401 ? { 'WWW-Authenticate': 'Bearer' } : undefined);
    const keys = reading ? section === 'items' ? ['kind', 'q', 'after'] : section === 'audit' ? ['itemId', 'action', 'limit', 'beforeTime', 'beforeId'] :
      section === 'revisions' ? ['before'] : section === 'comparison' ? ['base'] : [] : [];
    const query = apiQuery(url, ['locale', ...keys]);
    if (!query || (chosen !== null && !isLocale(chosen))) return respond.error(400, 'invalid_query');
    try {
      const match = reading ? null : requireMatch(request);
      const body = reading ? null : await readJsonBody(request, 100_000);
      return await deps.withClient(async client => {
        const actor = await findProjectActor(client, identity);
        if (!actor) return respond.error(403, 'staff_required');
        const service = catalogModeration(client, actor, deps.invalidate);
        const roles = await service.roles();
        if (!roles.length || (!reading && !roles.includes(section === 'review' || section === 'publication' ? 'publisher' : 'editor'))) {
          return respond.error(403, 'staff_required');
        }
        const invalid = () => respond.error(400, 'invalid_input');
        const missing = () => respond.error(404, 'not_found');
        const stale = (version: string, details: object) => respond.error(412, 'stale_revision', details, etag(version));

        if (section === 'roles') return respond.data({ roles });
        if (section === 'audit') return readAudit(service, query, respond);
        if (section === 'items') {
          if (reading) {
            const kind = catalogKinds.find(kind => kind === query.get('kind'));
            const text = query.get('q'), after = query.get('after');
            if ((query.has('kind') && !kind) || (text !== undefined && !accepts(text, 100)) || (after !== undefined && !apiUuid.test(after))) return invalid();
            return respond.data(await service.items({ kind, query: text, after }));
          }
          const input = fields(body, ['itemId', 'kind', 'slug', 'metadata']);
          const kind = catalogKinds.find(kind => kind === input?.kind), metadata = catalogMetadata(input?.metadata);
          const { itemId, slug } = input ?? {};
          if (match !== '0' || !kind || typeof itemId !== 'string' || !apiUuid.test(itemId) || !accepts(slug, 100) || !slugPattern.test(slug) || !metadata ||
              (kind === 'policy' && !['licensing', 'terms', 'privacy', 'cookies'].includes(slug))) return invalid();
          const draft = await service.create({ itemId: itemId.toLowerCase(), kind, slug }, metadata);
          return draft ? respond.data(draft, 201, draft.editVersion) : respond.error(409, 'conflict');
        }
        if (!('itemId' in route)) return missing();
        const { itemId } = route;
        if (section === 'revisions') {
          if (reading) {
            const before = apiRevision(query.get('before'));
            if (query.has('before') && !before) return invalid();
            return respond.data(await service.revisions(itemId, before ?? undefined));
          }
          const revision = apiRevision(fields(body, ['sourceRevision'])?.sourceRevision);
          if (!revision || !versioned(match)) return invalid();
          const result = await service.forkIfCurrent(itemId, revision, match);
          if (result.status === 'stale') return stale(result.editVersion, { editVersion: result.editVersion });
          return result.status === 'created' ? respond.data(result.draft, 201, result.draft.editVersion) : missing();
        }
        const { revision } = route;
        if (section === 'draft') {
          const draft = await service.draft(itemId, revision);
          return draft ? respond.data(draft, 200, draft.editVersion) : missing();
        }
        if (section === 'comparison') {
          const base = apiRevision(query.get('base'));
          if (!base) return invalid();
          const result = await service.compare(itemId, base, revision);
          return result ? respond.data(result) : missing();
        }
        if (!versioned(match)) return invalid();
        if (section === 'translations' || section === 'metadata') {
          const input = { itemId, revision, expectedEditVersion: match };
          const saved = await (async () => {
            if (!('language' in route)) {
              const metadata = catalogMetadata(body);
              return metadata && service.updateMetadata(input, metadata);
            }
            const translation = fields(body, ['title', 'summary', 'body']);
            const { title, summary, body: text } = translation ?? {};
            return accepts(title, 250) && title.trim() && accepts(summary, 2000) && summary.trim() &&
              (text === null || accepts(text, 50_000)) ? service.translate({ ...input, locale: route.language, title, summary, body: text }) : null;
          })();
          if (!saved) return invalid();
          if (saved.status === 'stale') return stale(saved.editVersion, { editVersion: saved.editVersion });
          return saved.status === 'saved' ? respond.data(saved, 200, saved.editVersion) : missing();
        }
        const input = fields(body, ['mode', 'editVersion']);
        const editVersion = input?.editVersion, mode = input?.mode;
        if (!versioned(editVersion) || (mode !== 'publish' && mode !== 'rollback')) return invalid();
        const approval = { itemId, revision, mode, expectedEditVersion: editVersion, expectedItemVersion: match } as const;
        const operationId = request.headers.get('idempotency-key')?.toLowerCase();
        if (section === 'publication' && (!operationId || !apiUuid.test(operationId))) return invalid();
        const decision = section === 'review' ? await service.review(approval) : await service.publish({ ...approval, operationId: operationId! });
        switch (decision.status) {
          case 'allowed': return respond.data(decision);
          case 'published': case 'rolled-back': return respond.data(decision, 200, decision.version);
          case 'stale': return stale(decision.itemVersion, { itemVersion: decision.itemVersion, editVersion: decision.editVersion });
          case 'invalid': return respond.error(422, decision.issue === 'translations' ? 'missing_translations' : decision.issue === 'provenance' ?
            'invalid_provenance' : decision.issue === 'effective-date' ? 'invalid_effective_date' : 'invalid_input', { locales: decision.locales });
          case 'conflict': return respond.error(409, 'conflict');
          case 'expired': return respond.error(410, 'operation_expired');
          default: return missing();
        }
      });
    } catch (cause) {
      if (cause instanceof ApiInputError || cause instanceof RequestBodyError) return respond.error(cause.status, cause.code,
        undefined, cause.status === 413 ? { Connection: 'close' } : undefined);
      if (cause instanceof RangeError || (cause && typeof cause === 'object' && 'code' in cause && ['23514', '22P05', '22008'].includes(String(cause.code)))) {
        return respond.error(400, 'invalid_input');
      }
      return respond.error(503, 'catalog_admin_unavailable');
    }
  };
}
