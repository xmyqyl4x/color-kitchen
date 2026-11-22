import { createHash } from 'node:crypto';
import { locales } from '../model/locales.js';

export const stagingChecks = [
  'public-journeys', 'localization', 'output-readers', 'real-http', 'assistive-technology',
  '320px-reflow', '400-percent-browser-zoom', 'approved-provider-fixtures', 'advertising-performance',
  'private-egress', 'migration-upgrade', 'restore-and-rollback',
] as const;

export function migrationLedgerDigest(migrations: readonly { version: string; checksum: string }[]) {
  const ledger = migrations.map(({ version, checksum }) => ({ version, checksum }));
  return 'sha256:' + createHash('sha256').update(JSON.stringify(ledger)).digest('hex');
}

type RecordInput = Record<string, unknown>;
const record = (value: unknown): RecordInput =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RecordInput : {};
const matches = (value: unknown, pattern: RegExp) => typeof value === 'string' && pattern.test(value);
const sha = /^[a-f0-9]{40}$/;
const digest = /^sha256:[a-f0-9]{64}$/;
const alias = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/;
function https(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

export function validateStagingEvidence(input: unknown, candidate: {
  commit: string; image: string; schemaHead: string; migrationDigest: string;
}) {
  const evidence = record(input);
  const deployment = record(evidence.deployment);
  const database = record(evidence.database);
  const content = record(evidence.content);
  const rollback = record(evidence.rollback);
  const checks = record(evidence.checks);
  const errors: string[] = [];
  if (evidence.version !== 1 || evidence.target !== 'staging') errors.push('staging evidence version');
  if (!sha.test(candidate.commit) || !digest.test(candidate.image) ||
      deployment.commit !== candidate.commit || deployment.image !== candidate.image) errors.push('candidate identity');
  if (!https(deployment.stagingOrigin) || !https(deployment.productionOrigin) ||
      new URL(String(deployment.stagingOrigin)).origin === new URL(String(deployment.productionOrigin)).origin ||
      !matches(deployment.releaseOwner, alias)) errors.push('staging destination and release owner');
  if (!matches(database.stagingAlias, alias) || !matches(database.productionAlias, alias) ||
      database.stagingAlias === database.productionAlias || !matches(database.migrationOwner, alias) ||
      !Number.isInteger(database.major) || Number(database.major) < 14 ||
      !matches(database.schemaHead, /^\d{4}$/) || database.schemaHead !== candidate.schemaHead ||
      !digest.test(String(database.migrationDigest ?? '')) || database.migrationDigest !== candidate.migrationDigest ||
      !https(database.reuseMap)) errors.push('database target, ledger, owner and reuse map');
  if (!digest.test(String(content.digest ?? '')) || !Array.isArray(content.locales) ||
      content.locales.length !== locales.length || !locales.every(locale => (content.locales as unknown[]).includes(locale))) {
    errors.push('content digest and all five locales');
  }
  if (!digest.test(String(rollback.previousImage ?? '')) || rollback.previousImage === candidate.image ||
      !matches(rollback.restoredAlias, alias) || rollback.restoredAlias === database.stagingAlias ||
      rollback.restoredAlias === database.productionAlias || !https(rollback.evidence)) errors.push('independent restore and previous image evidence');
  for (const key of stagingChecks) {
    const check = record(checks[key]);
    if (check.result !== 'pass' || !https(check.evidence)) errors.push(key);
  }
  return errors;
}
