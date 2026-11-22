# Color Kitchen local release

Phase 1 uses local Docker staging and synthetic PostgreSQL content. The published staging evidence records the 0003 to 0004 upgrade, the previous image running on upgraded data, and the independent restore. [P1-40 staging evidence](release-evidence/p1-40-local.json)

## Prepare the candidate

Build from a clean checkout and record the image ID and its Git revision label. The runtime image starts as a non-root user. Docker health checks exercise the catalog against PostgreSQL. The GitHub Verify workflow builds the image and checks localized pages, a seeded catalog release and packaged web assets.

```powershell
$revision = (git rev-parse HEAD).Trim()
docker build --build-arg "REVISION=$revision" --tag "color-kitchen:$revision" .
docker image inspect "color-kitchen:$revision" --format '{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}'
```

Confirm the database alias, migration owner, ledger and approved localized publication. Apply only pending additive migrations through the migration identity and verify the previous image still reads the upgraded database. Configure the running app through a runtime environment file with the restricted PostgreSQL connection and intended `COLOR_KITCHEN_ORIGIN`. For a local release, use synthetic records and local provider fixtures. The [database runbook](database.md) and [public HTTP configuration](public-http.md) describe the separation of runtime, migration and provider settings.

## Verify the rollout

Run the known-good and candidate images on separate loopback ports against the same staging database. Set their canonical origin to the intended deployment URL. The rollout command starts a temporary loopback ingress on a third port and verifies the previous build before assigning 10 of 100 synthetic traffic slots to the candidate.

```powershell
npm run release:rollout -- http://127.0.0.1:58321 http://127.0.0.1:58322 58323
```

The limited rollout checks the measured assignment and both builds, then verifies 100% candidate exposure. Checks cover all five localized home pages and published palette variants, the public tool routes, a PDF read from an actual browser download, offline Guide, and private tool requests. The HTTP probe allows one transient failure per locale across three requests. A navigation failure, repeated API failure, a changed content digest, or unexpected outbound browser traffic fails the check. The command uses bounded read-only probes and records elapsed time. Use `docker stats --no-stream` on the dedicated containers to record compute and memory usage. Provider expenses remain zero when the runtime uses local fixtures.

## Start the verified local site

Set `COLOR_KITCHEN_IMAGE` to the verified image ID, `COLOR_KITCHEN_RUNTIME_ENV` to the private runtime environment file, and `COLOR_KITCHEN_DATABASE_NETWORK` to the approved local Docker network. The Compose file publishes the registered loopback port only.

```powershell
docker compose --project-name ck-phase1-release --file compose.release.yaml up -d --wait
```

Use `COLOR_KITCHEN_RELEASE_PORT` to select an available port and match it in the app's `COLOR_KITCHEN_ORIGIN`.

## Recover

The rollout command returns traffic to the previous build and rechecks it if candidate verification fails. To roll back the local site after it is running, set `COLOR_KITCHEN_IMAGE` to the verified previous image ID and rerun the same Compose command. Leave the additive schema and compatible writes in place. Confirm the image ID and repeat the localized catalog checks.

If a publication caused the failure, the catalog owner can use `ck.publish_catalog_revision` with the previously approved sealed revision and the current item and edit versions. Verify the five variants and check the reverted content digest. Restore from an archive into a separately named database if a database recovery is required.

The [hosted staging gate](release-rehearsal.md) records separate platform, publication, accessibility and vendor evidence for an externally hosted release.
