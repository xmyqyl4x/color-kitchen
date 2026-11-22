# PostgreSQL development and recovery

The checked-in migrations target the disposable PostgreSQL 18 fixture. The shared PostgreSQL destination, owner, grants and prior migration history are tracked in the [design review](design-package/REVIEW.md). Verify that inventory with the owning team before applying shared-system changes.

## Migration behavior

Number new SQL files under `db/migrations/` in ascending order. Leave applied files immutable. The runner compares the existing ledger against the local migration prefix using version, filename and SHA-256 checksum, then applies pending files under a transaction and a PostgreSQL advisory lock. Use schema-qualified SQL and transactional statements. Generate UUIDs in the application and use `timestamptz` for instants. The migration identity owns DDL and its ledger. Future application roles get only the required object grants.

## Restore rehearsal

1. Capture the development connection, server version and ledger head before changing state.
2. With a configured local PostgreSQL service, create a custom-format dump using `pg_dump --dbname=service=ck_dev --format=custom --file=.ck-local/ck.dump`.
3. Provision a separate empty database. Restore using `pg_restore --dbname=service=ck_restore --exit-on-error --no-owner --no-privileges .ck-local/ck.dump`.
4. Point the migration CLI at the restored database and confirm the restored ledger matches the expected prefix. Recheck reference fixtures, constraints and application grants before using the restored data. Keep the preexisting database available until the rehearsal passes.

Use the owning team's backup and selective recovery process for shared data.

The [release rehearsal](release-rehearsal.md) exercises an upgrade, a separate restore and localized HTTP reads in the disposable fixture. Its staging gate tracks shared-platform evidence separately.

## Catalog fixtures

After migrations, run `npm run db:seed` with the development connection to load the five localized catalog examples. Replaying the same seed keeps the published revision and count stable. A deliberate source edit uses a new revision. The font is the unmodified Regular WOFF2 from the [Adobe Source Sans 3 3.052R release](https://github.com/adobe-fonts/source-sans/releases/tag/3.052R). The importer verifies the original font checksum and [license notice](../catalog/fonts/SourceSans3-OFL.txt).

## Localized releases

The application compiles the version-controlled ICU messages in `src/i18n/messages.ts`. Use a previously verified application build to recover a known-good interface bundle. Catalog and policy content follow their own sealed database revision. The publication adapter requires valid UI messages before calling the database publisher, which verifies all five content variants and their policy effective date. A failed check preserves the prior publication.

## Project identity boundary

The local PostgreSQL schema maps a provider issuer and external organization identifier to a Color Kitchen organization UUID. Within that organization, the provider's stable subject maps to a local principal UUID. Membership and its granting principal must belong to the project's organization. Persist provider identifiers from the verified authentication adapter. Email addresses and caller-supplied principal IDs are unsuitable for resolving access. The local fixtures use a synthetic issuer. Live binding requires a verified provider, organization and subject mapping.

Create a project and its initial owner in one transaction. Membership mutations update the project version under its row lock. A deferred check requires an active owner at commit for every active project, so an owner transfer can complete atomically. Deactivation uses `inactive_at`. Staff publication permissions use their own grant boundary.

Theme revisions snapshot the selected swatches and role bindings. Their composite keys carry organization, project and asset scope. Drafts can omit theme roles. Release requires all six roles, defaults to the project audience and permits one current release per asset. Withdrawal preserves the original release and revision. Command receipts commit with their completed result, alongside the business changes and audit event.

## Catalog moderation history

Catalog staff grants are independent of project ownership. A review records the exact catalog revision and edit version and references a publisher grant. The coverage view identifies missing locales on each draft or published revision. The migration records current publications as the history baseline while retaining the existing public IDs, URLs, revisions and query projection.

Publication, review and audit history is append-only. Retain sealed revisions referenced by publication history. An unreviewed, unsealed draft can be removed with its dependent entries under a staff retention process. Audit entries hold actor, action and revision metadata. Retention changes for publication and audit records require an owner-approved migration and policy.
