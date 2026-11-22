import { createHash, randomUUID } from 'node:crypto';
import type { ClientBase } from 'pg';

export type StoredActor = Readonly<{ organizationId: string; principalId: string }>;
type ResourceKind = 'project' | 'theme' | 'catalog';
export type Command = Readonly<{ operationId: string; command: string; kind: ResourceKind; resourceId: string; hash: string }>;

export function valueDigest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function currentOperationId(id: string, now = Date.now()) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) return false;
  const issued = Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
  return issued >= now - 86_400_000 && issued <= now + 300_000;
}

export async function commandReplay<T>(client: ClientBase, actor: StoredActor, command: Command) {
  const { rows: [row] } = await client.query<{ command: string; kind: ResourceKind; resourceId: string; hash: string; result: T }>(
    `SELECT command,resource_kind AS kind,resource_id AS "resourceId",request_hash AS hash,result
     FROM ck.command_receipt WHERE organization_id=$1 AND actor_id=$2 AND operation_id=$3`,
    [actor.organizationId, actor.principalId, command.operationId]);
  if (!row) return null;
  if (row.command !== command.command || row.kind !== command.kind || row.resourceId !== command.resourceId || row.hash !== command.hash) {
    return { conflict: true } as const;
  }
  return { conflict: false, value: row.result } as const;
}

export async function reserveCommand(client: ClientBase, actor: StoredActor, command: Command) {
  const { rowCount } = await client.query(`INSERT INTO ck.command_receipt
    (organization_id,actor_id,operation_id,command,resource_kind,resource_id,request_hash,expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,now()+interval '48 hours') ON CONFLICT DO NOTHING`,
    [actor.organizationId, actor.principalId, command.operationId, command.command, command.kind, command.resourceId, command.hash]);
  return rowCount === 1;
}

export async function completeCommand(client: ClientBase, actor: StoredActor, operationId: string, status: number, result: unknown) {
  const { rowCount } = await client.query(
    'UPDATE ck.command_receipt SET http_status=$4,result=$5 WHERE organization_id=$1 AND actor_id=$2 AND operation_id=$3',
    [actor.organizationId, actor.principalId, operationId, status, JSON.stringify(result)]);
  if (rowCount !== 1) throw new Error('Command receipt disappeared before completion.');
}

export async function recordAudit(client: ClientBase, actor: StoredActor, event: {
  actorKind: 'staff' | 'member'; action: string; kind: ResourceKind; resourceId: string; projectId?: string;
  operationId: string; before?: number | null; after?: number | null;
}) {
  await client.query(`INSERT INTO ck.audit_event
    (event_id,organization_id,actor_id,actor_kind,action,resource_kind,resource_id,project_id,correlation_id,before_rev,after_rev)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [randomUUID(), actor.organizationId, actor.principalId, event.actorKind, event.action, event.kind, event.resourceId,
      event.projectId ?? null, event.operationId, event.before ?? null, event.after ?? null]);
}
