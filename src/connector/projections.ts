import type { ClientBase } from 'pg';
import { catalogKinds, type CatalogEntry, type CatalogKind } from '../catalog/repository.js';
import { fields } from '../http/request.js';
import { isLocale, type Locale } from '../model/locales.js';
import type { ReleasedTheme } from '../projects/repository.js';
import { themeRoleKeys, themeSnapshot } from '../projects/snapshot.js';
import { readConnectorProjectTheme, readConnectorPublicTheme, searchConnectorCatalog, type ConnectorPrincipal } from './repository.js';

const cursorPrefix = 'catalog.v1.';
type CatalogSearch = { operation: 'catalog.search'; kind: Exclude<CatalogKind, 'policy'>;
  locale: Locale; query?: string; limit: number; cursor?: string };
type ConnectorRead = CatalogSearch | { operation: 'theme.public'; releaseId: string } |
  { operation: 'theme.project'; projectId: string; assetId: string };
function uuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

export function connectorReadRequest(input: unknown): ConnectorRead | null {
  if (typeof input !== 'object' || input === null || !('operation' in input)) return null;
  if (input.operation === 'theme.public') {
    const record = fields(input, ['operation', 'releaseId']);
    return uuid(record?.releaseId) ? { operation: 'theme.public', releaseId: record.releaseId } : null;
  }
  if (input.operation === 'theme.project') {
    const record = fields(input, ['operation', 'projectId', 'assetId']);
    return uuid(record?.projectId) && uuid(record.assetId)
      ? { operation: 'theme.project', projectId: record.projectId, assetId: record.assetId } : null;
  }
  if (input.operation !== 'catalog.search') return null;
  const record = fields(input, ['operation', 'kind', 'locale', 'query', 'limit', 'cursor']);
  if (!record) return null;
  const { kind, locale, query, limit = 20, cursor } = record;
  if (kind === 'policy' || !catalogKinds.some(value => value === kind) || !isLocale(locale) ||
      (query !== undefined && (typeof query !== 'string' || query.length > 120)) ||
      typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 25) return null;
  let innerCursor: string | undefined;
  if (cursor !== undefined) {
    if (typeof cursor !== 'string' || !cursor.startsWith(cursorPrefix)) return null;
    innerCursor = cursor.slice(cursorPrefix.length);
    if (innerCursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(innerCursor)) return null;
  }
  return { operation: 'catalog.search', kind: kind as CatalogSearch['kind'], locale, query, limit, cursor: innerCursor };
}

function projectCatalogEntry(entry: CatalogEntry) {
  return { itemId: entry.itemId, kind: entry.kind, slug: entry.slug, revision: entry.revision, locale: entry.locale,
    title: entry.title.slice(0, 200), summary: entry.summary.slice(0, 600), licenseId: entry.licenseId.slice(0, 120) };
}

export function projectConnectorRelease(release: ReleasedTheme | null) {
  if (!release || release.schemaVersion !== 1 || !uuid(release.releaseId) ||
      !Number.isSafeInteger(release.revision) || release.revision < 1) return null;
  try {
    const { swatches, roles } = themeSnapshot(release.payload);
    if (!themeRoleKeys.every(role => roles[role])) return null;
    return { releaseId: release.releaseId, revision: release.revision, schemaVersion: release.schemaVersion, swatches, roles };
  } catch { return null; }
}

export async function readConnector(client: ClientBase, input: unknown, principal?: ConnectorPrincipal) {
  const request = connectorReadRequest(input);
  if (!request) return { status: 'invalid-request' } as const;
  if (request.operation === 'catalog.search') {
    try {
      const page = await searchConnectorCatalog(client, request);
      return { status: 'ok', operation: request.operation, data: { items: page.items.map(item => projectCatalogEntry(item.entry)),
        nextCursor: page.nextCursor ? cursorPrefix + page.nextCursor : null } } as const;
    } catch (error) {
      if (error instanceof RangeError) return { status: 'invalid-request' } as const;
      throw error;
    }
  }
  const release = request.operation === 'theme.public' ? await readConnectorPublicTheme(client, request.releaseId) :
    principal ? await readConnectorProjectTheme(client, principal, request) : null;
  const data = projectConnectorRelease(release);
  return data ? { status: 'ok', operation: request.operation, data } as const : { status: 'unavailable' } as const;
}
