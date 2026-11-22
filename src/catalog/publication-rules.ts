import { locales, type Locale } from '../model/locales.js';
import type { CatalogKind } from './repository.js';

export type CatalogStaffRole = 'editor' | 'publisher';
type StaffAction = 'read' | 'edit' | 'review' | 'publish' | 'rollback' | 'audit';
const actions: Record<CatalogStaffRole, readonly StaffAction[]> = {
  editor: ['read', 'edit', 'audit'],
  publisher: ['read', 'review', 'publish', 'rollback', 'audit'],
};
export function catalogStaffAllows(role: CatalogStaffRole | null, action: StaffAction) {
  return role !== null && actions[role].includes(action);
}

export type ReviewedCatalogDraft = Readonly<{
  revision: number; kind: CatalogKind; itemVersion: string; editVersion: string; publishedRevision: number | null; sealedAt: Date | null;
  translations: readonly { locale: Locale; title: string; summary: string; body: string | null }[];
  metadata: { origin: 'original' | 'licensed'; licenseId: string; attribution?: string | null; sourceUri?: string | null;
    sourceVersion?: string | null; sourceDigest?: string | null; licenseUri?: string | null; effectiveAt?: string | Date | null };
}>;
export type PublicationIssue = 'translations' | 'provenance' | 'effective-date';
type Decision = { status: 'allowed'; review: { decision: 'approved'; editVersion: string } } |
  { status: 'unavailable' | 'conflict' } | { status: 'stale'; itemVersion: string; editVersion: string } |
  { status: 'invalid'; issue: PublicationIssue; locales?: Locale[] };

export function planCatalogPublication(role: CatalogStaffRole | null, draft: ReviewedCatalogDraft, review: {
  mode: 'publish' | 'rollback'; expectedItemVersion: string; expectedEditVersion: string;
}, now: Date): Decision {
  if (!catalogStaffAllows(role, review.mode)) return { status: 'unavailable' };
  if (draft.itemVersion !== review.expectedItemVersion || draft.editVersion !== review.expectedEditVersion) {
    return { status: 'stale', itemVersion: draft.itemVersion, editVersion: draft.editVersion };
  }
  if (draft.publishedRevision === draft.revision || Boolean(draft.sealedAt) !== (review.mode === 'rollback')) {
    return { status: 'conflict' };
  }
  const policy = draft.kind === 'policy';
  const translations = new Map(draft.translations.map(entry => [entry.locale, entry]));
  const missing = locales.filter(locale => {
    const entry = translations.get(locale);
    return !entry?.title.trim() || !entry.summary.trim() || (policy && !entry.body?.trim());
  });
  if (missing.length || draft.translations.length !== locales.length) return { status: 'invalid', issue: 'translations', locales: missing };
  const metadata = draft.metadata;
  if (policy) {
    const effective = metadata.effectiveAt instanceof Date ? metadata.effectiveAt.getTime() : Date.parse(metadata.effectiveAt ?? '');
    if (!Number.isFinite(effective) || effective > now.getTime()) return { status: 'invalid', issue: 'effective-date' };
  }
  const digest = metadata.sourceDigest;
  if (!metadata.licenseId.trim() || (digest != null && !/^[a-f0-9]{64}$/.test(digest)) ||
      (metadata.origin === 'original' && !metadata.attribution?.trim()) ||
      (metadata.origin === 'licensed' && (!metadata.sourceUri?.trim() || !metadata.licenseUri?.trim() ||
        (!metadata.sourceVersion?.trim() && !digest)))) return { status: 'invalid', issue: 'provenance' };
  return { status: 'allowed', review: { decision: 'approved', editVersion: draft.editVersion } };
}
