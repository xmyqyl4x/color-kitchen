# Cloud SQL for PostgreSQL Setup and Operations

This runbook documents the provisioned Google Cloud SQL for PostgreSQL architecture, Drizzle ORM + Firebase Authentication integration, schema separation, migration/seed workflow, and production Cloud Run alignment for Color Kitchen.

## Provisioned Instance Summary

| Property | Value |
| --- | --- |
| Engine | Cloud SQL for PostgreSQL (Developer edition) |
| Instance name | `ai-studio-5c9c23da` |
| Region | `us-east1` |
| Google Cloud project | `gen-lang-client-0453791496` |
| Auth provider | Firebase Authentication (Google Sign-In via `firebase-applet-config.json`; authorize `www.color-kitchen.com` for production) |
| Canonical production origin | `https://www.color-kitchen.com` (map `www` via Cloud Run `CNAME`, `301` redirect apex `color-kitchen.com` → `https://www.color-kitchen.com`) |

## Connection Model and Environment Variables

Color Kitchen connects to Cloud SQL through the Cloud SQL Auth Proxy Unix domain socket using the `pg.Pool` **Object Method** in `src/db/index.ts`.

### Runtime Application Pool (`SQL_USER`)

Used lazily by the HTTP server (`src/http/cli.ts`) and Drizzle ORM (`src/db/index.ts`). `SQL_USER` has read/write DML access (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) without DDL/schema-altering privileges.

| Variable | Role |
| --- | --- |
| `SQL_HOST` | Cloud SQL Auth Proxy Unix domain socket directory |
| `SQL_DB_NAME` | Target PostgreSQL database name |
| `SQL_USER` | Least-privilege runtime database role |
| `SQL_PASSWORD` | Password for `SQL_USER` |

### Admin / Migration Credentials (`SQL_ADMIN_USER`)

Used exclusively by Drizzle Kit (`src/db/drizzle.config.ts`) and Color Kitchen's SQL migration & catalog seed CLIs (`src/db/cli.ts`, `src/catalog/seed-cli.ts`).

| Variable | Role |
| --- | --- |
| `SQL_ADMIN_USER` | Administrative migration role allowed to execute DDL |
| `SQL_ADMIN_PASSWORD` | Password for `SQL_ADMIN_USER` |

> **External PostgreSQL & CI compatibility:** When `SQL_HOST` is not set (for example, in GitHub Actions CI or a Cloud Run service configured with a `DATABASE_URL` secret), `src/http/cli.ts`, `src/db/cli.ts`, and `src/catalog/seed-cli.ts` continue to accept `DATABASE_URL`. When neither `SQL_*` nor `DATABASE_URL` is configured in local development, the HTTP server falls back to the in-memory seeded catalog (`src/db/in-memory-catalog.ts`).

### Pooling Rules

- **Lazy connection establishment:** `createPool()` in `src/db/index.ts` initializes a single cached `pg.Pool` (`max: 10`, `connectionTimeoutMillis: 15000`) with an idle error listener.
- **No eager startup probes or reconnect loops:** The server does not run `pool.connect()` probes or retry loops at boot, preventing Cloud SQL Auth Proxy rate-limiting (`429 RESOURCE_EXHAUSTED`) during serverless cold starts.

## Dual-Schema Architecture (`public` vs `ck`)

Both Drizzle-managed user tables and Color Kitchen's native SQL-migrated catalog/platform tables coexist cleanly in the same PostgreSQL database via strict schema boundaries:

### 1. `public` Schema — Drizzle ORM (`src/db/schema.ts`)

Managed by Drizzle Kit (`src/db/drizzle.config.ts`) with `schemaFilter: ['public']` so Drizzle never alters or drops Color Kitchen's `ck` or `ck_migrations` schemas.

| Table | Columns | Notes |
| --- | --- | --- |
| `public.users` | `id` (serial PK), `uid` (text, unique, not null), `email` (text, not null), `display_name` (text), `created_at` (timestamptz), `updated_at` (timestamptz) | Synced on authenticated requests via `getOrCreateUser()` using Drizzle `onConflictDoUpdate` keyed on Firebase Auth `uid`. |
| `public.saved_palettes` | `id` (serial PK), `user_id` (integer FK -> `users.id` ON DELETE CASCADE), `title` (text, not null), `colors` (jsonb `string[]`, not null), `notes` (text), `created_at` (timestamptz), `updated_at` (timestamptz) | Per-user cloud-saved palettes queried via explicit `innerJoin` on `users.uid`. |

### 2. `ck` and `ck_migrations` Schemas — Color Kitchen Migrations (`db/migrations/`)

Managed by `src/db/migrate.ts` (`npm run db:migrate`), applying immutable SQL files `0001_baseline.sql` through `0010_catalog_moderation_delivery.sql` under a PostgreSQL transaction and advisory lock.

- **Automatic runtime grants:** Because `0001_baseline.sql` revokes `PUBLIC` access on schema `ck`, `src/db/cli.ts` automatically grants `SQL_USER` least-privilege runtime permissions whenever `SQL_ADMIN_USER` runs migrations and `SQL_USER !== SQL_ADMIN_USER`:
  - `GRANT USAGE ON SCHEMA ck TO "<SQL_USER>"`
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ck TO "<SQL_USER>"`
  - `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ck TO "<SQL_USER>"`
  - Matching `ALTER DEFAULT PRIVILEGES IN SCHEMA ck` rules for future tables and sequences.
- **Seeded base catalog:** `npm run db:seed` (`src/catalog/seed-cli.ts`) loads `baseCatalog` (`src/catalog/base-data.ts`) — 233 entries across all 5 locales (`en`, `fr`, `es`, `pt`, `de`), producing `1,165` published rows in `ck.published_catalog`:
  - `695` localized color rows (139 CSS named colors × 5 locales)
  - `210` localized palette rows (42 palettes × 5 locales)
  - `185` localized gradient rows (37 gradients × 5 locales)
  - `75` localized font rows (15 bundled OFL fonts × 5 locales)

## Firebase Authentication & Account API

- **Client SDK (`src/lib/firebase.ts`):** Initializes Firebase Auth and `GoogleAuthProvider` using a static JSON import of `firebase-applet-config.json`.
- **Admin SDK (`src/lib/firebase-admin.ts`):** Initializes `firebase-admin` using a static JSON import (`import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' }`) and `firebaseConfig.projectId`.
- **Bearer middleware (`src/middleware/auth.ts`):** Verifies `Authorization: Bearer <idToken>` with `adminAuth.verifyIdToken(token)` and rejects missing/invalid tokens with `401`.
- **Routes (`src/http/account.ts`, mounted in `src/http/cli.ts`):**
  - `GET /api/v1/account/me` — Upserts and returns the authenticated user profile.
  - `GET /api/v1/account/palettes` — Returns cloud-saved palettes scoped to the authenticated user's Firebase `uid`.
  - `POST /api/v1/account/palettes` — Validates `title` (1–120 chars), `colors` (1–12 hex strings), and optional `notes` (<=500 chars), then inserts via Drizzle (`201 Created`).
  - `DELETE /api/v1/account/palettes/:id` — Deletes a palette owned by the authenticated user (`200 OK` or `404 Not Found`).
- **Two-layer error handling:** `src/db/users.ts` catches raw PostgreSQL errors and rethrows sanitized messages (`{ cause: error }`), while `src/http/account.ts` returns safe HTTP status codes without leaking table names or connection details.

## Step-by-Step Database Bootstrap

1. **Apply Drizzle schema (`public`):**
   - In AI Studio, invoke Cloud SQL `UpdateSchema` (runs Drizzle Kit push against `src/db/drizzle.config.ts`).
   - Verify `public.users` and `public.saved_palettes` columns in `information_schema.columns`.
2. **Apply Color Kitchen SQL migrations (`ck`):**
   ```bash
   npm run db:migrate
   ```
   Confirms `{"head":"0010","applied":["0001",...,"0010"]}` and grants `SQL_USER` access to schema `ck`.
3. **Seed the 5-locale base catalog:**
   ```bash
   npm run db:seed
   ```
   Confirms `{"inserted":233,"unchanged":0}` (idempotent on reruns).
4. **Verify runtime access:**
   - Start the server (`npm start` or `npm run dev`).
   - Confirm `/en/palettes`, `/en/colors`, `/en/gradients`, `/en/fonts`, and `/api/v1/catalog/palette/forest-study?locale=fr` return `200`.
   - Confirm `/api/v1/account/me` returns `401` without a valid Firebase Bearer token.
