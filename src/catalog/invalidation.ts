import { randomUUID } from 'node:crypto';
import type { ClientBase } from 'pg';

type PublicationKey = { itemId: string; version: string };
type Invalidation = PublicationKey & { revision: number; idempotencyKey: string };
export type CatalogInvalidator = (publication: Invalidation) => Promise<void>;

// Catalog JSON revalidates on every read and server-rendered HTML is never cached.
export const revalidateCatalog: CatalogInvalidator = async () => {};

export async function deliverCatalogInvalidation(client: ClientBase, invalidate: CatalogInvalidator,
  target?: PublicationKey) {
  const leaseId = randomUUID();
  const { rows: [job] } = await client.query<PublicationKey & { revision: number }>(`WITH due AS (
      SELECT item_id,item_version FROM ck.catalog_invalidation WHERE finished_at IS NULL AND available_at <= now()
        AND ($1::uuid IS NULL OR (item_id,item_version)=($1,$2::bigint))
      ORDER BY available_at,item_id,item_version LIMIT 1 FOR UPDATE SKIP LOCKED
    ) UPDATE ck.catalog_invalidation j SET lease_id=$3, attempts=j.attempts+1, available_at=now()+interval '1 minute'
    FROM due JOIN ck.catalog_publication p USING (item_id,item_version)
    WHERE (j.item_id,j.item_version)=(due.item_id,due.item_version)
    RETURNING j.item_id AS "itemId",j.item_version AS version,p.revision`,
  [target?.itemId ?? null, target?.version ?? null, leaseId]);
  if (!job) return false;
  let delivered = false;
  try {
    await invalidate({ ...job, idempotencyKey: `${job.itemId}:${job.version}` });
    delivered = true;
  } catch {
    // Keep only an incident timestamp so provider responses cannot enter staff records.
  }
  await client.query(`UPDATE ck.catalog_invalidation SET lease_id=NULL,
      finished_at=CASE WHEN $4 THEN now() ELSE NULL END,
      last_failure_at=CASE WHEN $4 THEN last_failure_at ELSE now() END,
      available_at=now()+make_interval(secs => least(3600, 5 * (2 ^ least(attempts-1,10))))
    WHERE item_id=$1 AND item_version=$2 AND lease_id=$3`, [job.itemId, job.version, leaseId, delivered]);
  return true;
}
