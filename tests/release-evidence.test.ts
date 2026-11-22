import assert from 'node:assert/strict';
import { test } from 'node:test';
import { locales } from '../src/model/locales.js';
import { stagingChecks, validateStagingEvidence } from '../src/release/evidence.js';

const sha = (character: string) => 'sha256:' + character.repeat(64);
const candidate = { commit: 'a'.repeat(40), image: sha('b'), schemaHead: '0004', migrationDigest: sha('c') };
const evidence = {
  version: 1, target: 'staging',
  deployment: { ...candidate, stagingOrigin: 'https://staging.example.test/', productionOrigin: 'https://www.example.test/', releaseOwner: 'release-team' },
  database: { stagingAlias: 'fixture-stage', productionAlias: 'fixture-prod', migrationOwner: 'data-team',
    major: 18, schemaHead: '0004', migrationDigest: sha('c'), reuseMap: 'https://runbook.example.test/reuse' },
  content: { digest: sha('d'), locales },
  rollback: { previousImage: sha('e'), restoredAlias: 'fixture-restore', evidence: 'https://runbook.example.test/restore' },
  checks: Object.fromEntries(stagingChecks.map(key => [key, { result: 'pass', evidence: 'https://runbook.example.test/' + key }])),
};

test('evidence must identify the stage, complete candidate, approved ownership and a separate restore', () => {
  assert.deepEqual(validateStagingEvidence(evidence, candidate), []);
  const broken = { ...evidence, target: 'disposable-postgresql',
    deployment: { ...evidence.deployment, stagingOrigin: evidence.deployment.productionOrigin },
    database: { ...evidence.database, migrationOwner: '', stagingAlias: evidence.database.productionAlias },
    rollback: { ...evidence.rollback, restoredAlias: evidence.database.productionAlias } };
  assert.deepEqual(validateStagingEvidence(broken, { ...candidate, image: sha('f') }), [
    'staging evidence version', 'candidate identity', 'staging destination and release owner',
    'database target, ledger, owner and reuse map', 'independent restore and previous image evidence',
  ]);
  const repeatedImage = { ...evidence, rollback: { ...evidence.rollback, previousImage: candidate.image } };
  assert.deepEqual(validateStagingEvidence(repeatedImage, candidate), ['independent restore and previous image evidence']);
});

test('incomplete translations, failed output readers and private ad requests keep promotion gated', () => {
  const broken = { ...evidence, content: { ...evidence.content, locales: ['en', 'fr'] },
    checks: { ...evidence.checks, 'output-readers': { result: 'fail' }, 'private-egress': { result: 'fail' } } };
  assert.deepEqual(validateStagingEvidence(broken, candidate), [
    'content digest and all five locales', 'output-readers', 'private-egress',
  ]);
});
