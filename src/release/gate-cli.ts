import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { migrationFolder, readMigrations } from '../db/migrate.js';
import { migrationLedgerDigest, validateStagingEvidence } from './evidence.js';

const [evidencePath, commit, image] = process.argv.slice(2);
if (!evidencePath || !commit || !image) throw new Error('Pass a staging evidence file, expected commit and expected image digest.');
const evidence: unknown = JSON.parse(await readFile(evidencePath, 'utf8'));
const migrations = await readMigrations(fileURLToPath(migrationFolder));
const errors = validateStagingEvidence(evidence, {
  commit, image, schemaHead: migrations.at(-1)!.version, migrationDigest: migrationLedgerDigest(migrations),
});
if (errors.length) {
  console.error('Staging evidence is incomplete or inconsistent.');
  for (const error of errors) console.error('- ' + error);
  process.exitCode = 1;
} else {
  console.log('Staging evidence matches the candidate. Release-owner review is still required.');
}
