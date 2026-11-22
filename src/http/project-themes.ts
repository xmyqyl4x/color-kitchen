import type { ClientBase } from 'pg';
import { isLocale } from '../model/locales.js';
import { findProjectActor, listProjects, listThemeAssets, projectRole, readPublicThemeRelease, readThemeAsset, readThemeRevision,
  type ProjectActor } from '../projects/repository.js';
import { themeSnapshot, type ThemeSnapshot } from '../projects/snapshot.js';
import { developerThemes, exportPublicTheme } from '../projects/workflows.js';
import type { ProtectedDependencies } from './identity.js';
import { apiData, apiRevision, apiUuid, authorizeApi, etag, protectedApiError, requireMatch } from './protected-api.js';
import { fields, readJsonBody } from './request.js';
import { apiError, json } from './response.js';

const projectsPath = '/api/v1/projects';
const releasesPath = '/api/v1/theme-releases';
type Target = { projectId: string; assetId: string };
const missing = () => apiError(404, 'not_found');
const invalid = () => apiError(400, 'invalid_input');
const method = (allow: string) => apiError(405, 'method_not_allowed', { Allow: allow });
const read = (request: Request) => request.method === 'GET' || request.method === 'HEAD';

function queryFor(url: URL, keys: readonly string[]) {
  const query = new Map<string, string>();
  for (const [key, value] of url.searchParams) {
    if (!keys.includes(key) || query.has(key)) return null;
    query.set(key, value);
  }
  return query;
}

function exportResponse(output: Awaited<ReturnType<typeof exportPublicTheme>>) {
  if (!output) return missing();
  return new Response(output.body, { headers: { 'Content-Type': output.mediaType + '; charset=utf-8',
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } });
}

function changeResponse(result: { status: string; revision?: number; version?: string }, status: number) {
  const version = result.version ?? result.revision;
  switch (result.status) {
    case 'saved': case 'released': case 'withdrawn': return apiData(result, status, etag(version!));
    case 'stale': return json({ version: 1, error: { code: 'stale_revision', current: version } }, { status: 412, headers: etag(version!) });
    case 'conflict': return apiError(409, 'theme_conflict');
    case 'invalid': return apiError(422, 'invalid_transition');
    case 'expired': return apiError(410, 'operation_expired');
    default: return missing();
  }
}

async function readAsset(client: ClientBase, actor: ProjectActor, target: Target, tail: string[], url: URL) {
  const { projectId, assetId } = target;
  const [resource, identifier, child] = tail;
  if (tail.length === 0 && !url.search) {
    const asset = await readThemeAsset(client, actor, projectId, assetId);
    return asset ? apiData(asset, 200, etag(asset.version)) : missing();
  }
  if (resource !== 'revisions' || tail.length > 3) return missing();
  const workflows = developerThemes(client, actor);
  if (identifier === 'compare' && tail.length === 2) {
    const query = queryFor(url, ['before', 'after']);
    const before = apiRevision(query?.get('before')), after = apiRevision(query?.get('after'));
    if (!before || !after) return invalid();
    const comparison = await workflows.compare({ ...target, before, after });
    return comparison ? apiData(comparison) : missing();
  }
  const revision = apiRevision(identifier);
  if (!revision) return missing();
  switch (child) {
    case undefined: {
      if (url.search) return invalid();
      const saved = await readThemeRevision(client, actor, projectId, assetId, revision);
      return saved ? apiData(saved, 200, etag(saved.revision)) : missing();
    }
    case 'export': {
      const format = queryFor(url, ['format'])?.get('format');
      return format === 'json' || format === 'css' ? exportResponse(await workflows.exportRevision({ ...target, revision, format })) : invalid();
    }
    case 'preview': {
      const query = queryFor(url, ['locale', 'mode']);
      const locale = query?.get('locale') ?? 'en', mode = query?.get('mode') ?? 'fixture';
      if (!query || !isLocale(locale) || (mode !== 'live' && mode !== 'fixture')) return invalid();
      const preview = await workflows.preview({ ...target, revision, locale, mode });
      return preview.status === 'ready' ? apiData(preview, 200, { 'Content-Language': locale }) : missing();
    }
    default: return missing();
  }
}

async function writeAsset(client: ClientBase, actor: ProjectActor, target: Target, tail: string[], request: Request, body: unknown) {
  const [resource, identifier] = tail;
  const saving = request.method === 'POST' && resource === 'revisions' && tail.length === 1;
  const releasing = request.method === 'POST' && resource === 'releases' && tail.length === 1;
  const withdrawing = request.method === 'DELETE' && resource === 'releases' && tail.length === 2 && apiUuid.test(identifier!);
  if (!saving && !releasing && !withdrawing) return method('GET, HEAD, POST, DELETE');
  if (new URL(request.url).search) return invalid();
  const expectedVersion = requireMatch(request);
  const operationId = request.headers.get('idempotency-key')?.toLowerCase();
  if (!operationId || !apiUuid.test(operationId)) return invalid();
  const workflows = developerThemes(client, actor);
  if (withdrawing) return changeResponse(await workflows.withdraw({ ...target, expectedVersion, operationId, releaseId: identifier!.toLowerCase() }), 200);
  if (releasing) {
    const input = fields(body, ['revision', 'audience', 'confirmPublic']);
    const revision = apiRevision(input?.revision), audience = input?.audience, confirmPublic = input?.confirmPublic;
    if (!revision || (audience !== undefined && audience !== 'project' && audience !== 'public') ||
        (confirmPublic !== undefined && typeof confirmPublic !== 'boolean')) return invalid();
    return changeResponse(await workflows.release({ ...target, expectedVersion, operationId, revision, audience, confirmPublic }), 201);
  }
  const expectedRevision = expectedVersion === '0' ? 0 : apiRevision(expectedVersion);
  const input = fields(body, ['name', 'snapshot', 'sourceAssetId', 'sourceRevision']);
  const { name, snapshot, sourceAssetId, sourceRevision } = input ?? {};
  if (expectedRevision === null || typeof name !== 'string' || name.includes('\0')) return invalid();
  const command = { ...target, name, operationId, expectedRevision };
  if (sourceRevision === undefined && sourceAssetId === undefined) {
    const payload = themeSnapshot(snapshot as ThemeSnapshot);
    return changeResponse(await workflows.edit({ ...command, snapshot: payload }), 201);
  }
  const revision = apiRevision(sourceRevision);
  if (!revision || snapshot !== undefined) return invalid();
  if (sourceAssetId === undefined && expectedRevision > 0 && revision <= expectedRevision) {
    return changeResponse(await workflows.restore({ ...command, sourceRevision: revision }), 201);
  }
  if (typeof sourceAssetId !== 'string' || !apiUuid.test(sourceAssetId) || sourceAssetId.toLowerCase() === target.assetId || expectedRevision !== 0) return invalid();
  return changeResponse(await workflows.fork({ ...command, sourceAssetId: sourceAssetId.toLowerCase(), sourceRevision: revision }), 201);
}

export function projectThemesHttp(deps: ProtectedDependencies) {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    const path = url.pathname;
    const publicPath = path.startsWith(releasesPath + '/');
    if (!publicPath && path !== projectsPath && !path.startsWith(projectsPath + '/')) return null;
    try {
      if (publicPath) {
        if (!read(request)) return method('GET, HEAD');
        const [id, child, ...rest] = path.slice(releasesPath.length + 1).split('/');
        if (!id || !apiUuid.test(id) || rest.length) return missing();
        if (child === 'export') {
          const format = queryFor(url, ['format'])?.get('format');
          return format === 'json' || format === 'css' ? exportResponse(await deps.withClient(client => exportPublicTheme(client, id, format))) : invalid();
        }
        if (child !== undefined || url.search) return missing();
        const release = await deps.withClient(client => readPublicThemeRelease(client, id));
        return release ? apiData(release) : missing();
      }
      const claims = authorizeApi(request, deps.verifyIdentity);
      if (claims instanceof Response) return claims;
      const [project, scope, asset, ...tail] = path.slice(projectsPath.length + 1).split('/');
      const body = request.method === 'POST' && project && apiUuid.test(project) && scope === 'assets' && asset && apiUuid.test(asset) &&
        tail.length === 1 && (tail[0] === 'revisions' || tail[0] === 'releases') && !url.search
        ? await readJsonBody(request, 24_576) : undefined;
      return await deps.withClient(async client => {
        const actor = await findProjectActor(client, claims);
        if (!actor) return missing();
        if (path === projectsPath) return !read(request) ? method('GET, HEAD') : url.search ? invalid() : apiData(await listProjects(client, actor));
        if (!project || !apiUuid.test(project) || scope !== 'assets') return missing();
        const projectId = project.toLowerCase();
        if (asset === undefined) {
          if (!read(request)) return method('GET, HEAD');
          if (!await projectRole(client, actor, projectId)) return missing();
          const query = queryFor(url, ['after', 'limit']);
          const after = query?.get('after'), limit = query?.get('limit') ?? '20';
          if (!query || (after !== undefined && !apiUuid.test(after)) || !/^(?:[1-9]|[1-9][0-9])$/.test(limit)) return invalid();
          const rows = await listThemeAssets(client, actor, projectId, after, Number(limit) + 1);
          const entries = rows.slice(0, Number(limit));
          return apiData({ entries, next: rows.length > entries.length ? entries.at(-1)!.assetId : null });
        }
        if (!apiUuid.test(asset)) return missing();
        const target = { projectId, assetId: asset.toLowerCase() };
        return read(request) ? await readAsset(client, actor, target, tail, url) : await writeAsset(client, actor, target, tail, request, body);
      });
    } catch (error) { return protectedApiError(error, 'themes_unavailable'); }
  };
}
