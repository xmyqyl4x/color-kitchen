import { randomUUID } from 'node:crypto';
import type { ClientBase } from 'pg';
import { commandReplay, completeCommand, currentOperationId, recordAudit, reserveCommand, valueDigest,
  type Command, type StoredActor } from '../db/command-receipts.js';
import { inTransaction } from '../db/transaction.js';
import { allowsThemeAction, planThemeTransition, type ProjectRole } from './lifecycle.js';
import { themeSnapshot, type ThemeSnapshot } from './snapshot.js';

export type ProjectActor = StoredActor;
export type { ProjectRole } from './lifecycle.js';
type Asset = { assetId: string; name: string; headRevision: number | null; version: string };
type Revision = { revision: number; schemaVersion: number; payload: ThemeSnapshot; digest: string };
export type ReleasedTheme = Revision & { releaseId: string };
export type ThemeRevision = Revision & { basedOn: { assetId: string; revision: number } | null; wasReleased: boolean };
type ReleaseResult = { status: 'released' | 'withdrawn'; version: string; releaseId: string };
type Failure = { status: 'unavailable' | 'conflict' | 'invalid' | 'expired' } | { status: 'stale'; version: string };

const assetColumns = 'a.asset_id AS "assetId", a.name, a.head_rev AS "headRevision", a.row_version AS version';
const revisionColumns = 'r.rev AS revision,r.schema_version AS "schemaVersion",r.payload,r.digest';
function validName(name: string) {
  const value = name.trim();
  if (!value || [...value].length > 120) throw new RangeError('Use a name with 1 to 120 characters.');
  return value;
}

export async function findProjectActor(client: ClientBase, claims: { issuer: string; organization: string; subject: string }) {
  const { rows: [actor] } = await client.query<ProjectActor>(
    `SELECT p.organization_id AS "organizationId",p.principal_id AS "principalId"
     FROM ck.project_principal p JOIN ck.project_organization o USING (organization_id)
     WHERE o.issuer=$1 AND o.external_organization=$2 AND p.external_subject=$3`,
    [claims.issuer, claims.organization, claims.subject]);
  return actor ?? null;
}

export async function createProject(client: ClientBase, actor: ProjectActor, projectId: string, name: string) {
  await inTransaction(client, async () => {
    await client.query('INSERT INTO ck.project (project_id,organization_id,name,created_by) VALUES ($1,$2,$3,$4)',
      [projectId, actor.organizationId, validName(name), actor.principalId]);
    await client.query(`INSERT INTO ck.project_member (project_id,organization_id,principal_id,role,granted_by)
      VALUES ($1,$2,$3,'owner',$3)`, [projectId, actor.organizationId, actor.principalId]);
  });
}

export async function listProjects(client: ClientBase, actor: ProjectActor) {
  const { rows } = await client.query<{ projectId: string; name: string; role: ProjectRole; version: string }>(
    `SELECT p.project_id AS "projectId",p.name,m.role,p.row_version AS version
     FROM ck.project p JOIN ck.project_member m USING (organization_id,project_id)
     WHERE p.organization_id=$1 AND m.principal_id=$2 AND m.inactive_at IS NULL AND p.archived_at IS NULL
     ORDER BY p.name,p.project_id`, [actor.organizationId, actor.principalId]);
  return rows;
}

export async function projectRole(client: ClientBase, actor: ProjectActor, projectId: string) {
  const { rows: [membership] } = await client.query<{ role: ProjectRole }>(
    `SELECT m.role FROM ck.project p JOIN ck.project_member m USING (organization_id,project_id)
     WHERE p.organization_id=$1 AND m.principal_id=$2 AND p.project_id=$3
       AND m.inactive_at IS NULL AND p.archived_at IS NULL`, [actor.organizationId, actor.principalId, projectId]);
  return membership?.role ?? null;
}

export async function listThemeAssets(client: ClientBase, actor: ProjectActor, projectId: string, after?: string, limit = 20) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Invalid asset limit.');
  const { rows } = await client.query<Asset>(
    `SELECT ${assetColumns} FROM ck.asset a JOIN ck.project p USING (organization_id,project_id)
     JOIN ck.project_member m USING (organization_id,project_id)
     WHERE a.organization_id=$1 AND m.principal_id=$2 AND a.project_id=$3 AND m.inactive_at IS NULL
       AND p.archived_at IS NULL AND a.archived_at IS NULL AND a.kind='theme'
       AND ($4::uuid IS NULL OR a.asset_id>$4) ORDER BY a.asset_id LIMIT $5`, [actor.organizationId, actor.principalId, projectId, after ?? null, limit]);
  return rows;
}

export async function readThemeRevision(client: ClientBase, actor: ProjectActor, projectId: string, assetId: string, revision: number) {
  const { rows: [saved] } = await client.query<ThemeRevision>(
    `SELECT ${revisionColumns},
      CASE WHEN r.source_asset_id IS NOT NULL THEN jsonb_build_object('assetId',r.source_asset_id,'revision',r.source_asset_rev) END AS "basedOn",
      EXISTS (SELECT 1 FROM ck.asset_release l WHERE (l.organization_id,l.project_id,l.asset_id,l.rev)
        = (r.organization_id,r.project_id,r.asset_id,r.rev)) AS "wasReleased"
     FROM ck.asset_revision r JOIN ck.asset a USING (organization_id,project_id,asset_id)
     JOIN ck.project p USING (organization_id,project_id) JOIN ck.project_member m USING (organization_id,project_id)
     WHERE r.organization_id=$1 AND m.principal_id=$2 AND r.project_id=$3 AND r.asset_id=$4 AND r.rev=$5
       AND a.kind='theme' AND p.archived_at IS NULL AND m.inactive_at IS NULL`,
    [actor.organizationId, actor.principalId, projectId, assetId, revision]);
  return saved ?? null;
}

async function lockMembership(client: ClientBase, actor: ProjectActor, projectId: string) {
  const { rowCount } = await client.query(
    `SELECT p.project_id FROM ck.project p WHERE p.organization_id=$1 AND p.project_id=$2 AND p.archived_at IS NULL
       AND EXISTS (SELECT 1 FROM ck.project_member m WHERE m.organization_id=p.organization_id
         AND m.project_id=p.project_id AND m.principal_id=$3 AND m.inactive_at IS NULL) FOR UPDATE`,
    [actor.organizationId, projectId, actor.principalId]);
  return rowCount ? projectRole(client, actor, projectId) : null;
}

async function lockTheme(client: ClientBase, organizationId: string, projectId: string, assetId: string) {
  const { rows: [asset] } = await client.query<Asset>(
    `SELECT ${assetColumns} FROM ck.asset a WHERE a.organization_id=$1 AND a.project_id=$2 AND a.asset_id=$3
       AND a.kind='theme' AND a.archived_at IS NULL FOR UPDATE`, [organizationId, projectId, assetId]);
  return asset;
}

type Save = { projectId: string; assetId: string; operationId: string; expectedRevision: number; name: string;
  snapshot: ThemeSnapshot; source?: { itemId: string; revision: number }; basedOn?: { assetId: string; revision: number } };
type SaveResult = { status: 'saved'; revision: number; digest: string } |
  { status: 'unavailable' | 'conflict' } | { status: 'stale'; revision: number };

export async function saveThemeRevision(client: ClientBase, actor: ProjectActor, input: Save): Promise<SaveResult> {
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new RangeError('Invalid expected revision.');
  const { organizationId, principalId } = actor;
  const { projectId, assetId, operationId, expectedRevision } = input;
  const name = validName(input.name), payload = themeSnapshot(input.snapshot), digest = valueDigest(payload);
  const source = input.source ? [input.source.itemId, input.source.revision] as const : [null, null] as const;
  const lineage = input.basedOn ? [input.basedOn.assetId, input.basedOn.revision] as const : [null, null] as const;
  const hash = valueDigest([assetId, principalId, expectedRevision, name, digest, source, ...(input.basedOn ? [lineage] : [])]);
  return inTransaction(client, async () => {
    const role = await lockMembership(client, actor, projectId);
    if (!allowsThemeAction(role, 'edit')) return { status: 'unavailable' };
    const asset = await lockTheme(client, organizationId, projectId, assetId);
    if (asset) {
      const { rows: [replay] } = await client.query<{ rev: number; digest: string; request_hash: string }>(
        `SELECT rev,digest,request_hash FROM ck.asset_revision WHERE organization_id=$1 AND project_id=$2 AND asset_id=$3 AND operation_id=$4`,
        [organizationId, projectId, assetId, operationId]);
      if (replay) return replay.request_hash === hash ? { status: 'saved', revision: replay.rev, digest: replay.digest } : { status: 'conflict' };
      if ((asset.headRevision ?? 0) !== expectedRevision) return { status: 'stale', revision: asset.headRevision ?? 0 };
    } else {
      if (expectedRevision !== 0) return { status: 'unavailable' };
      const inserted = await client.query(`INSERT INTO ck.asset (organization_id,project_id,asset_id,kind,name)
        VALUES ($1,$2,$3,'theme',$4) ON CONFLICT DO NOTHING`, [organizationId, projectId, assetId, name]);
      if (!inserted.rowCount) return { status: 'unavailable' };
    }
    const revision = expectedRevision + 1;
    await client.query(`INSERT INTO ck.asset_revision (organization_id,project_id,asset_id,rev,schema_version,payload,digest,
      author_id,operation_id,request_hash,source_item_id,source_rev,source_asset_id,source_asset_rev)
      VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [organizationId, projectId, assetId, revision, JSON.stringify(payload), digest, principalId, operationId, hash, ...source, ...lineage]);
    await client.query(`UPDATE ck.asset SET head_rev=$4,name=$5,row_version=row_version+1
      WHERE organization_id=$1 AND project_id=$2 AND asset_id=$3`, [organizationId, projectId, assetId, revision, name]);
    const action = !input.basedOn ? 'theme.save' : input.basedOn.assetId === assetId ? 'theme.restore-revision' : 'theme.fork';
    await recordAudit(client, actor, { actorKind: 'member', action, kind: 'theme', resourceId: assetId,
      projectId, operationId, before: expectedRevision || null, after: revision });
    return { status: 'saved', revision, digest };
  });
}

type ReleaseCommand = { projectId: string; assetId: string; operationId: string; expectedVersion: string } &
  ({ type: 'release'; revision: number; audience?: 'project' | 'public'; confirmPublic?: boolean } |
    { type: 'withdraw'; releaseId: string });

export async function changeThemeRelease(client: ClientBase, actor: ProjectActor, input: ReleaseCommand): Promise<ReleaseResult | Failure> {
  const { organizationId, principalId } = actor;
  const { projectId, assetId, operationId, expectedVersion, type } = input;
  const targetReleaseId = input.type === 'withdraw' ? input.releaseId : null;
  const audience = input.type === 'release' ? input.audience ?? 'project' : null;
  const confirm = input.type === 'release' && input.confirmPublic === true;
  const revision = input.type === 'release' ? input.revision : null;
  if (!currentOperationId(operationId)) return { status: 'expired' };
  const command: Command = { operationId, command: 'theme.' + type, kind: 'theme', resourceId: assetId,
    hash: valueDigest([projectId, expectedVersion, targetReleaseId, revision, audience, confirm]) };
  return inTransaction(client, async () => {
    const role = await lockMembership(client, actor, projectId);
    if (!allowsThemeAction(role, type)) return { status: 'unavailable' };
    const asset = await lockTheme(client, organizationId, projectId, assetId);
    if (!asset) return { status: 'unavailable' };
    const replay = await commandReplay<ReleaseResult>(client, actor, command);
    if (replay) return replay.conflict ? { status: 'conflict' } : replay.value;
    if (asset.version !== expectedVersion) return { status: 'stale', version: asset.version };
    const scope = [organizationId, projectId, assetId];
    const { rows: [active] } = await client.query<{ releaseId: string; rev: number }>(
      `SELECT release_id AS "releaseId",rev FROM ck.asset_release
       WHERE organization_id=$1 AND project_id=$2 AND asset_id=$3 AND withdrawn_at IS NULL`, scope);
    const saved = type === 'release' ? (await client.query<{ payload: ThemeSnapshot }>(
      'SELECT payload FROM ck.asset_revision WHERE organization_id=$1 AND project_id=$2 AND asset_id=$3 AND rev=$4',
      [...scope, revision])).rows[0] : undefined;
    const decision = planThemeTransition({ organizationId, projectId, role }, {
      organizationId, projectId, version: asset.version, headRevision: asset.headRevision ?? 0,
      archived: false, activeReleaseId: active?.releaseId ?? null,
    }, input.type === 'release' ? { ...input, snapshot: saved?.payload ?? null } : input);
    if (decision.status !== 'allowed') return decision;
    if (!await reserveCommand(client, actor, command)) return { status: 'conflict' };
    const releaseId = input.type === 'release' ? randomUUID() : input.releaseId;
    if (active) await client.query(`UPDATE ck.asset_release SET withdrawn_at=now(),withdrawn_by=$4
      WHERE organization_id=$1 AND project_id=$2 AND asset_id=$3 AND release_id=$5`, [...scope, principalId, active.releaseId]);
    if (type === 'release') await client.query(`INSERT INTO ck.asset_release
      (organization_id,project_id,asset_id,release_id,rev,audience,released_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [...scope, releaseId, revision, audience, principalId]);
    const { rows: [updated] } = await client.query<{ version: string }>(
      `UPDATE ck.asset SET row_version=row_version+1 WHERE organization_id=$1 AND project_id=$2 AND asset_id=$3
       RETURNING row_version AS version`, scope);
    const result: ReleaseResult = { status: type === 'release' ? 'released' : 'withdrawn', version: updated!.version, releaseId };
    await recordAudit(client, actor, { actorKind: 'member', action: command.command, kind: 'theme', resourceId: assetId,
      projectId, operationId, before: active?.rev, after: revision });
    await completeCommand(client, actor, operationId, type === 'release' ? 201 : 200, result);
    return result;
  });
}

export async function readPublicThemeRelease(client: ClientBase, releaseId: string) {
  const { rows: [release] } = await client.query<ReleasedTheme>(
    `SELECT l.release_id AS "releaseId",${revisionColumns} FROM ck.asset_release l
     JOIN ck.asset_revision r USING (organization_id,project_id,asset_id,rev)
     JOIN ck.asset a USING (organization_id,project_id,asset_id) JOIN ck.project p USING (organization_id,project_id)
     WHERE l.release_id=$1 AND l.audience='public' AND l.withdrawn_at IS NULL
       AND a.kind='theme' AND a.archived_at IS NULL AND p.archived_at IS NULL`, [releaseId]);
  return release ?? null;
}
