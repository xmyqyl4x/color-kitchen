# Preview and Local Dev Runtime

This document records the changes, architectural decisions, and trade-offs made so Color Kitchen boots reliably via `npm run dev` on port `3000` (`0.0.0.0`) in hosted preview containers and local Node.js 22+ environments while preserving strict production, Cloud Run, and GitHub Actions CI contracts.

## Summary of Changes

| File | Status | Purpose |
| --- | --- | --- |
| `package.json` | Modified | Relaxed `engines.node` to `>=22`; added `dev` (`npm run build && node dist/src/http/cli.js`) and `lint` (`tsc --noEmit`) scripts. `.node-version` (`24.22.3`) is intentionally preserved for CI and Docker parity. |
| `.env.example` | Modified | Documented optional runtime variables with empty defaults, Cloud SQL Unix socket `DATABASE_URL` format comments, and a warning not to define `PORT` as a custom Cloud Run env var. |
| `src/db/in-memory-catalog.ts` | Added | In-memory PostgreSQL `ClientBase` adapter pre-seeded from `src/catalog/base-data.ts` (`baseCatalog`) and in-memory `GuideAdmission` fallback. |
| `src/http/cli-env.ts` | Added | Environment cleaner (`cleanEnvironment`) and runtime resolver (`resolveCliRuntime`) that strip blank placeholders, normalize or fall back on invalid `COLOR_KITCHEN_ORIGIN` in development, and enforce strict `runtimeFromEnvironment` in production. |
| `src/http/cli.ts` | Modified | Uses `resolveCliRuntime`; uses `pg.Pool` directly in production (`NODE_ENV=production` + `COLOR_KITCHEN_ORIGIN` + `DATABASE_URL`) and probes PostgreSQL with automatic in-memory catalog fallback in dev/preview; guards optional settings, background pollers, and pool shutdown. |
| `src/http/server.ts` | Modified | Extends `localRequestOrigin` to respect `Host` and `X-Forwarded-Proto` when running without an explicit `COLOR_KITCHEN_ORIGIN` on a non-loopback listener or behind an HTTPS proxy. |
| `src/web/http.ts` & `src/web/shell.ts` | Modified | Adds opt-in `allowEmbedding` flag; defaults to strict `frame-ancestors 'none'` for production/Cloud Run and omits it only when `NODE_ENV !== 'production'`. |
| `tests/in-memory-catalog.test.ts` | Added | Unit tests validating `resolveCliRuntime`, in-memory catalog queries, localized routes, API responses, and both strict and preview CSP headers. |
| `docs/environment-configuration.md` | Modified | Added Cloud Run settings table and Cloud SQL Unix socket `DATABASE_URL` format under Google Cloud production. |
| `README.md` | Modified | Updated Development instructions for Node.js 22+, `npm run dev`, `.node-version` CI/Docker parity, and links to this guide and `CHANGELOG.md`. |
| `CHANGELOG.md` | Added | Project changelog recording all changes under `[Unreleased]`. |

## Key Decisions and Rationale

### 1. Compile-and-run `dev` script (`npm run build && node dist/src/http/cli.js`)
- **Decision**: Run the compiled JavaScript output from `dist/src/http/cli.js` instead of executing TypeScript directly via `tsx`.
- **Why**: `src/web/http.ts` resolves static assets (`../../../src/web/kitchen.css`, `../../../catalog/...`) and serves browser ESM modules (`/src/**/*.js`) relative to `import.meta.url` under `dist/src/web/`. Running from `dist/` ensures both asset paths and compiled client-side JS modules work identically in dev, preview, and production without introducing new build tools or dependencies.

### 2. Preserve `.node-version` (`24.22.3`) while relaxing `engines.node` to `>=22`
- **Decision**: Keep `.node-version` unchanged at `24.22.3` and update only `package.json` `engines.node` to `>=22`.
- **Why**: `.github/workflows/verify.yml` passes `node-version-file: .node-version` to `actions/setup-node@v5` and `Dockerfile` pins `node:24.22.3-bookworm-slim`. Deleting `.node-version` would break GitHub Actions CI. Relaxing `engines.node` to `>=22` lets Node 22 containers run cleanly without disturbing CI or release Docker images.

### 3. Production PostgreSQL strictness vs. development/preview in-memory fallback
- **Decision**: Separate startup behavior by `NODE_ENV === 'production'`:
  - **Production (`NODE_ENV=production` + `COLOR_KITCHEN_ORIGIN` + `DATABASE_URL`)**: Connects directly via `pg.Pool` with no silent fallback to in-memory data. Docker/Cloud Run health checks (`dist/src/http/health.js`) therefore reflect real PostgreSQL health, and transient Cloud SQL cold starts recover naturally on subsequent requests.
  - **Development / Preview (`NODE_ENV !== 'production'` or missing `DATABASE_URL`)**: Probes `DATABASE_URL` with `SELECT 1 FROM ck.published_catalog LIMIT 1`; if unset, unreachable, or unmigrated, logs a warning and serves all five locales (`en`, `fr`, `es`, `pt`, `de`) of palettes, gradients, CSS named colors, and bundled OFL fonts from `createInMemoryCatalogClient()`.
- **Why**: Hosted preview containers often omit PostgreSQL or inject an unmigrated/unreachable `DATABASE_URL`. Probing at startup prevents `503 Service Unavailable` on discovery pages in preview while preventing accidental silent fallbacks in production.

### 4. Resilient development env parsing (`src/http/cli-env.ts`)
- **Decision**: Strip blank/whitespace-only environment variables in `cleanEnvironment()`, normalize path-containing `COLOR_KITCHEN_ORIGIN` URLs (or ignore unparseable placeholders) in development mode, and warn-and-skip malformed optional keys in development while throwing in `NODE_ENV=production`.
- **Why**: Some preview runners inject empty strings (`""`) for keys declared in `.env.example`, or developers paste full preview URLs with a `/en` path into `COLOR_KITCHEN_ORIGIN`. Without normalization, strict validators crashed the dev server before port `3000` opened. Production (`NODE_ENV=production`) keeps full strict validation.

### 5. Opt-in iframe embedding (`allowEmbedding: !isProduction`)
- **Decision**: Keep `frame-ancestors 'none'` as the default in `renderShell()`, omitting it only when `allowEmbedding: true` (set when `NODE_ENV !== 'production'`).
- **Why**: Embedded preview environments render the app inside an `<iframe>`, which `frame-ancestors 'none'` blocks. Gating it on `!isProduction` restores full clickjacking protection for Cloud Run and production deployments automatically.

### 6. Reverse-proxied origin derivation when `COLOR_KITCHEN_ORIGIN` is unset
- **Decision**: Extend `localRequestOrigin()` in `src/http/server.ts` to derive the origin from `Host` and `X-Forwarded-Proto` when no explicit `COLOR_KITCHEN_ORIGIN` is configured and the server is bound to a non-loopback address (`0.0.0.0`) or behind an HTTPS proxy.
- **Why**: Keeps same-origin checks, canonical links, and cookies working both on `http://localhost:3000` and behind HTTPS preview proxies, while preserving existing loopback alias tests and ignoring proxy headers whenever `COLOR_KITCHEN_ORIGIN` is explicitly set.

### 7. Cloud Run `PORT` and Cloud SQL Unix socket alignment
- **Decision**: Keep `PORT` commented in `.env.example`, document Cloud Run's injected `PORT` behavior, and document the Cloud SQL Unix socket `DATABASE_URL` format in `docs/environment-configuration.md`.
- **Why**: Cloud Run reserves `PORT` and rejects it if added to the custom environment variable list; `listenerFromEnvironment` already reads Cloud Run's injected `PORT`, and `pg` natively supports `?host=%2Fcloudsql%2F...` Unix sockets.

## Verification
- `npm run build` and `npm run lint` (`tsc --noEmit`): passed with 0 errors.
- Unit tests (`node --test dist/tests/in-memory-catalog.test.js dist/tests/color.test.js dist/tests/palette.test.js`): 11/11 passing.
- Browser verification in headless Chromium (`1440×900` desktop and `390×844` mobile): verified `/en`, `/en/palette-studio`, `/en/palettes`, `/en/palettes/forest-study`, `/en/colors`, `/en/gradients`, `/en/fonts`, and `/fr` with 0 console errors and 0 failed network requests.
- Untouched `package-lock.json` and restored `.node-version` (`24.22.3`) preserve `.github/workflows/verify.yml` CI and `Dockerfile` build compatibility.
