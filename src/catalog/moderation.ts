import type { ClientBase } from 'pg';
import { valueDigest, type StoredActor } from '../db/command-receipts.js';
import { locales } from '../model/locales.js';
import { deliverCatalogInvalidation, revalidateCatalog, type CatalogInvalidator } from './invalidation.js';
import { catalogStaffRoles, createCatalogDraft, forkCatalogDraft, forkCatalogDraftIfCurrent, listCatalogAudit, publishStaffCatalog, readCatalogDraft,
  saveCatalogMetadata, saveCatalogTranslation, type DraftEdit, type Metadata, type Publication, type Translation } from './moderation-repository.js';
import { planCatalogPublication } from './publication-rules.js';
import type { CatalogKind } from './repository.js';

export function catalogModeration(client: ClientBase, actor: StoredActor, invalidate: CatalogInvalidator = revalidateCatalog) {
  const draft = (itemId: string, revision: number) => readCatalogDraft(client, actor, itemId, revision);
  return {
    roles: () => catalogStaffRoles(client, actor),
    async items(options: { kind?: CatalogKind; query?: string; after?: string } = {}) {
      const { rows } = await client.query<{ itemId: string; kind: CatalogKind; slug: string; itemVersion: string;
        publishedRevision: number | null; latestRevision: number }>(`SELECT i.item_id AS "itemId",kind,slug,row_version AS "itemVersion",
        published_rev AS "publishedRevision",(SELECT max(rev) FROM ck.catalog_revision r WHERE r.item_id=i.item_id) AS "latestRevision"
        FROM ck.catalog_item i WHERE ($3::text IS NULL OR kind::text=$3) AND ($4::text IS NULL OR strpos(slug,lower($4))>0)
        AND ($5::uuid IS NULL OR item_id>$5) AND EXISTS (
          SELECT 1 FROM ck.catalog_staff WHERE organization_id=$1 AND principal_id=$2 AND inactive_at IS NULL
        ) ORDER BY item_id LIMIT 51`, [actor.organizationId, actor.principalId, options.kind ?? null, options.query ?? null, options.after ?? null]);
      return { entries: rows.slice(0, 50), next: rows.length > 50 ? rows[49]!.itemId : null };
    },
    async revisions(itemId: string, before?: number) {
      const { rows } = await client.query<{ revision: number; editVersion: string; sealedAt: Date | null; published: boolean }>(
        `SELECT r.rev AS revision,r.edit_version AS "editVersion",r.sealed_at AS "sealedAt",
        coalesce(r.rev=i.published_rev,false) AS published FROM ck.catalog_revision r JOIN ck.catalog_item i USING (item_id)
        WHERE r.item_id=$3 AND ($4::int IS NULL OR r.rev<$4) AND EXISTS (
          SELECT 1 FROM ck.catalog_staff WHERE organization_id=$1 AND principal_id=$2 AND inactive_at IS NULL
        ) ORDER BY r.rev DESC LIMIT 51`, [actor.organizationId, actor.principalId, itemId, before ?? null]);
      return { entries: rows.slice(0, 50), next: rows.length > 50 ? rows[49]!.revision : null };
    },
    draft,
    create: (item: Parameters<typeof createCatalogDraft>[2], metadata: Metadata) => createCatalogDraft(client, actor, item, metadata),
    fork: (itemId: string, revision: number) => forkCatalogDraft(client, actor, itemId, revision),
    forkIfCurrent: (itemId: string, revision: number, expected: string) => forkCatalogDraftIfCurrent(client, actor, itemId, revision, expected),
    translate: (input: DraftEdit & Translation) => saveCatalogTranslation(client, actor, input),
    updateMetadata: (input: DraftEdit, metadata: Metadata) => saveCatalogMetadata(client, actor, input, metadata),
    async compare(itemId: string, baseRevision: number, targetRevision: number) {
      const base = await draft(itemId, baseRevision);
      const target = await draft(itemId, targetRevision);
      if (!base || !target) return null;
      const translations = locales.flatMap(locale => {
        const before = base.translations.find(entry => entry.locale === locale) ?? null;
        const after = target.translations.find(entry => entry.locale === locale) ?? null;
        return valueDigest(before) === valueDigest(after) ? [] : [{ locale, before, after }];
      });
      const metadata = valueDigest(base.metadata) === valueDigest(target.metadata) ? null : { before: base.metadata, after: target.metadata };
      return { baseRevision, targetRevision, baseEditVersion: base.editVersion, targetEditVersion: target.editVersion, translations, metadata };
    },
    async review(input: Omit<Publication, 'operationId'>) {
      if (!(await catalogStaffRoles(client, actor)).includes('publisher')) return { status: 'unavailable' } as const;
      const target = await draft(input.itemId, input.revision);
      return target ? planCatalogPublication('publisher', target, input, new Date()) : { status: 'unavailable' } as const;
    },
    async publish(input: Publication) {
      const result = await publishStaffCatalog(client, actor, input);
      if (result.status === 'published' || result.status === 'rolled-back') {
        // A committed publication remains successful if a worker cannot reach the cache or the job table.
        await deliverCatalogInvalidation(client, invalidate, { itemId: input.itemId, version: result.version }).catch(() => false);
      }
      return result;
    },
    audit: (options?: Parameters<typeof listCatalogAudit>[2]) => listCatalogAudit(client, actor, options),
  };
}
