# Color Kitchen release rehearsal

The Verify workflow runs the HTTP and Chromium acceptance suite, rehearses an additive migration and restores a synthetic pre-upgrade archive into a separate empty database. Successful runs attach `release-rehearsal.json`, containing the Git commit and tree, worktree cleanliness, PostgreSQL version, migration head and digest, locale and catalog digests, restore duration and CI run ID. The test restores the previous ledger and reads the recovered catalog over HTTP in each language before applying the candidate again. The report identifies a disposable rehearsal and leaves staging promotion pending.

Run `npm run release:rehearse` with the existing loopback `COLOR_KITCHEN_TEST_DATABASE_URL` fixture and matching PostgreSQL command-line tools. If the fixture is a local container, set `COLOR_KITCHEN_TEST_PG_CONTAINER` to its ID. The runner creates and removes only independently named test databases. It does not connect to a shared server or publish a deployment.

## Staging evidence

Phase 1 used a dedicated local Docker network and PostgreSQL volume with synthetic records. The migration identity owns the Color Kitchen schema and ledger. The web runtime reads the published catalog and has the grants required for operational records. The [local staging evidence](release-evidence/p1-40-local.json) identifies the verified roles, catalog and ledger digests, versioned images and independent restoration. Keyboard navigation and Chromium accessibility-tree checks ran in the browser. A spoken screen-reader walkthrough and live vendor checks require their own evidence.

The local decision maps the staging database to the repository-owned `ck` catalog and operational relations and `ck_migrations.applied`. Color Kitchen uses those objects directly in the isolated PostgreSQL volume. The [repository evidence requirements](design-package/docs/Repository_Evidence.md) apply to any future shared or hosted PostgreSQL target. Keep secrets and connection strings out of the evidence.

| Evidence | Owner |
| --- | --- |
| Staging destination, candidate commit and image, previous image, and rollback timings | Release owner |
| Database aliases, installed major, schema head and migration digest, reuse decision and independent restore | PostgreSQL migration owner |
| Published content digest, translated journeys and expected empty/error states | Product and localization owner |
| Keyboard, assistive technology, actual 400% browser zoom and 320 CSS pixel reflow | Accessibility owner |
| Actual artifact readers and synthetic provider requests, ad performance and private-route network trace | Release and privacy reviewers |

Run the acceptance suite against the approved staging origin and record the actual stage-only provider responses. Capture a clean database inventory and approved synthetic backup, release the candidate to staging, and record the behavior of the previous read path against compatible schema. Exercise traffic rollback to the previous image. Restore the stage-only archive into a separate database, check ledger and content, and verify public HTTP reads before treating the independent restore as usable. Preserve the original stage database and any compatible writes. Record timing and the chosen rollback target in the report.

For a hosted release, use `npm run release:gate -- <evidence.json> <expected-commit> <expected-image-digest>` to check its evidence against the candidate and repository ledger. The hosted gate accepts the following fields.

- Root fields `version: 1` and `target: "staging"`.
- `deployment` with `commit`, `image`, `stagingOrigin`, `productionOrigin` and `releaseOwner`.
- `database` with `stagingAlias`, `productionAlias`, `migrationOwner`, `major`, `schemaHead`, `migrationDigest` and an HTTPS `reuseMap` evidence link.
- `content` with a SHA-256 `digest` and the exact locale registry `["en","fr","es","pt","de"]`.
- `rollback` with `previousImage`, a distinct `restoredAlias` and an HTTPS `evidence` link.
- `checks` keyed by the IDs in `src/release/evidence.ts`, each with `result: "pass"` and an HTTPS `evidence` link. Include browser measurements and references to the actual staged provider fixtures.

Review the linked evidence with the named owners. A passing report confirms candidate alignment and evidence completeness. Deployment remains a separate action.
