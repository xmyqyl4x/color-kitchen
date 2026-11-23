# Changelog

All notable changes to Color Kitchen are documented in this file.

## [Unreleased]

### Added
- **`src/db/in-memory-catalog.ts`**: Added an in-memory `ClientBase` catalog adapter seeded from `baseCatalog` (all five locales of curated palettes, gradients, CSS named colors, and bundled OFL fonts) so public discovery routes, `/api/v1/catalog/*`, `/sitemap.xml`, and `/robots.txt` work without a running PostgreSQL instance.
- **`src/http/cli-env.ts`**: Added `cleanEnvironment()` and `resolveCliRuntime()` to strip blank environment variable placeholders, normalize or fall back on malformed `COLOR_KITCHEN_ORIGIN` values in development mode, and preserve strict `runtimeFromEnvironment()` validation in production (`NODE_ENV=production`).
- **`tests/in-memory-catalog.test.ts`**: Added unit tests covering CLI environment normalization (blank placeholders, path-containing dev origins, invalid dev placeholders, strict production rejection), in-memory catalog listing/pagination, localized detail lookups, CSS color alias resolution, nearest-color search, discovery topics, web/API route status codes, and both strict and preview CSP headers.
- **`docs/preview-runtime.md`**: Added architecture and decision documentation covering preview/local dev startup, Cloud Run production behavior, CI compatibility, and verification results.
- **`package.json` scripts**: Added `"dev": "npm run build && node dist/src/http/cli.js"` and `"lint": "tsc --noEmit"`.

### Changed
- **`src/http/cli.ts`**:
  - Uses `resolveCliRuntime(process.env)` so blank `.env.example` entries and malformed optional settings warn and degrade safely in development (`NODE_ENV !== 'production'`), while remaining strictly validated in production (`NODE_ENV=production`).
  - Uses `pg.Pool` in production and probes `DATABASE_URL` against `ck.published_catalog` in development and preview. Development and preview load the in-memory catalog when PostgreSQL is unset, unreachable, or unmigrated.
  - Defaults the listener host to `0.0.0.0` (port `3000`) in development when `HOST` is unset.
  - Guards PostgreSQL background polling timers (`pollCatalog`, `pollInquiries`) and `pool.end()` shutdown cleanup so they run only when a PostgreSQL pool is active.
- **`src/http/server.ts`**: Updated `localRequestOrigin` to derive the request origin from `Host` and `X-Forwarded-Proto` when no explicit `COLOR_KITCHEN_ORIGIN` is configured and the server is bound to a non-loopback address or accessed behind an HTTPS reverse proxy, while preserving existing loopback alias behavior.
- **`src/web/http.ts` & `src/web/shell.ts`**: Added an opt-in `allowEmbedding` flag so production keeps `frame-ancestors 'none'` in `Content-Security-Policy` by default while development/preview mode (`!isProduction`) omits it for embedded preview iframes.
- **`package.json`**: Relaxed `engines.node` from `>=24 <25` to `>=22` to support Node.js 22 preview/dev runtimes while keeping `.node-version` at `24.22.3` for GitHub Actions CI (`.github/workflows/verify.yml`) and Docker (`Dockerfile`) parity.
- **`.env.example`**: Documented all optional runtime variables with empty defaults, Cloud SQL Unix socket `DATABASE_URL` format comments, and a Cloud Run `PORT` warning.
- **`docs/environment-configuration.md`**: Documented Cloud Run environment variable settings and the Cloud SQL Unix socket `DATABASE_URL` format.
- **`README.md`**: Updated development instructions for Node.js 22+ (`npm run dev`), the automatic in-memory fallback, `.node-version` CI/Docker parity, and links to `docs/preview-runtime.md` and `CHANGELOG.md`.

### Fixed

- Production refuses to start when `COLOR_KITCHEN_ORIGIN` or `DATABASE_URL` is missing.
- Hosted Guide submissions require PostgreSQL budget admission. The browser’s local Guide remains available in previews without a database.
- The Color Atlas browser test waits for the detail page and clipboard confirmation before reading the clipboard.
