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

Set the production origin and indexing flag on the selected Google Cloud service. Keep database credentials and feature keys in Secret Manager and grant the runtime identity access to the secrets it uses. The application accepts the same variable names across Google Cloud services. The compute service has yet to be selected. [Google Cloud Secret Manager](https://cloud.google.com/secret-manager/docs/overview)

If you choose Cloud Run, use the service’s Variables and Secrets settings and let Cloud Run supply `PORT`. The release image already listens on `0.0.0.0` in the container. If you enable inquiry delivery or staff catalog background polling there, give the workers CPU and a running instance between requests, or run them on an independently scheduled service. [Cloud Run runtime contract](https://cloud.google.com/run/docs/container-contract) · [Cloud Run environment configuration](https://cloud.google.com/run/docs/configuring/services/environment-variables) · [Cloud Run background execution](https://cloud.google.com/run/docs/configuring/billing-settings#background_execution_considerations)

## PostgreSQL

| Setting | Where to set it | Behavior |
| --- | --- | --- |
| `DATABASE_URL` | Runtime, migration or seed process environment | Selects the target PostgreSQL database. Use the runtime role for serving and the migration role for schema changes. |
| `COLOR_KITCHEN_DB_POOL_MAX` | Web service runtime environment | Defaults to 10 connections per web process. Choose a value that fits the database limit and the number of replicas. |
| `COLOR_KITCHEN_DB_CONNECT_TIMEOUT_MS` and `COLOR_KITCHEN_DB_STATEMENT_TIMEOUT_MS` | Web service runtime environment | Runtime connection and statement timeouts. They default to 3000 and 5000 milliseconds. |
| `COLOR_KITCHEN_DEV_DB_PORT`, `COLOR_KITCHEN_DEV_DB_USER` and `COLOR_KITCHEN_DEV_DB_PASSWORD` | Local development Compose environment | Override the disposable PostgreSQL port and initial credentials. The test database name is `color_kitchen_test`. Update the development connection URL and test connection URL together. Initial credentials apply when PostgreSQL initializes a volume. |
| `COLOR_KITCHEN_TEST_DATABASE_URL` | Test process environment | Points to a disposable instance with permission to create uniquely named test databases. The test runner checks the fixture database name before running. |

Apply [database migrations](database.md) against the intended environment before directing traffic to the new runtime. Local Compose credentials are for the disposable database.

## Optional integrations

| Integration | Settings owned by the deployment |
| --- | --- |
| Staff and project sign-in | `COLOR_KITCHEN_IDENTITY_ISSUER`, `COLOR_KITCHEN_IDENTITY_AUDIENCE`, and `COLOR_KITCHEN_IDENTITY_PUBLIC_KEY`. Coordinate them with the identity gateway. [Private HTTP contract](private-http.md) |
| Hosted Color Guide | `AI_GATEWAY_API_KEY`, `COLOR_KITCHEN_GUIDE_MODEL`, `COLOR_KITCHEN_GUIDE_REQUESTS_PER_MINUTE`, and `COLOR_KITCHEN_GUIDE_DAILY_UNITS`. The local Guide works independently. |
| Inquiry encryption | `COLOR_KITCHEN_CONTACT_KEY_ID`, `COLOR_KITCHEN_CONTACT_ENCRYPT_KEY`, `COLOR_KITCHEN_CONTACT_HMAC_KEY`, and `COLOR_KITCHEN_CONTACT_RETENTION_DAYS`. The encryption and HMAC keys are 32 bytes each, encoded as hexadecimal in the secret store. |
| Inquiry delivery | `COLOR_KITCHEN_INQUIRY_WEBHOOK`, `COLOR_KITCHEN_INQUIRY_TOKEN`, and `COLOR_KITCHEN_INQUIRY_DEDUP_MS`. Use the approved HTTPS receiver and its retry and deduplication agreement. |
| Advertising and measurement | `COLOR_KITCHEN_AD_FRAME_URL`, `COLOR_KITCHEN_MEASUREMENT`, `COLOR_KITCHEN_CONSENT_KEY`, and `COLOR_KITCHEN_EVENT_KEY`. Use approved environment-specific values. [Public HTTP contract](public-http.md) |

Production starts with an empty inquiry queue. Configure a fresh active key pair if inquiries will be enabled. In later migrations with retained encrypted inquiries, preserve their key IDs and associated keys. If the next runtime writes with a new active key ID, supply the earlier key pairs through `COLOR_KITCHEN_CONTACT_PREVIOUS_KEYS`. This secret contains a JSON object keyed by previous ID. Each value has `encryptKey` and `hmacKey` fields containing the original hex values. The runtime resolves old records and retries with the retained keys while using the active pair for new inquiries. Carry the consent and event signing keys forward when those existing cookies or tokens need to remain valid.

Provider identifiers, external vendor URLs, budgets, and production secrets need values from their owners. Source and license URLs, standards namespaces, dependency versions, local-only rehearsal addresses, and same-origin browser paths remain part of the application or test contracts.

## Validate a deployment

After starting the service, check that `/robots.txt`, `/sitemap.xml`, a localized canonical link, and a social preview use the configured public origin. Exercise a same-origin tool request through the HTTPS ingress. GitHub’s image smoke test uses a different internal port and fixture HTTPS origin to check that the two settings stay independent.

Browser drafts and My Collection are stored per origin. To move saved work from the local address to the production site, use My Collection’s backup export and import. PostgreSQL migrations move the published catalog and server-side records.
