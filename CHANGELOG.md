# Changelog

All notable changes to Color Kitchen are documented in this file.

## [Unreleased]

### Added
- **`src/db/in-memory-catalog.ts`**: Added an in-memory `ClientBase` catalog adapter seeded from `baseCatalog` (all five locales of curated palettes, gradients, CSS named colors, and bundled OFL fonts) so public discovery routes, `/api/v1/catalog/*`, `/sitemap.xml`, and `/robots.txt` work without a running PostgreSQL instance.
- **`src/http/cli-env.ts`**: Added `cleanEnvironment()` and `resolveCliRuntime()` to strip blank environment variable placeholders, normalize or fall back on malformed `COLOR_KITCHEN_ORIGIN` values in development mode, and require both `COLOR_KITCHEN_ORIGIN` and PostgreSQL configuration (`SQL_*` or `DATABASE_URL`) in production (`NODE_ENV=production`).
- **`tests/in-memory-catalog.test.ts`**: Added unit tests covering CLI environment normalization (blank placeholders, path-containing dev origins, invalid dev placeholders, strict production rejection, and Cloud SQL `SQL_*` production acceptance), in-memory catalog listing/pagination, localized detail lookups, CSS color alias resolution, nearest-color search, discovery topics, web/API route status codes, and both strict and preview CSP headers.
- **`docs/preview-runtime.md`**: Added architecture and decision documentation covering preview/local dev startup, Cloud Run production behavior, CI compatibility, and verification results.
- **`src/db/schema.ts`, `src/db/drizzle.config.ts`, `src/db/index.ts`, `src/db/users.ts`**: Added Cloud SQL for PostgreSQL connection pooling via the `pg.Pool` Object Method (`SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`), Drizzle ORM schema (`public.users`, `public.saved_palettes`) and Drizzle Kit admin configuration (`SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`, `schemaFilter: ['public']`), and sanitized two-layer query helpers with `onConflictDoUpdate` user sync.
- **`src/lib/firebase.ts`, `src/lib/firebase-admin.ts`, `src/middleware/auth.ts`, `src/http/account.ts`**: Added Firebase Authentication (Google Sign-In client config, server-side Firebase Admin ID token verification via static JSON import of `firebase-applet-config.json`, Bearer auth middleware, and authenticated `/api/v1/account/*` endpoints for user profile sync and cloud-saved palettes).
- **`docs/cloudsql-setup.md`**: Added a dedicated Cloud SQL for PostgreSQL setup and operations runbook documenting the `ai-studio-5c9c23da` (`us-east1`) instance, `SQL_*` runtime/admin environment variables, dual-schema (`public` Drizzle vs `ck` migrations) architecture, automatic `SQL_USER` grants, 5-locale catalog seeding, Firebase Auth `/api/v1/account/*` contract, and bootstrap verification steps.
- **`tests/cloudsql-account.test.ts`**: Added unit tests verifying Cloud SQL environment variable detection and Firebase-authenticated `/api/v1/account/*` authorization and payload validation.
- **`package.json` scripts**: Added `"dev": "npm run build && node dist/src/http/cli.js"` and `"lint": "tsc --noEmit"`.

### Changed
- **`src/http/cli.ts`**:
  - Uses `resolveCliRuntime(process.env)` so blank `.env.example` entries and malformed optional settings warn and degrade safely in development (`NODE_ENV !== 'production'`), while requiring `COLOR_KITCHEN_ORIGIN` and PostgreSQL (`SQL_*` or `DATABASE_URL`) in production (`NODE_ENV=production`).
  - Connects lazily via Cloud SQL Object-Method `pg.Pool` (`createPool()`) when `SQL_HOST`/`SQL_USER`/`SQL_PASSWORD`/`SQL_DB_NAME` are present, via `DATABASE_URL` when explicitly provided (e.g. CI or external PostgreSQL), or falls back to the in-memory seeded catalog when no PostgreSQL configuration is present. No eager startup probe or reconnect loop is executed.
  - Enables the hosted Color Guide only when a PostgreSQL pool is active to enforce configured admission budgets; the local Guide remains available independently.
  - Mounts the Firebase-authenticated `/api/v1/account/*` router under `/api/`.
  - Defaults the listener host to `0.0.0.0` (port `3000`) in development when `HOST` is unset.
  - Guards PostgreSQL background polling timers (`pollCatalog`, `pollInquiries`) and `pool.end()` shutdown cleanup so they run only when a PostgreSQL pool is active.
- **`src/db/cli.ts` & `src/catalog/seed-cli.ts`**: Added support for Cloud SQL admin credentials (`SQL_HOST`, `SQL_DB_NAME`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`) alongside `DATABASE_URL`, and automatically grant `SQL_USER` runtime privileges on schema `ck` after running migrations.
- **`tsconfig.json` & `Dockerfile`**: Enabled `resolveJsonModule` and `skipLibCheck` in `tsconfig.json` and copied `firebase-applet-config.json` in `Dockerfile` build/runtime stages for static JSON module imports.
- **`src/http/server.ts`**: Updated `localRequestOrigin` to derive the request origin from `Host` and `X-Forwarded-Proto` when no explicit `COLOR_KITCHEN_ORIGIN` is configured and the server is bound to a non-loopback address or accessed behind an HTTPS reverse proxy, while preserving existing loopback alias behavior.
- **`src/web/http.ts` & `src/web/shell.ts`**: Added an opt-in `allowEmbedding` flag so production keeps `frame-ancestors 'none'` in `Content-Security-Policy` by default while development/preview mode (`!isProduction`) omits it for embedded preview iframes.
- **`package.json`**: Relaxed `engines.node` from `>=24 <25` to `>=22` to support Node.js 22 preview/dev runtimes while keeping `.node-version` at `24.22.3` for GitHub Actions CI (`.github/workflows/verify.yml`) and Docker (`Dockerfile`) parity.
- **`.env.example`, `docs/environment-configuration.md`, `docs/search-discovery.md`, `docs/cloudsql-setup.md`, and runtime/catalog tests**: Standardized production domain configuration examples and test fixtures on `https://www.color-kitchen.com` (with apex `color-kitchen.com` redirected via `301` to `https://www.color-kitchen.com`), alongside Cloud Run settings and Cloud SQL runtime variable documentation.
- **`README.md`**: Updated development instructions for Node.js 22+ (`npm run dev`), the automatic in-memory fallback, `.node-version` CI/Docker parity, and links to `docs/preview-runtime.md` and `CHANGELOG.md`.
