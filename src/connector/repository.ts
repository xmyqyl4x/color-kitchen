import type { ClientBase } from 'pg';
import { publicCatalogListing } from '../catalog/public.js';
import type { CatalogKind } from '../catalog/repository.js';
import type { CatalogFilters } from '../catalog/search.js';
import type { Locale } from '../model/locales.js';
import type { ProjectActor, ReleasedTheme } from '../projects/repository.js';

export { readPublicThemeRelease as readConnectorPublicTheme } from '../projects/repository.js';
export type ConnectorPrincipal = ProjectActor & Readonly<{ grantId: string; clientId: string; scopes: readonly string[] }>;

export function searchConnectorCatalog(client: ClientBase, input: {
  kind: Exclude<CatalogKind, 'policy'>; locale: Locale; query?: CatalogFilters['query']; limit?: number; cursor?: string;
}) {
  return publicCatalogListing(client, { kind: input.kind, locale: input.locale, filters: { query: input.query }, now: new Date(),
    limit: input.limit, cursor: input.cursor, measurement: false });
}

export async function readConnectorProjectTheme(client: ClientBase, principal: ConnectorPrincipal, target: {
  projectId: string; assetId: string;
}) {
  if (!principal.scopes.includes('project:read')) return null;
  const { rows: [release] } = await client.query<ReleasedTheme>(`SELECT l.release_id AS "releaseId",r.rev AS revision,
    r.schema_version AS "schemaVersion",r.payload,r.digest
    FROM ck.current_connector_grant g JOIN ck.project p USING (organization_id,project_id)
    JOIN ck.project_member m ON (m.organization_id,m.project_id,m.principal_id)=(g.organization_id,g.project_id,g.actor_id)
    JOIN ck.asset a ON (a.organization_id,a.project_id)=(g.organization_id,g.project_id)
    JOIN ck.asset_release l ON (l.organization_id,l.project_id,l.asset_id)=(a.organization_id,a.project_id,a.asset_id)
    JOIN ck.asset_revision r ON (r.organization_id,r.project_id,r.asset_id,r.rev)=(l.organization_id,l.project_id,l.asset_id,l.rev)
    WHERE g.organization_id=$1 AND g.grant_id=$2 AND g.actor_id=$3 AND g.client_id=$4 AND g.scope='project:read'
      AND g.project_id=$5 AND a.asset_id=$6 AND a.kind='theme'
      AND p.archived_at IS NULL AND m.inactive_at IS NULL AND a.archived_at IS NULL
      AND l.withdrawn_at IS NULL AND l.audience IN ('project','public')`,
    [principal.organizationId, principal.grantId, principal.principalId, principal.clientId, target.projectId, target.assetId]);
  return release ?? null;
}
