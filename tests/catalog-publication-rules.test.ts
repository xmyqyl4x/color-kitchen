import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogStaffAllows, planCatalogPublication, type ReviewedCatalogDraft } from '../src/catalog/publication-rules.js';
import { locales } from '../src/model/locales.js';

const now = new Date('2026-11-22T18:00:00Z');
const draft: ReviewedCatalogDraft = {
  revision: 2, kind: 'policy', itemVersion: '4', editVersion: '9', publishedRevision: 1, sealedAt: null,
  translations: locales.map(locale => ({ locale, title: 'Policy ' + locale, summary: 'Summary ' + locale, body: 'Body ' + locale })),
  metadata: { origin: 'original', attribution: 'Color Kitchen', licenseId: 'fixture', effectiveAt: '2026-11-20T00:00:00Z' },
};
const review = { mode: 'publish' as const, expectedItemVersion: draft.itemVersion, expectedEditVersion: draft.editVersion };

test('staff publication roles and reviewed versions determine eligible transitions', () => {
  assert.equal(catalogStaffAllows('editor', 'edit'), true);
  assert.equal(catalogStaffAllows('editor', 'publish'), false);
  assert.equal(catalogStaffAllows('publisher', 'edit'), false);
  assert.equal(catalogStaffAllows('publisher', 'rollback'), true);
  assert.equal(catalogStaffAllows(null, 'audit'), false);
  const attempt = (value = draft, action = review) => planCatalogPublication('publisher', value, action, now);
  assert.deepEqual(attempt(), { status: 'allowed', review: { decision: 'approved', editVersion: '9' } });
  assert.deepEqual(planCatalogPublication('editor', draft, review, now), { status: 'unavailable' });
  for (const changed of ['translation', 'license']) {
    const edited = { ...draft, editVersion: '10' };
    assert.deepEqual(attempt(edited), { status: 'stale', itemVersion: '4', editVersion: '10' }, changed);
  }
  assert.deepEqual(attempt({ ...draft, publishedRevision: 2 }), { status: 'conflict' });
  const rollback = { ...review, mode: 'rollback' as const };
  assert.equal(planCatalogPublication('publisher', draft, rollback, now).status, 'conflict');
  assert.equal(planCatalogPublication('publisher', { ...draft, sealedAt: now }, rollback, now).status, 'allowed');
});

test('publication requires all five translations, effective policy dates and appropriate provenance', () => {
  const invalid = (value: ReviewedCatalogDraft) => planCatalogPublication('publisher', value, review, now);
  assert.deepEqual(invalid({ ...draft, translations: draft.translations.filter(entry => entry.locale !== 'de') }),
    { status: 'invalid', issue: 'translations', locales: ['de'] });
  assert.deepEqual(invalid({ ...draft, translations: draft.translations.map(entry => entry.locale === 'pt' ? { ...entry, body: '' } : entry) }),
    { status: 'invalid', issue: 'translations', locales: ['pt'] });
  assert.deepEqual(invalid({ ...draft, metadata: { ...draft.metadata, effectiveAt: '2026-11-23T00:00:00Z' } }),
    { status: 'invalid', issue: 'effective-date' });
  assert.deepEqual(invalid({ ...draft, metadata: { ...draft.metadata, origin: 'licensed', sourceUri: 'https://example.test/art' } }),
    { status: 'invalid', issue: 'provenance' });
  assert.equal(invalid({ ...draft, metadata: { ...draft.metadata, origin: 'licensed',
    sourceUri: 'https://example.test/art', licenseUri: 'https://example.test/license', sourceDigest: 'a'.repeat(64) } }).status, 'allowed');
});
