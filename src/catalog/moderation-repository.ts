import { randomUUID } from 'node:crypto';
import type { ClientBase } from 'pg';
import { commandReplay, completeCommand, currentOperationId, recordAudit, reserveCommand, valueDigest,
  type Command, type StoredActor } from '../db/command-receipts.js';
import { inTransaction } from '../db/transaction.js';
import { isLocale, type Locale } from '../model/locales.js';
import { publishLocalizedRevision } from './publication.js';
import { catalogKinds, slugPattern, type CatalogKind } from './repository.js';

type StaffRole = 'editor' | 'publisher';
type Translation = { locale: Locale; title: string; summary: string; body: string | null };
type Metadata = { payload: Record<string, unknown>; origin: 'original' | 'licensed'; sourceUri?: string | null;
  sourceVersion?: string | null; sourceDigest?: string | null; licenseId: string; licenseUri?: string | null;
  attribution?: string | null; effectiveAt?: Date | string | null };
type CatalogDraft = { itemId: string; kind: CatalogKind; slug: string; revision: number; editVersion: string; itemVersion: string;
  publishedRevision: number | null; sealedAt: Date | null; missingLocales: Locale[]; translations: Translation[];
  metadata: Metadata; review: { decision: string; editVersion: string } | null };

async function lockStaff(client: ClientBase, actor: StoredActor, role: StaffRole) {
  const { rowCount } = await client.query(`SELECT role FROM ck.catalog_staff WHERE organization_id=$1 AND principal_id=$2
    AND role=$3 AND inactive_at IS NULL FOR SHARE`, [actor.organizationId, actor.principalId, role]);
  return rowCount === 1;
}

async function lockItem(client: ClientBase, itemId: string) {
  const { rows: [item] } = await client.query<{ row_version: string; published_rev: number | null }>(
    'SELECT row_version,published_rev FROM ck.catalog_item WHERE item_id=$1 FOR UPDATE', [itemId]);
  return item;
}

export async function readCatalogDraft(client: ClientBase, actor: StoredActor, itemId: string, revision: number) {
  const { rows: [draft] } = await client.query<CatalogDraft>(`SELECT i.item_id AS "itemId",i.kind,i.slug,r.rev AS revision,
    r.edit_version AS "editVersion",i.row_version AS "itemVersion",i.published_rev AS "publishedRevision",r.sealed_at AS "sealedAt",
    coverage.missing_locales AS "missingLocales",
    jsonb_build_object('payload',r.payload,'origin',r.origin,'sourceUri',r.source_uri,'sourceVersion',r.source_version,
      'sourceDigest',r.source_digest,'licenseId',r.license_id,'licenseUri',r.license_uri,'attribution',r.attribution,
      'effectiveAt',r.effective_at) AS metadata,
    (SELECT jsonb_build_object('decision',review.decision,'editVersion',review.edit_version::text)
      FROM ck.catalog_review review WHERE review.item_id=r.item_id AND review.rev=r.rev
      ORDER BY review.reviewed_at DESC,review.review_id DESC LIMIT 1) AS review,
    coalesce((SELECT jsonb_agg(jsonb_build_object('locale',t.locale,'title',t.title,'summary',t.summary,'body',t.body) ORDER BY t.locale)
      FROM ck.catalog_text t WHERE (t.item_id,t.rev)=(r.item_id,r.rev)),'[]'::jsonb) AS translations
    FROM ck.catalog_item i JOIN ck.catalog_revision r USING (item_id)
    JOIN ck.catalog_translation_coverage coverage USING (item_id,rev)
    WHERE i.item_id=$1 AND r.rev=$2 AND EXISTS (
      SELECT 1 FROM ck.catalog_staff WHERE organization_id=$3 AND principal_id=$4 AND inactive_at IS NULL
    )`, [itemId, revision, actor.organizationId, actor.principalId]);
  return draft ?? null;
}

export async function createCatalogDraft(client: ClientBase, actor: StoredActor, item: { itemId: string; kind: CatalogKind; slug: string },
  metadata: Metadata) {
  if (!catalogKinds.includes(item.kind) || item.slug.length > 100 || !slugPattern.test(item.slug)) throw new RangeError('Invalid catalog identity.');
  return inTransaction(client, async () => {
    if (!await lockStaff(client, actor, 'editor')) return null;
    const inserted = await client.query('INSERT INTO ck.catalog_item (item_id,kind,slug) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [item.itemId, item.kind, item.slug]);
    if (!inserted.rowCount) return null;
    await client.query(`INSERT INTO ck.catalog_revision (item_id,rev,payload,origin,source_uri,source_version,source_digest,
      license_id,license_uri,attribution,effective_at) VALUES ($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [item.itemId, JSON.stringify(metadata.payload), metadata.origin, metadata.sourceUri ?? null, metadata.sourceVersion ?? null,
        metadata.sourceDigest ?? null, metadata.licenseId, metadata.licenseUri ?? null, metadata.attribution ?? null, metadata.effectiveAt ?? null]);
    return readCatalogDraft(client, actor, item.itemId, 1);
  });
}

export async function forkCatalogDraft(client: ClientBase, actor: StoredActor, itemId: string, sourceRevision: number) {
  return inTransaction(client, async () => {
    if (!await lockStaff(client, actor, 'editor') || !await lockItem(client, itemId)) return null;
    const { rows: [copy] } = await client.query<{ rev: number }>(`INSERT INTO ck.catalog_revision
      (item_id,rev,schema_version,payload,origin,source_uri,source_version,source_digest,license_id,license_uri,attribution,effective_at)
      SELECT item_id,(SELECT max(rev)+1 FROM ck.catalog_revision WHERE item_id=$1),schema_version,payload,origin,source_uri,
        source_version,source_digest,license_id,license_uri,attribution,effective_at
      FROM ck.catalog_revision WHERE item_id=$1 AND rev=$2 RETURNING rev`, [itemId, sourceRevision]);
    if (!copy) return null;
    await client.query(`INSERT INTO ck.catalog_text (item_id,rev,locale,title,summary,body)
      SELECT item_id,$3,locale,title,summary,body FROM ck.catalog_text WHERE item_id=$1 AND rev=$2`, [itemId, sourceRevision, copy.rev]);
    await client.query(`INSERT INTO ck.catalog_revision_tag (item_id,rev,tag_id)
      SELECT item_id,$3,tag_id FROM ck.catalog_revision_tag WHERE item_id=$1 AND rev=$2`, [itemId, sourceRevision, copy.rev]);
    return readCatalogDraft(client, actor, itemId, copy.rev);
  });
}

type DraftEdit = { itemId: string; revision: number; expectedEditVersion: string };
async function writeCatalogDraft(client: ClientBase, actor: StoredActor, input: DraftEdit, write: () => Promise<unknown>) {
  return inTransaction(client, async () => {
    if (!await lockStaff(client, actor, 'editor') || !await lockItem(client, input.itemId)) return { status: 'unavailable' } as const;
    const { rows: [draft] } = await client.query<{ edit_version: string; sealed_at: Date | null }>(
      'SELECT edit_version,sealed_at FROM ck.catalog_revision WHERE item_id=$1 AND rev=$2 FOR UPDATE', [input.itemId, input.revision]);
    if (!draft || draft.sealed_at) return { status: 'unavailable' } as const;
    if (draft.edit_version !== input.expectedEditVersion) return { status: 'stale', editVersion: draft.edit_version } as const;
    await write();
    const { rows: [saved] } = await client.query<{ edit_version: string }>(
      'SELECT edit_version FROM ck.catalog_revision WHERE item_id=$1 AND rev=$2', [input.itemId, input.revision]);
    return { status: 'saved', editVersion: saved!.edit_version } as const;
  });
}

export function saveCatalogTranslation(client: ClientBase, actor: StoredActor, input: Translation & DraftEdit) {
  if (!isLocale(input.locale) || !input.title.trim() || !input.summary.trim()) throw new RangeError('Invalid translation.');
  return writeCatalogDraft(client, actor, input, () => client.query(
    `INSERT INTO ck.catalog_text (item_id,rev,locale,title,summary,body) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (item_id,rev,locale) DO UPDATE SET title=excluded.title,summary=excluded.summary,body=excluded.body`,
    [input.itemId, input.revision, input.locale, input.title, input.summary, input.body]));
}

export function saveCatalogMetadata(client: ClientBase, actor: StoredActor, input: DraftEdit, metadata: Metadata) {
  return writeCatalogDraft(client, actor, input, () => client.query(
    `UPDATE ck.catalog_revision SET payload=$3,origin=$4,source_uri=$5,source_version=$6,source_digest=$7,
       license_id=$8,license_uri=$9,attribution=$10,effective_at=$11 WHERE item_id=$1 AND rev=$2`,
    [input.itemId, input.revision, JSON.stringify(metadata.payload), metadata.origin, metadata.sourceUri ?? null,
      metadata.sourceVersion ?? null, metadata.sourceDigest ?? null, metadata.licenseId, metadata.licenseUri ?? null,
      metadata.attribution ?? null, metadata.effectiveAt ?? null]));
}

type Publication = { itemId: string; revision: number; mode: 'publish' | 'rollback'; expectedItemVersion: string;
  expectedEditVersion: string; operationId: string };
type PublicationSuccess = { status: 'published' | 'rolled-back'; version: string; revision: number };
type PublicationResult = PublicationSuccess | { status: 'expired' | 'unavailable' | 'conflict' | 'invalid' } |
  { status: 'stale'; itemVersion: string; editVersion: string };

export async function publishStaffCatalog(client: ClientBase, actor: StoredActor, input: Publication): Promise<PublicationResult> {
  if (!currentOperationId(input.operationId)) return { status: 'expired' };
  const { itemId, revision, mode, operationId, expectedItemVersion, expectedEditVersion } = input;
  const command: Command = { operationId, kind: 'catalog', resourceId: itemId, command: 'catalog.' + mode,
    hash: valueDigest([revision, expectedItemVersion, expectedEditVersion]) };
  try {
    return await inTransaction(client, async () => {
      if (!await lockStaff(client, actor, 'publisher')) return { status: 'unavailable' };
      const item = await lockItem(client, itemId);
      if (!item) return { status: 'unavailable' };
      const replay = await commandReplay<PublicationSuccess>(client, actor, command);
      if (replay) return replay.conflict ? { status: 'conflict' } : replay.value;
      const draft = await readCatalogDraft(client, actor, itemId, revision);
      if (!draft) return { status: 'unavailable' };
      if (draft.itemVersion !== expectedItemVersion || draft.editVersion !== expectedEditVersion) {
        return { status: 'stale', itemVersion: draft.itemVersion, editVersion: draft.editVersion };
      }
      if (revision === item.published_rev || Boolean(draft.sealedAt) !== (mode === 'rollback')) return { status: 'conflict' };
      if (draft.missingLocales.length) return { status: 'invalid' };
      if (!await reserveCommand(client, actor, command)) return { status: 'conflict' };
      await client.query(`INSERT INTO ck.catalog_review (review_id,item_id,rev,edit_version,organization_id,reviewer_id,decision)
        VALUES ($1,$2,$3,$4,$5,$6,'approved')`,
        [randomUUID(), itemId, revision, expectedEditVersion, actor.organizationId, actor.principalId]);
      const version = await publishLocalizedRevision(client, { itemId, revision, itemVersion: expectedItemVersion, editVersion: expectedEditVersion });
      await recordAudit(client, actor, { actorKind: 'staff', kind: 'catalog', action: command.command, resourceId: itemId, operationId,
        before: item.published_rev, after: revision });
      const result: PublicationSuccess = { status: mode === 'rollback' ? 'rolled-back' : 'published', version, revision };
      await completeCommand(client, actor, operationId, 200, result);
      return result;
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23514') return { status: 'invalid' };
    throw error;
  }
}

type AuditEntry = { eventId: string; itemId: string; action: string; occurredAt: string;
  previousRevision: number | null; revision: number | null };
export async function listCatalogAudit(client: ClientBase, actor: StoredActor, options: { itemId?: string; action?: string; limit?: number;
  before?: Pick<AuditEntry, 'occurredAt' | 'eventId'> } = {}) {
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Invalid audit limit.');
  const { rows } = await client.query<AuditEntry>(`SELECT event_id AS "eventId",resource_id AS "itemId",action,
    occurred_at::text AS "occurredAt",before_rev AS "previousRevision",after_rev AS revision FROM ck.audit_event
    WHERE resource_kind='catalog' AND actor_kind='staff' AND ($1::uuid IS NULL OR resource_id=$1)
      AND ($2::text IS NULL OR action=$2) AND ($3::timestamptz IS NULL OR (occurred_at,event_id)<($3,$4::uuid))
      AND EXISTS (SELECT 1 FROM ck.catalog_staff WHERE organization_id=$5 AND principal_id=$6 AND inactive_at IS NULL)
    ORDER BY occurred_at DESC,event_id DESC LIMIT $7`,
    [options.itemId ?? null, options.action ?? null, options.before?.occurredAt ?? null, options.before?.eventId ?? null,
      actor.organizationId, actor.principalId, limit + 1]);
  const entries = rows.slice(0, limit);
  const last = rows.length > limit ? entries.at(-1) : undefined;
  return { entries, next: last ? { occurredAt: last.occurredAt, eventId: last.eventId } : null };
}
