# Environment configuration

Color Kitchen builds one application artifact. Deployment settings go into the running process or container. Supply secrets through the deployment’s secret store. The [local template](../.env.example) only contains disposable database defaults.

## Public URL, listener, and search indexing

| Setting | Where to set it | Behavior |
| --- | --- | --- |
| `COLOR_KITCHEN_ORIGIN` | Web service runtime environment | The browser-facing origin, such as `https://color-kitchen.com` in production. Include the scheme and an external port when it is part of the address. The same setting controls sitemap URLs, `robots.txt`, canonical and language links, social URLs, same-origin writes, and HTTPS cookie handling. The server requires it in production and on non-loopback listeners. |
| `HOST` and `PORT` | Web service runtime environment | The internal address and port the process listens on. Direct Node runs default to `127.0.0.1:3000`. The Docker image defaults to `0.0.0.0:3000`. The container health check uses this listener. |
| `COLOR_KITCHEN_INDEXING` | Web service runtime environment | Defaults to `true`. Set it to `false` for a staging site or public preview that search engines should exclude. Public HTML sends `noindex` and the sitemap is disabled. |
| `COLOR_KITCHEN_RELEASE_PORT` and `COLOR_KITCHEN_RELEASE_CONTAINER_PORT` | Local release Compose environment | Select the loopback host port and container port. They default to `58320` and `3000`. Compose sets the container listener port from the same value it maps. |

The previous production fallback could put a loopback host and internal port into public metadata. Direct loopback development now derives its URL from the actual listener and accepts a matching `localhost`, IPv4 or IPv6 loopback URL. Deployed runtimes use the configured origin regardless of proxy headers. At the ingress, terminate TLS and redirect any secondary domain to the configured canonical host.

For production use `COLOR_KITCHEN_ORIGIN=https://color-kitchen.com` and `COLOR_KITCHEN_INDEXING=true`. If hosted staging is added, set its own HTTPS origin and `COLOR_KITCHEN_INDEXING=false`. For a local Docker release, use the loopback URL visitors actually open, including its mapped port. The release rehearsal can use its shared loopback ingress origin.

## Google Cloud production

Set the production origin and indexing flag on the selected Google Cloud service. Keep database credentials and feature keys in Secret Manager and grant the runtime identity access to the secrets it uses. The application accepts the same variable names across Google Cloud services. [Google Cloud Secret Manager](https://cloud.google.com/secret-manager/docs/overview)

### Cloud Run settings

| Property | Value |
| --- | --- |
| `DATABASE_URL` | Connection URL for the migrated PostgreSQL database, using the app’s runtime database user. Reference it from Secret Manager. |
| `HOST` | `0.0.0.0`. The repository’s Docker image already sets this. |
| `PORT` | Do **not** set `PORT` in the Cloud Run environment variable list; Cloud Run injects `8080` by default. If you want `3000`, set Cloud Run’s **Container port** to `3000`. |
| `COLOR_KITCHEN_ORIGIN` | `https://color-kitchen.com` once the custom domain is serving the app. While testing, use your exact Cloud Run `https://…run.app` URL without any path. |
| `COLOR_KITCHEN_INDEXING` | `false` for the test service. Set `true` when the production domain is ready for indexing. |
| `COLOR_KITCHEN_MEASUREMENT` | `false` for the initial deployment. Set `true` when enabling consented palette usage measurement. |

The production server requires `COLOR_KITCHEN_ORIGIN` and PostgreSQL configuration (either Cloud SQL `SQL_HOST`/`SQL_DB_NAME`/`SQL_USER`/`SQL_PASSWORD` or `DATABASE_URL`) before it starts listening. It uses PostgreSQL for catalog data and enforces `frame-ancestors 'none'` in `Content-Security-Policy`. Use the same hostname in your browser that you configured in `COLOR_KITCHEN_ORIGIN`.

For Cloud SQL for PostgreSQL using the Cloud Run Unix socket connection, format the `DATABASE_URL` secret as:

```text
postgresql://DB_USER:URL_ENCODED_PASSWORD@localhost/DB_NAME?host=%2Fcloudsql%2FPROJECT_ID%3AREGION%3AINSTANCE_ID
```

Attach the Cloud SQL instance to the Cloud Run service, grant its runtime service account **Cloud SQL Client** and access to the `DATABASE_URL` secret, apply migrations with the migration role (`npm run db:migrate`), and seed a fresh database (`npm run db:seed`) if you want the bundled palettes, gradients, colors, and fonts. If you enable inquiry delivery or staff catalog background polling on Cloud Run, allocate CPU and a running instance between requests, or run them on an independently scheduled service. [Database runbook](database.md) · [Cloud Run runtime contract](https://cloud.google.com/run/docs/container-contract) · [Cloud Run environment configuration](https://cloud.google.com/run/docs/configuring/services/environment-variables) · [Cloud Run background execution](https://cloud.google.com/run/docs/configuring/billing-settings#background_execution_considerations)

## PostgreSQL

| Setting | Where to set it | Behavior |
| --- | --- | --- |
| `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD` | Cloud SQL runtime environment | Preferred Cloud SQL Object-Method pool parameters (`src/db/index.ts`), connecting via the Cloud SQL Auth Proxy Unix domain socket using the least-privilege runtime role. See the [Cloud SQL setup runbook](cloudsql-setup.md). |
| `SQL_ADMIN_USER` and `SQL_ADMIN_PASSWORD` | Cloud SQL migration/seed environment | Administrative credentials used by Drizzle Kit (`src/db/drizzle.config.ts`), `npm run db:migrate`, and `npm run db:seed`. |
| `DATABASE_URL` | External PostgreSQL, CI, or Cloud Run secret | Connection URL fallback used when `SQL_HOST` is not set. Use the runtime role for serving and the migration role for schema changes. |
| `COLOR_KITCHEN_DB_POOL_MAX` | Web service runtime environment | Defaults to 10 connections per web process. Choose a value that fits the database limit and the number of replicas. |
| `COLOR_KITCHEN_DB_CONNECT_TIMEOUT_MS` and `COLOR_KITCHEN_DB_STATEMENT_TIMEOUT_MS` | Web service runtime environment | Runtime connection and statement timeouts. They default to 3000 and 5000 milliseconds. |
| `COLOR_KITCHEN_DEV_DB_PORT`, `COLOR_KITCHEN_DEV_DB_USER` and `COLOR_KITCHEN_DEV_DB_PASSWORD` | Local development Compose environment | Override the disposable PostgreSQL port and initial credentials. The test database name is `color_kitchen_test`. Update the development connection URL and test connection URL together. Initial credentials apply when PostgreSQL initializes a volume. |
| `COLOR_KITCHEN_TEST_DATABASE_URL` | Test process environment | Points to a disposable instance with permission to create uniquely named test databases. The test runner checks the fixture database name before running. |

Apply [database migrations](database.md) and review the [Cloud SQL setup runbook](cloudsql-setup.md) before directing traffic to a new runtime. Local Compose credentials are for the disposable database.

## Optional integrations

| Integration | Settings owned by the deployment |
| --- | --- |
| Staff and project sign-in | `COLOR_KITCHEN_IDENTITY_ISSUER`, `COLOR_KITCHEN_IDENTITY_AUDIENCE`, and `COLOR_KITCHEN_IDENTITY_PUBLIC_KEY`. Coordinate them with the identity gateway. [Private HTTP contract](private-http.md) |
| Hosted Color Guide | `AI_GATEWAY_API_KEY`, `COLOR_KITCHEN_GUIDE_MODEL`, `COLOR_KITCHEN_GUIDE_REQUESTS_PER_MINUTE`, and `COLOR_KITCHEN_GUIDE_DAILY_UNITS`. Hosted requests require PostgreSQL to reserve budget. The local Guide works independently. |
| Inquiry encryption | `COLOR_KITCHEN_CONTACT_KEY_ID`, `COLOR_KITCHEN_CONTACT_ENCRYPT_KEY`, `COLOR_KITCHEN_CONTACT_HMAC_KEY`, and `COLOR_KITCHEN_CONTACT_RETENTION_DAYS`. The encryption and HMAC keys are 32 bytes each, encoded as hexadecimal in the secret store. |
| Inquiry delivery | `COLOR_KITCHEN_INQUIRY_WEBHOOK`, `COLOR_KITCHEN_INQUIRY_TOKEN`, and `COLOR_KITCHEN_INQUIRY_DEDUP_MS`. Use the approved HTTPS receiver and its retry and deduplication agreement. |
| Advertising and measurement | `COLOR_KITCHEN_AD_FRAME_URL`, `COLOR_KITCHEN_MEASUREMENT`, `COLOR_KITCHEN_CONSENT_KEY`, and `COLOR_KITCHEN_EVENT_KEY`. Use approved environment-specific values. [Public HTTP contract](public-http.md) |

Production starts with an empty inquiry queue. Configure a fresh active key pair if inquiries will be enabled. In later migrations with retained encrypted inquiries, preserve their key IDs and associated keys. If the next runtime writes with a new active key ID, supply the earlier key pairs through `COLOR_KITCHEN_CONTACT_PREVIOUS_KEYS`. This secret contains a JSON object keyed by previous ID. Each value has `encryptKey` and `hmacKey` fields containing the original hex values. The runtime resolves old records and retries with the retained keys while using the active pair for new inquiries. Carry the consent and event signing keys forward when those existing cookies or tokens need to remain valid.

Provider identifiers, external vendor URLs, budgets, and production secrets need values from their owners. Source and license URLs, standards namespaces, dependency versions, local-only rehearsal addresses, and same-origin browser paths remain part of the application or test contracts.

## Validate a deployment

After starting the service, check that `/robots.txt`, `/sitemap.xml`, a localized canonical link, and a social preview use the configured public origin. Exercise a same-origin tool request through the HTTPS ingress. GitHub’s image smoke test uses a different internal port and fixture HTTPS origin to check that the two settings stay independent.

Browser drafts and My Collection are stored per origin. To move saved work from the local address to the production site, use My Collection’s backup export and import. PostgreSQL migrations move the published catalog and server-side records.
