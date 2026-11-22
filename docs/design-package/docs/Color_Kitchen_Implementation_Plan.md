# Delivery architecture

Ship one containerized web application in two live releases. Put color mathematics and editing rules in a deterministic TypeScript package, application workflows in use cases, and storage behind narrow interfaces. The same use case can serve several clients. PostgreSQL is the system of record for hosted data in both releases. Use the existing database and identity boundaries after the read-only review in the companion database design. Browser-local creative documents have their own persistence boundary.

The project repository contains only a README at the reviewed commit. The technology choices here are proposed defaults until the actual platform's migration system, shared identity service, data owners and deployment environment are identified. The eight steps in the earlier design are now organized into two releases. This plan describes work to implement and the evidence that will establish completion. [Reviewed repository snapshot](https://github.com/xmyqyl4x/color-kitchen/tree/e30ea886dfc07fa05067c551ffeabe5b863d9140)

## Ownership and dependency direction

| Layer | Owns | Boundary and test |
| --- | --- | --- |
| Persistence | Existing PostgreSQL schema conventions, proposed ck relations, migrations, constraints, reference seeds, retention. Device-side IndexedDB document and asset formats. | Migration runner alone has DDL rights. Schema integration tests build the preceding state and migrate forward. Separate browser upgrade fixtures cover older document versions. |
| Data access | Typed records, domain mapping, query projections, repositories, version heads and scoped transactions. Adapter for platform subjects and approved game summaries. | Accept a use-case transaction or scope and return typed results. Tests use a disposable PostgreSQL matching the verified production major. Browser storage adapters use browser fixtures. |
| Domain | Color parsing, harmony, locks, alpha, gamut and contrast, gradients, theme role bindings, publication rules, project invariants. | Pure functions or small typed objects. Inject clocks and seeds when a result depends on them. Tests cover numeric limits, invalid state and repeatability without servers. |
| Application services | GeneratePalette, ApplyContrastFix, ExtractImagePalette, SaveLocalDocument, FindPublishedItems, SubmitInquiry, AskColorGuide, SaveThemeRevision, ReleaseTheme, PublishCatalogRevision. | Services own a complete command or query, authorization decision, transaction boundary and error result. They depend on data and provider interfaces. |
| APIs | Public HTTP reads and submissions, authenticated platform APIs, typed browser-local interfaces, Phase 2 read-only connector tools and extension handoff. | Parse at the edge. Pass a principal, locale and typed input into one use case. Return a stable error code and a data projection. Verify browser, HTTP and connector contracts before the UI. |
| Presentation | Localized public pages, admin forms, developer portal, mobile views, extension popup and AI client output. | Views own interaction, focus and rendering. They submit commands through the applicable interface. A UI test exercises real supported entry points. |
| Infrastructure | Identity provider, scoped OAuth grants, database pool, local storage, web workers, approved fonts, model provider, consent provider, advertising, contact notification, scheduler and deployment. | Wire concrete adapters in one composition root. Bound time, retries, payload size and sensitive fields. Test provider outages and recovery. |

A database view or repository row is a persistence representation. Map it to a small domain value and then an API projection. A published catalog projection strips drafts, author identifiers and private operational fields. The UI receives the localized title and stable content ID it needs to display and link the result.

**Local journey.** Image selection passes a browser File to the local Image to Palette use case. A worker performs bounded decoding and sampling. Studio, preview, contrast checking and export call the same color engine. When the visitor chooses Save on this device, the use case writes a versioned document to IndexedDB. The browser does not need an HTTP upload endpoint for this task.

**Hosted journey.** A developer chooses Save to project and selects which color data to include. The server resolves the authenticated subject, checks active project membership, validates roles, locks the asset, compares the expected revision, writes the new immutable snapshot and records the audit event. The response includes the new revision and version token. The desktop and mobile clients call the same endpoint. Release is a distinct owner operation. An external AI client can read only resources permitted by its grant and the current release state.

## Contracts before user interfaces

These are proposed contract shapes. Pin names, request limits, status codes and examples in OpenAPI and shared TypeScript schemas during the API gate. Each API test exercises the service and repository used by the corresponding UI. Versioning the creative-document schema separately allows new application releases to open earlier backups.

| Consumer and example entry | Accepted input | Observable result and failure |
| --- | --- | --- |
| Public catalog, GET /api/v1/catalog/{kind} | Allowed kind, locale, filter IDs, sort, bounded cursor/size. | Published item IDs, localized fields, license reference and next cursor. Reject invalid sort or cursor. Include locale and publication revision in cache keys. |
| Public Color Guide, POST /api/v1/guide | Prompt, selected locale, bounded history and explicitly included swatches. | Validated message and candidate palette. A uniform 429 includes retry guidance. A provider timeout returns a typed temporary error and retains the user's input. |
| Contact, POST /api/v1/inquiries | Client request ID, category, locale, reply address and bounded message. | Acknowledge once durable intake succeeds. A matching retry reuses the same reference. Changed input under the same ID returns 409. The persisted delivery queue leases work after commit. Ambiguous external delivery requires provider deduplication or reconciliation. Limit and redact logs. |
| Browser workspace API | generate(document, options), checkPair(pair, backing), sampleGradient(spec, count), exportDocument(document, format), saveLocal(document). | A typed result or localized error key. Inputs and source pixels remain local. Element event handlers contain no alternate calculation. |
| Project API, POST /api/v1/projects/{id}/assets/{assetId}/revisions | Authenticated project scope, validated roles/colors, operation ID, expected head. | Return stored revision and ETag. Repeat identical operation returns the first result. Failed If-Match gives 412. Reused operation ID with different payload gives 409. |
| Release and staff publishing APIs | Authenticated owner or separate staff grant, target revision, expected current version, audience/intent and request key. | Store the command receipt, release change and audit in one transaction. A matching replay returns the original result. Failed If-Match returns 412, changed input under the same key or a conflicting transition returns 409. An owner can re-release a withdrawn revision with a fresh key and explicit audience confirmation. |
| Connector read tools | Published public query, or an authorized selected project plus its active release. | Return bounded structured tokens, schema version, revision and display labels. Validate issuer, intended resource, expiry, scope and live membership. A revoked or withdrawn release is inaccessible. |
| Extension handoff | Explicit capture on the active tab, then user-selected colors inside a versioned bounded transfer. | Open Studio with validated swatches. Restricted pages display a local explanation. The sender's URL, pixels and browsing history are excluded. |

Use 400 for syntactically invalid input, 422 for semantic validation failure, 401 for missing credentials, 403 for a denied operation on an accessible object, and 404 when revealing a private object's existence would disclose it. Apply one policy consistently to comparable endpoints. Use request IDs in operational errors, structured field pointers for validation, and client-localized messages. Public catalog responses may be conditionally cached. Private project results, grant decisions and chat use private or no-store caching as appropriate.

## Platform-owned game data

Data access distinguishes ordinary Color Kitchen users from the existing game's player record. Use the existing provider or approved read models for identity, puzzle metadata, localized word resources, session presentation state, published results and leaderboard summaries. The developer preview consumes minimal authorized projections. The PostgreSQL design specifies candidate keys and the evidence to verify. Protect unreleased answers, player identity, private sessions and raw ranking data from portal users and AI clients. Membership in a Color Kitchen project grants access to its theme only.

Build contract tests with allowed, denied, missing and stale fixtures for all six families. Before enabling a real game, identify the owning service, stable tenant/game keys, data classification and permissions, and test cross-project isolation with two test tenants. Label the preview source. Full Phase 2 acceptance requires owner-approved live bindings for all six families in one agreed existing game, plus an observed player journey using the released theme in that game’s own client. Until those checks pass, report the specific missing binding and leave full phase acceptance open. A labeled sample preview can be deployed independently.

# Coding and technology standards

Use four practical patterns. A repository encapsulates a shared query or transaction and supplies a projection optimized for the caller. A use-case service holds a workflow used by multiple clients. A strategy function selects among genuinely different algorithms, such as gradient interpolation or export formats. An adapter isolates an external provider or browser-specific operation. Use a plain function or typed record for simple behavior. A new service, generic base class or network hop needs a concrete caller or measured operational reason.

Core types include immutable ColorValue, PaletteDocument, RoleBinding and ThemeRevision. Address swatches by stable ID and keep display order in a list. Use a map for role lookup. Keep high-precision coordinates, alpha and original space until rendering or export. Make cost proportional to changed values where practical. Debounce preview rendering during edits and cancel superseded image work. Never store locale-formatted numbers as canonical channels.

Use strict TypeScript. Parse unknown inputs once at a trust boundary, make enums closed and error outcomes explicit, and preserve backwards compatibility with versioned document migrations. Name use cases with verbs and entities with domain nouns. Name PostgreSQL columns in snake_case, application properties in camelCase and public exports according to the destination format. Use parameterized SQL, bounded page sizes, deterministic sorts and bulk reads for lists. Keep transactions short and acquire parent locks in a consistent order. Profile a slow query with representative fixtures before adding an index or cache.

Document changes with their module. A PR that changes an endpoint includes the contract and example, a migration includes upgrade/compatibility evidence, and a dependency change updates the lockfile and technology register. Record significant architecture decisions in short records naming the problem, decision, consequences, owner and trigger for reconsideration. Review dependency licenses and supported versions before adopting them.

| Component | Proposed default and reason | Version and ownership policy |
| --- | --- | --- |
| Web and server | TypeScript, React and Next.js on a supported Node.js LTS. Public pages can be rendered for search and tools can execute locally. | Pin actual versions, lockfile, Node image digest and supported browsers in the first foundation PR. Reuse the existing platform standard when verified. |
| Persistence | Existing PostgreSQL with SQL migrations and a typed PostgreSQL driver. Reuse the platform migration runner and pool settings after inspection. IndexedDB holds private device documents. | Record database major, migration head, key types, extensions, collation and owner. Test against the same database major. |
| Validation and interfaces | OpenAPI plus one runtime-validation schema per public shape. Zod and a typed SDK are candidates if compatible with the existing platform. | Schema owner tracks API, export and connector versions. Consumer tests gate breaking changes. |
| Color and localization | Shared deterministic color module with vetted conversion and interpolation primitives. ICU-compatible messages, Intl number/date formatting and language-aware search. | Pin color library and message formatter, fonts, provenance and licenses. Record numerical tolerances alongside fixtures. |
| UI and integration tests | Vitest or the platform's existing runner, real PostgreSQL fixture, Playwright and axe-core for automated checks, followed by manual assistive technology checks. | Record runner versions and browser images. Use fixtures and injected clocks/seeds for stable test outcomes. |
| Container and integrations | Docker or compatible OCI runtime, Compose for development, existing registry and TLS gateway. Use a supported, pinned MCP SDK and Chrome Manifest V3. | Application owner keeps runtime and provider matrix, environment variables, SBOM and upgrade cadence with the source. |

The technology register lives in docs/technology.md with component, purpose, actual pinned version, license, owner, consuming modules, security support policy and last verification. Proposed defaults in this document identify the baseline to validate. The implementation repository becomes authoritative once versions are installed and tested.

# Test driven development and traceability

For each change, name a requirement ID and write an executable expectation before implementation. Keep the failing test or CI evidence with the PR. Implement the smallest passing behavior, refactor for clarity and rerun the affected tests. A database constraint test may be the first failure. A provider boundary may begin with a failing contract fixture. When fixing a bug, first reproduce the observed behavior through its normal entry point.

| Test level | Where it runs | Example evidence |
| --- | --- | --- |
| Unit | Isolated domain plus application decisions with stable fixtures | A ratio just below 4.5 fails AA. A locked swatch survives generation. A viewer cannot authorize release. A role row still points to the same swatch after reorder. |
| Integration | Disposable real PostgreSQL, actual repository, migration runner and API handlers | Migrate from prior head. Two concurrent publishes produce one current release. Inject failure between data and audit writes and verify rollback. Two tenants cannot cross-read. |
| Functional | Real tool surface or client API with controlled provider responses | Compare v3 and v4 compiled exports, decline optional tracking, use a keyboard to move gradient stops, simulate an invalid AI response, import a legacy backup. |
| Use-case and E2E | Production-like running container with a browser and representative adapters | Guest creates a palette in French and exports. Owner and editor race on a theme. Admin fixes a missing translation, publishes and reverts. Consumer imports a versioned token file into a reference game view. |
| Release smoke | Actual live public entry points using isolated test content | Public URLs in all five locales, one real guided exchange, real contact intake, an authorized connector read and an installed extension capturing a color. Clean up synthetic records according to policy. |

Record each result in a compact trace matrix with requirement, test ID, fixture, level, responsible PR, latest green run and release evidence. Test names can begin with the requirement ID. Separate result status (planned / passing / failing / blocked) from product phase. The pull-request register carries design IDs and a failing fixture for each work item. The table below shows cross-layer journeys that must also pass as a whole.

| Acceptance ID and requirement coverage | Journey and failure case | Required outcome |
| --- | --- | --- |
| J01 • PUB-01, 04, 05, 06, 16 | Generate, lock, contrast-fix, preview, save, reload and export. Deny clipboard or device storage. | Locked values and semantic roles persist. Correct pair result and a working manual copy or backup path. |
| J02 • PUB-02, 03, 09, 13, 16 | Discover colors, sample a local image, compose a board and export. Try corrupt or all-transparent input. | No source pixels sent, original retained on failure and clean board export. |
| J03 • PUB-07, 10, 11, 12 | Open a gallery recipe, edit a transparent stop, sample and export both Tailwind targets. | Endpoints and sampled values agree with fixtures. Both pinned consumer projects compile. |
| J04 • PUB-08, 14, 15 | Ask in the selected language, choose font, copy styled/plain text and preview. Simulate timeout or a missing glyph. | Valid structured colors, honest fallback, intact plain text, visible font provenance and notices. |
| J05 • PUB-17, X-PRIV, X-LANG | Reject consent, use every class of tool, switch language, submit and retry a contact form. | Network boundaries hold, no double intake, published notices match selected locale. |
| J06 • DEV-01, X-DATA | Two editors revise the same game theme. Owner releases it to the project, then explicitly publishes or withdraws a release. | Stale edit cannot erase work. Project-only and public visibility follow recorded audience. Pinned member export is reproducible. |
| J07 • ADM-01, X-LANG | Staff prepare five translated versions, attempt an incomplete release, correct and publish, then revert. | Incomplete revision never leaks. The public receives one complete revision and the audit trail shows each authorized change. |
| J08 • MOB-01, X-ACC | On a phone, switch locale, open the software keyboard, edit a palette and share a file. Deny OS share or interrupt an edit. | Focus remains visible, draft survives and an alternative download/copy succeeds. |
| J09 • AI-01, EXT-01 | External client reads a permitted theme and retries after revocation. User captures from an allowed and a restricted tab. | Connector returns only released permitted data. Revocation is effective. Extension offers a local fallback for restricted pages. |
| J10 • X-TDD, X-OPS, X-DATA | Deploy candidate digest, migrate a previous database copy, interrupt migration and rehearse restore. | Single migration ownership, compatible previous container, tested recovery and a release evidence record. |
| J11 • DEV-01, X-DATA | In the agreed game’s client, a test player opens a themed puzzle, uses the approved word resource, completes a session and views the result and leaderboard. Exercise stale or missing source data and a cross-project denial. | All six approved bindings are observed under the correct tenant. The existing game calculates the score and ranks. The released theme changes presentation and preserves the recorded outcome. |

## Merge checks

Every PR runs type checking, lint, relevant unit and integration tests and a reproducible build. Enforce import boundaries for UI, application, domain and data packages. Run export fixtures on format changes, message-key/placeholders checks on all locale changes, real Postgres constraint and migration tests on data changes, and contract compatibility checks on API changes. Security checks cover dependencies, secrets and container artifacts. An SQL-bearing change requires a data owner or qualified reviewer. Record any accepted exception with owner and expiry.

Before a release, run the full end-to-end matrix in all five locales for critical tasks and a broader representative feature suite across supported desktop and mobile browsers. Include accessibility automation, keyboard and assistive technology review, privacy network tests, resource/latency checks and forward upgrade from supported data. A stubbed provider can establish deterministic behavior in CI. Live acceptance separately verifies the selected production integration without transmitting private user material.

# Container delivery and recovery

The production deployable is a stateless OCI web image. Build in separate dependency, compilation and runtime stages. Use a supported pinned base and non-root runtime user. Store no credentials or user assets in layers. Serve the localized public site, admin and project interfaces from the same application modules. The server is the only application component that connects to PostgreSQL. Keep the connector in the same deployable unless an actual runtime or scaling requirement justifies a split. Publish the Chrome extension as a separately built versioned package.

**Development.** A clean checkout can start a web container, a disposable PostgreSQL service at the platform's verified major version and optional provider fakes through Compose. A persistent named development volume is optional. Develop against representative sanitized schema fixtures. The development Compose file never points at production by default. Use a one-off migration job, seed all five locales, wait for readiness and run contracted workflows. Document local start, test, reseed and backup/export commands once script names exist.

**CI and staging.** Build once per commit, scan and sign or attest per platform policy, then publish the immutable digest to the registry. Start a clean database and a previous-version fixture, apply the phase-specific migration sequence and run real integration tests. In staging, connect the same image to staging PostgreSQL with a restricted application identity. Rehearse rolling promotion, migration failure, restart during a read and provider outages. [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/) · [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/)

**Production.** Use an approved container host, HTTPS ingress, runtime secrets, bounded database pool, request timeouts, graceful SIGTERM drain and auditable releases. Run migration once under a separate identity and shared migration lock. Application replicas start only after the compatibility check passes. Liveness checks process health. Readiness checks supported schema level and critical connectivity with timeouts. Provider or ad outages degrade their own feature and cannot reset the whole service. Use object or CDN storage only for permitted public assets. Verify localization, explicit consent and privacy route isolation on the public hostname.

**Rollback.** Capture previous application digest, schema head, release pointers and a verified restore point before live migration. Use additive expand, backfill and switch first. Remove obsolete columns in a later release only after old readers are retired. On app failure, shift traffic to the compatible previous digest. On catalog error, return the published pointer to a complete sealed revision. For data damage, stop writes to the affected module, restore into an isolated database and validate rows, grants and checksums before selective recovery. Restoring the entire existing shared database in place requires its owner's incident procedure. [PostgreSQL backup and recovery](https://www.postgresql.org/docs/current/backup.html)

**Operational evidence.** Collect aggregate error rates and latency for public catalog, API, export and hosted Guide; processor memory for local image tests; pool saturation; consent and ad-slot failures; connector authorization denials without raw tokens. Record AI spend and advertising income separately. Browsing and edits must remain responsive during dependency failures. Proposed targets are field p75 LCP ≤ 2.5 seconds, INP ≤ 200 ms, CLS ≤ 0.1, and ordinary five-color generation under 100 ms on the recorded reference device. For hosted catalog reads propose p95 ≤ 300 ms at an agreed staging load with the fixture size, concurrency, hardware and cache state documented. Profile regressions before adding infrastructure. [Core Web Vitals](https://web.dev/articles/vitals)

## Phase release records

Phase 1 prerequisites are permission to inspect the existing database, catalog and font rights, the five translated content sets, a working hosted model/contact path, production domain/TLS and an approved advertising/consent configuration. Attach a real production journey, locale crawl, privacy trace, artifact exports, classification of any defects, image digest, schema version and rollback result. Mark complete only once the entire specified public website is usable.

Phase 2 additionally requires project/account mapping with the platform identity owner, staff permissions, confirmed release visibility rules, OAuth client registration and scope, an authorized test tenant, extension publisher access and a supported device/browser matrix. Attach owner/editor/viewer journeys, staff publication and rollback, current-member and revoked-connector results, mobile-device evidence and a successful extension installation from the agreed distribution channel. Confirm Phase 1 regression checks on the shared production release. Attach approved live evidence for each of the six source contracts and the player journey in the agreed game client. Keep full Phase 2 acceptance open for every outstanding binding or missing journey.

# Pull request register

The following register translates the design into independently reviewable changes. Read each gate in order within its phase. The gate order defines dependencies even where several small PRs within a gate can be developed concurrently. The last PR of each phase is a working release with recorded production evidence.

| Review gate | Phase 1 | Phase 2 |
| --- | --- | --- |
| Database and storage | P1-01 to P1-04 | P2-01 to P2-04 |
| Data access | P1-05 to P1-08 | P2-05 to P2-08 |
| Domain rules | P1-09 to P1-16 | P2-09 to P2-12 |
| Application services | P1-17 to P1-23 | P2-13 to P2-16 |
| APIs and client contracts | P1-24 to P1-28 | P2-17 to P2-20 |
| Presentation | P1-29 to P1-39 | P2-21 to P2-24 |
| Verify and release | P1-40 to P1-41 | P2-25 to P2-27 |

## How to schedule and review these PRs

The backlog contains 68 PRs: 41 in Phase 1 and 27 in Phase 2. Each numbered heading is one proposed pull request. Each entry names its requirement, direct dependencies, bounded task list, first failing test and definition of done. Within each phase the gates run in order. **Every PR implicitly depends on every PR in the preceding gate.** The dependency line lists additional or particularly relevant predecessors. Entries in the same gate can run in parallel unless they explicitly depend on one another. The deployment PRs identify which component may go live under the team's normal approval process. Phase 2 web/connector and store distribution have separate release checks.

Start each behavior change by recording a failing test against the desired result, implement the smallest change that makes it pass, then refactor. For a migration, capture the failing constraint, upgrade or restore check against an isolated database first. For an operational PR, exercise the failure in staging and retain its evidence. A merged PR includes its fixtures, trace IDs and relevant schema or interface documentation. A frontend PR can assemble existing services through the approved API and must not create SQL, duplicate business rules or quietly add another endpoint. A layer defect returns to its owning layer for a focused prerequisite fix.

Screen numbers refer to the original 20-screen mockup set. Screens 01–16 and 18–20 guide Phase 1. Screen 17 guides the Phase 2 Chrome extension. Screen 19 is evidence for the accessible responsive baseline in Phase 1. Phase 2 adds dedicated mobile improvements on top of it. The functional design is authoritative for tool behavior. Paths and implementation groupings in this backlog are proposed boundaries.

## Phase 1 public website

### Gate 1. Database and local storage design

#### P1-01 · Create the PostgreSQL migration baseline

Scope and work — X-DATA, X-TDD, X-OPS. Before any migration on a shared system, run the companion read-only PostgreSQL inventory on the authorized target. Record matching migration heads, schema ownership, accounts and RBAC, relevant relations, dependencies/extensions and backup/restore ownership. Resolve or explicitly block each potential conflict with the system owner. Establish repeatable local/test provisioning, migration ordering and the CI job that upgrades a blank database and a previous fixture. Set UTC timestamp and identifier conventions. This is the only bootstrap work bundled into the initial database PR.

Depends on — Phase 1 entry. First failing check — A clean checkout cannot provision the baseline and safely rerun the migration runner. Done when — CI records the schema revision after clean and repeat runs, documents restoration and includes the verified inventory/reuse map for shared deployment. Local development can proceed on an isolated schema while an unknown shared binding remains open.

#### P1-02 · Model public catalog content and five-locale releases

Scope and work — PUB-02, PUB-09, PUB-10, PUB-14, PUB-17, X-LANG, X-DATA. Define the proposed `ck.catalog_item`, `ck.catalog_revision` and `ck.catalog_text` or reuse an approved equivalent. Include type-specific payloads, source/license metadata, publication pointers and localized rows. Represent stable IDs independently of translated labels, public slugs and aliases. Include public metadata and legal page versions in the localized catalog records. Constrain locale codes to en/fr/es/pt/de using the approved schema convention. A publish-time check requires exactly one current text row per required locale, plus normal uniqueness and lookup indexes. UI translations compile from version-controlled bundles outside SQL.

Depends on — P1-01. First failing check — Two released entries can claim the same locale and public slug, or a translated content row references a missing revision. Done when — Constraints reject the invalid fixtures, an upgrade preserves the previous fixture and example public records join correctly across all locales.

#### P1-03 · Model minimal operational data and retention

Scope and work — PUB-02, PUB-08, PUB-17, X-DATA, X-PRIV. Use `ck.contact_request` as the idempotent intake/delivery queue, with a unique replay key, delivery/status fields, retry state and expiry. Model coarse public popularity counters. Prefer an available gateway/provider shared limiter for time-bounded service budgets; add a dedicated store only when the deployment inventory shows no equivalent. Configure data classes, indexes and expiration. Keep source images, palette drafts and conversation bodies out of operational counters. Use the consent platform's supported evidence path where applicable.

Depends on — P1-01. First failing check — Duplicate delivery keys create two queue records or an expired queue record survives its retention job. Done when — Migration tests verify queue deduplication and expiry and the retention inventory names the owner of each stored field.

#### P1-04 · Version browser document and asset storage

Scope and work — PUB-01, PUB-03, PUB-11, PUB-13, PUB-16, X-DATA, X-PRIV. Define IndexedDB stores and indexes for documents, collections and explicitly retained asset blobs, plus migrations from older supported versions. Specify stable color IDs, role references, gradients, optional assets, document revision and backup-envelope versions.

Depends on — Phase 1 entry. First failing check — An upgrade loses an assigned color role or disconnects a saved image from its board. Done when — Fresh and upgrade fixtures preserve relationships and a blocked migration leaves the previous data recoverable.

### Gate 2. Repositories and data adapters

#### P1-05 · Import and retrieve original catalog content

Scope and work — PUB-02, PUB-09, PUB-10, PUB-14, X-DATA. Create a repeatable seed importer and public catalog repository for released item/revision/text records. Normalize palette and gradient definitions, source color names appropriately, and pin font sources, versions, coverage, notices and checksums. Define public projections, stable pagination and bounded search inputs.

Depends on — P1-02. First failing check — A seed rerun duplicates a collection or an unlicensed font enters the public dataset. Done when — Repeat imports are idempotent, drafts are excluded from the public projection and every seed has a provenance record.

#### P1-06 · Load complete localized bundles and release metadata

Scope and work — X-LANG, PUB-17. Implement two separately tested adapters. Compile version-controlled UI messages, instructions and errors into en/fr/es/pt/de bundles with CI checks for placeholders, plurals and complete key coverage. Use SQL repositories for five localized public text rows per catalog/policy revision, including titles, descriptions and metadata. Publish a content/locale release only with validated coverage in both sources. Phase 2 administrators edit catalog and policy translations; changing compiled UI copy goes through the normal reviewed code and build pipeline. Preserve authored typeface names, HEX values and code literals. Package a known-good released translation bundle for recovery.

Depends on — P1-02. First failing check — The Portuguese consent text loses a substitution parameter or the German bundle omits the contrast error. Done when — The importer rejects the incomplete release without changing the published pointer, and all five complete fixtures round-trip.

#### P1-07 · Implement the operational repositories

Scope and work — PUB-02, PUB-08, PUB-17, X-PRIV, X-OPS. Implement repositories for aggregated public activity and `ck.contact_request` intake, claim, delivery status, deduplication and expiry. Adapt the approved shared limiter for atomic budget reservations. Use a SQL limiter only when the chosen environment requires it. Add expiration routines, allowed event fields and transactions. Keep delivery credentials and model configuration outside the database records returned to clients.

Depends on — P1-03. First failing check — Two concurrent requests overspend the same remaining budget or a replay creates a second contact delivery. Done when — Real-database tests cover queue races, duplicates, cleanup and retries, and contract tests against the chosen shared limiter verify atomic budget decisions.

#### P1-08 · Persist collections and recover browser storage errors

Scope and work — PUB-01, PUB-03, PUB-13, PUB-16, X-DATA, X-PRIV. Implement local document, asset and preference repositories. Write document and asset references atomically. Add revision checks, deletion, used-asset cleanup and typed responses for storage denial, conflict or quota exhaustion.

Depends on — P1-04. First failing check — A failed blob write leaves a board marked saved or a second tab silently overwrites a newer version. Done when — Browser integration tests prove atomicity, conflict reporting and a recoverable in-memory editing path.

### Gate 3. Isolated domain and business rules

#### P1-09 · Implement color conversion and contrast calculations

Scope and work — PUB-04, PUB-06, X-ACC. Parse supported color inputs, preserve original precision and alpha, calculate named sRGB fallbacks and gamut warnings, and evaluate foreground/background pairs over an explicit backing surface. Define AA and AAA results, text categories, pair-specific fix options and helper operations for tints, shades and harmonies.

Depends on — Gate 2. First failing check — A ratio just below 4.5 passes after rounding, or a translucent pair is assessed without a defined opaque backdrop. Done when — Black/white, identical colors, threshold, transparency and wide-gamut fixtures pass with no browser or database dependency.

#### P1-10 · Implement palette generation and document revisions

Scope and work — PUB-01, PUB-05, PUB-16. Implement 2–12 swatches, deterministic seeds, harmony/constraint modes, adjustment, locks, add/remove/duplicate/reorder, stable IDs, role assignment, and atomic undo/redo transactions. Preserve locks and role identity across switches and generation.

Depends on — P1-09. First failing check — Generation with all colors locked changes a value or reordering changes the color assigned to text. Done when — Invariant tests pass across generation modes and undo restores the complete prior document.

#### P1-11 · Implement continuous gradients and discrete sampling

Scope and work — PUB-10, PUB-11, PUB-12. Define linear, radial and conic geometry, stop order and positions, hard edges, opacity and selected interpolation. Sample the complete function into 2–12 points including endpoints. Match CSS premultiplied-alpha and supported hue paths. Define faithful SVG capabilities and explicit fallbacks.

Depends on — P1-09. First failing check — A multi-stop gradient sampled at a hard edge ignores its middle stop or a transparent colored stop darkens the wrong channels. Done when — Endpoints, ties, reverse order and alpha fixtures agree with a browser reference for the supported modes.

#### P1-12 · Implement deterministic local image sampling

Scope and work — PUB-03, PUB-13, X-PRIV. Implement downsampling, dominant/balanced extraction, selected-region and coordinate sampling on bounded pixel buffers. Define fully transparent and partially transparent behavior, deterministic results and error types for unusable input.

Depends on — P1-09. First failing check — Transparent padding dominates the palette or input with no usable pixels returns invented colors. Done when — Known synthetic images produce expected swatches and no domain code requires file, network or worker access.

#### P1-13 · Define preview roles and moodboard composition

Scope and work — PUB-05, PUB-13. Define original template role slots, component-to-role mapping, variant selection and provable pair checks. Define moodboard composition data for layouts, crop/position, spacing, caption, swatch strip, clean bounds and output dimensions.

Depends on — P1-09, P1-10. First failing check — Reordering the source palette changes a preview's body text or crop coordinates extend beyond the image. Done when — Pure layout and role fixtures cover light/dark templates, portrait crops and export bounds.

#### P1-14 · Implement Tailwind scales and versioned tokens

Scope and work — PUB-07. Generate 50–950 scales with a chosen fixed base, preserve manual overrides, normalize collision-safe names, and emit v4 theme variables and v3 extended configuration. Support declared sRGB and OKLCH output and check actual example pairs.

Depends on — P1-09, P1-10. First failing check — Pinning the base at 700 moves its value or a duplicate token name overwrites an existing family. Done when — Fixtures retain the base and the output compiles with pinned representative v3 and v4 projects.

#### P1-15 · Implement font selection and styled-text transforms

Scope and work — PUB-14, PUB-15, X-LANG, X-ACC. Define available font weights, axes, script coverage and fallback rules. Generate decorative text using supported character mappings, preserve grapheme clusters, and retain the original for plain-text copy. Define typography settings and CSS output independently of rendering.

Depends on — P1-05. First failing check — An unsupported accented grapheme, emoji family or non-Latin input is lost during styling. Done when — Multilingual fixtures preserve the source text, partial coverage is reported and requested axes are validated against the manifest.

#### P1-16 · Define catalog ranking and locale resolution

Scope and work — PUB-02, PUB-09, PUB-10, PUB-14, X-LANG. Define typed facets, family/name/HEX matching, deterministic pagination, Featured and Popular sorting using a published window and qualifying events, plus transparent cold-start behavior. Define explicit locale selection precedence, stable item IDs and fallback behavior for unsupported locale requests.

Depends on — P1-05, P1-06, P1-07. First failing check — Zero activity is reported as a popular vote or selecting French is overwritten by browser language on the next view. Done when — Deterministic fixture order, required-locale behavior and language switching tests pass. A missing promised translation remains a release error.

### Gate 4. Application services and orchestration

#### P1-17 · Orchestrate the shared workspace and local collection

Scope and work — PUB-01, PUB-04, PUB-05, PUB-16. Implement commands for edits, role changes, check/fix, undo/redo, save, duplicate, delete/undo, import preview and navigation handoff through the repository interfaces. Preserve originals when opening a copy and surface storage failures to callers.

Depends on — P1-08, P1-09, P1-10, P1-13. First failing check — Applying a contrast fix is impossible to undo as one change or a failed save returns success. Done when — Use-case tests cover both recovery and exact preservation of locks, roles and versioned values.

#### P1-18 · Deliver localized catalog views and public popularity

Scope and work — PUB-02, PUB-09, PUB-10, PUB-14, PUB-17, X-LANG, X-PRIV. Compose catalog, translation, ranking and policy repositories into localized detail, listing, policy and metadata queries. Fold eligible public events into the documented ranking window. Never publish local favorites, names or private activity as public votes.

Depends on — P1-05, P1-06, P1-07, P1-16. First failing check — A French detail view inherits an English page title or a private item generates a public counter. Done when — Fixtures return coherent released content, stable cursors and only aggregate approved events.

#### P1-19 · Orchestrate local image, preview and moodboard jobs

Scope and work — PUB-03, PUB-05, PUB-13, X-PRIV. Adapt real image decoders, input size/dimension checks, browser workers, cancellation, bounded memory, original template rendering and raster composition. Keep source assets in memory unless the user explicitly saves a board locally. Provide keyboard-equivalent sample and crop commands.

Depends on — P1-08, P1-12, P1-13. First failing check — Canceling a long extraction overwrites the last palette or a resized image reports sample coordinates against the wrong resolution. Done when — Worker and simulated-image fixtures cover cancel/retry, size rejection and allocation cleanup with no upload.

#### P1-20 · Deliver the free conversational Color Guide

Scope and work — PUB-08, X-LANG, X-PRIV, X-OPS. Orchestrate an anonymous hosted model with selected color context, chosen language, bounded history, uniform burst/budget controls and explicit user submission. Add a separate, labeled local suggestion mode. Validate structured colors and deterministic numeric claims before returning suggestions.

Depends on — P1-07, P1-09, P1-10. First failing check — A timeout loses the draft, local guidance masquerades as hosted chat or model text overrides an independently computed contrast result. Done when — Fake-provider success, invalid output, timeout and budget scenarios pass in all supported languages and draft data is excluded from operational logs.

#### P1-21 · Orchestrate public support, consent and ad eligibility

Scope and work — PUB-17, X-LANG, X-PRIV. Route contact and advertising inquiries through validated delivery with retry/deduplication. Combine route, viewport and consent decisions into an ad eligibility service with fail-closed defaults. Keep programmatic scripts out of private image, board, chat, collection and exported surfaces. Provide an adapter that can update or withdraw consent.

Depends on — P1-06, P1-07. First failing check — Rejecting optional tracking permits an optional network unit or a provider timeout duplicates an inquiry. Done when — A route × consent decision table and delivery replay tests pass, including navigation from an ad-enabled page into a private workspace.

#### P1-22 · Deliver lossless backup, safe sharing and machine-readable exports

Scope and work — PUB-01, PUB-07, PUB-11, PUB-12, PUB-16, X-DATA, X-PRIV. Implement versioned document/collection JSON, bounded palette share fragments, HEX/RGB/HSL/OKLCH lists, palette CSS variables, gradient CSS and Tailwind exports. Distinguish share data from full backups, include referenced colors, validate imports before mutation and show copied content when clipboard access fails.

Depends on — P1-08, P1-09, P1-10, P1-11, P1-14, P1-17. First failing check — A share link leaks the image filename or an invalid role reference partially mutates a saved collection. Done when — Round-trip, malformed, oversized and old-version fixtures pass and opt-in assets are carried or explicitly listed in backups.

#### P1-23 · Implement rendered exports and swatch interoperability

Scope and work — PUB-03, PUB-05, PUB-11, PUB-13, PUB-15, PUB-16. Render PNG, supported JPEG, SVG swatches, faithfully representable gradient SVG, palette/board PDF and Adobe Swatch Exchange. Include role-token/preview output and typography CSS/image. Publish each format's supported alpha and gamut, offer explicit backing/fallback choices, exclude UI and advertisements, and produce a text companion where needed.

Depends on — P1-09, P1-11, P1-13, P1-15, P1-19, P1-22. First failing check — Transparent swatches lose alpha in an opaque-only export without user choice, or a conic gradient silently becomes linear SVG. Done when — Real readers/parsers open representative artifacts, ASE colors round-trip within declared precision, and browser render comparisons cover alpha, hard stops and export boundaries.

### Gate 5. HTTP APIs and browser-local interfaces

#### P1-24 · Expose read-only public catalog and locale HTTP routes

Scope and work — PUB-02, PUB-09, PUB-10, PUB-14, PUB-17, X-LANG. Expose versioned public HTTP representations for listing/detail queries, released locale bundles and published policies. Specify supported filter/cursor grammar, locale selection, content language, cache variation and error envelopes. Publish actual examples for each locale, including a missing item and unsupported locale.

Depends on — P1-18. First failing check — A second locale receives a cached first-locale response, or a draft resolves by guessing its ID. Done when — A client hits a running HTTP server with the real repository and verifies status, content, locale, headers, caching and visibility.

#### P1-25 · Expose the anonymous Color Guide HTTP contract

Scope and work — PUB-08, X-LANG, X-PRIV. Add a browser-callable POST for prompt, explicit color context, bounded history and locale. Return validated suggestions with a request ID, typed errors, and retry information. Protect provider credentials on the server. The Phase 2 external connector has a different purpose, audience and access contract.

Depends on — P1-20. First failing check — A client can send an oversized context, receive successful malformed suggestions or learn private provider configuration. Done when — Real HTTP tests exercise success, validation, throttling and upstream timeout using a deterministic test provider, with anonymous access in every locale.

#### P1-26 · Expose inquiry and aggregate-event HTTP contracts

Scope and work — PUB-02, PUB-17, X-PRIV. Provide validated support/advertising inquiry endpoints, a bounded event intake for eligible public catalog activity and any necessary first-party consent adapter callbacks. Define idempotency, allowed fields, status codes and errors. Keep advertising delivery independent of editing.

Depends on — P1-18, P1-21. First failing check — Sending the same support request twice results in two deliveries, or event intake accepts a free-text private palette name. Done when — HTTP tests capture one accepted delivery, rejected fields, no private event payload and consent-dependent network behavior.

#### P1-27 · Publish the browser-local palette and editing API

Scope and work — PUB-01, PUB-04, PUB-05, PUB-06, PUB-07, PUB-11, PUB-12, PUB-16. Expose typed browser commands and queries for shared palette edits, gradient editing/sampling, color inspection, contrast, semantic preview and Tailwind. Define snapshots, revision conflicts and localized error IDs. Require explicit apply for any generated change to an existing palette.

Depends on — P1-17, P1-22. First failing check — A stale browser command succeeds on an advanced revision or a suggested fix alters a locked color without confirmation. Done when — Consumer tests exercise only the public local API, preserve state through tool handoffs and make zero HTTP calls for local color math.

#### P1-28 · Publish the browser-local media, type and export API

Scope and work — PUB-03, PUB-05, PUB-13, PUB-14, PUB-15, PUB-16. Expose worker job handles, progress/cancel, crop/point coordinates, font/type-preview queries, export capability discovery, shared collection, backup/restore and file/clipboard operations. Report unavailable or unloaded offline dependencies accurately. Keep raw image bytes and private previews inside the browser.

Depends on — P1-19, P1-22, P1-23. First failing check — A canceled job emits a late success or a local export posts source pixels to an external URL. Done when — Browser contract tests observe actual worker cancellation, blocked-clipboard fallback, round-trip backups and zero private-payload egress.

### Gate 6. Public user interfaces

#### P1-29 · Build the localized responsive shell and home

Scope and work — X-LANG, X-ACC, PUB-17. Implement home (screen 01), Create/Explore/Browser tools navigation, accessible footer, skip links, focus restoration and language selection. Localize titles, help and errors while preserving the active document. Render indexable public pages and alternate language links. Pre-release navigation identifies extension availability accurately.

Depends on — P1-24, P1-27, P1-28. First failing check — Changing from Spanish to German loses the palette or a keyboard user cannot reach the first tool at 320 CSS pixels. Done when — Real browsers exercise all five home routes, correct language metadata, reflow and basic keyboard/touch navigation.

#### P1-30 · Build Palette Studio on desktop and mobile

Scope and work — PUB-01, X-ACC. Implement screen 02 and mobile screen 19. Provide visible generation, swatch fields, lock state, non-drag reordering, role assignment, constrained generation and undo. Restrict the optional Space shortcut to its intended focus context and prevent repeating flashes.

Depends on — P1-27, P1-29. First failing check — Pressing Space in a name field regenerates colors or a touch user cannot move a locked swatch. Done when — Keyboard and touch journeys generate, lock, reorder and recover without losing values or requiring an account.

#### P1-31 · Build My Collection and the shared export drawer

Scope and work — PUB-16, X-ACC, X-PRIV. Implement screen 18, local saves, search, tags, duplicate, delete/undo, explicit asset preservation, previewed backup import, portable share and every supported export. Surface per-format alpha/gamut consequences, private-link contents, storage denial and selectable text fallback.

Depends on — P1-27, P1-28, P1-29. First failing check — An imported backup overwrites existing work without review or an export silently drops transparency. Done when — A visitor saves, reloads, shares and reopens an equivalent palette, exports actual artifacts and can recover after a denied write.

#### P1-32 · Build Image to Palette and Moodboard Maker

Scope and work — PUB-03, PUB-13, X-ACC, X-PRIV. Build screens 04 and 14. Wire a file picker, permitted paste, an original sample image, progress, sample count, region/point inputs, composition layouts and clean output. Keep selection, crop and output options usable with keyboard and touch. Display source-image handling in the active task.

Depends on — P1-28, P1-29, P1-31. First failing check — After a file error the prior palette disappears, or a keyboard user cannot position the crop. Done when — A real image produces an editable palette and exportable board, with measured zero image egress and no script delivery from the ad provider on these routes.

#### P1-33 · Build Contrast Lab and Color Inspector

Scope and work — PUB-04, PUB-06, X-ACC. Build screens 05 and 07 with direct input, typed channels, alpha/backing controls, threshold-specific results and reversible suggestions. Provide an optional screen picker with explicit activation and manual or image alternatives. Offer numerical descriptions beside swatches.

Depends on — P1-27, P1-29. First failing check — A displayed rounded ratio gives the wrong threshold outcome or canceling screen capture loses a typed color. Done when — Keyboard-only users can inspect a color, test a pair, preview a fix, apply it and undo it with announced results.

#### P1-34 · Build Design Preview and Tailwind Studio

Scope and work — PUB-05, PUB-07, X-ACC. Implement screens 06 and 08. Render original templates with consistent role mapping, responsive preview sizes and pair inspection. Offer version-labeled Tailwind output, base pinning, overrides, compile-checked examples, and export of role tokens or a preview image.

Depends on — P1-27, P1-28, P1-29, P1-31. First failing check — Switching from v3 to v4 leaves a v3 configuration snippet or changing the template remaps role IDs silently. Done when — A visitor applies one palette to both previews and exports the selected version without re-entering colors.

#### P1-35 · Build Palette Gallery, Gradient Gallery and Color Atlas

Scope and work — PUB-02, PUB-09, PUB-10, X-LANG, X-ACC. Implement discovery screens 03, 10 and 11. Reuse filters, paged results and detail layouts. Provide clear next actions, source/license context, empty states and visible cold-start Featured sorting. Label exact color names versus a nearest match.

Depends on — P1-24, P1-27, P1-29. First failing check — Editing a gallery item destroys the open working copy or an empty filter offers no recovery. Done when — Localized searches, URL back/forward, copy/save and edit handoffs work by keyboard on all three catalogs.

#### P1-36 · Build Gradient Studio and Gradient Steps

Scope and work — PUB-11, PUB-12, X-ACC. Implement screens 12 and 13 for continuous gradients and discrete swatches. Expose labeled numeric positions, color/opacity editing, interpolation, direction, count, hard edges, CSS preview and explicit sampling handoff.

Depends on — P1-27, P1-28, P1-29, P1-31. First failing check — A keyboard-only visitor cannot edit coincident stops or moving from Studio to Steps ignores an intermediate stop. Done when — The UI can author, sample, reverse and export a gradient that agrees with the approved visual fixtures.

#### P1-37 · Build Font Library and Type Playground

Scope and work — PUB-14, PUB-15, X-LANG, X-ACC. Implement screens 15 and 16. Show real licensed font previews and notices, script coverage, selectable family/weight, a typography preview and CSS/image export. Decorative text has per-result Copy, Copy plain text, coverage feedback and readable instructions.

Depends on — P1-24, P1-28, P1-29. First failing check — A font preview silently displays a fallback as the selected font or accents are lost in copied plain text. Done when — Multilingual strict-copy fixtures, font-load failure and license/download links work on mobile and desktop.

#### P1-38 · Build the public Color Guide conversation

Scope and work — PUB-08, X-ACC, X-LANG, X-PRIV. Implement screen 09 with explicit hosted/local mode, prompt submission, optional palette context, follow-ups and suggestion preview/apply. Preserve the draft across network failure. Keep free access and the actual operating limits clear.

Depends on — P1-25, P1-27, P1-29. First failing check — The first network call includes an image, filename or unselected context, or a timeout clears the draft. Done when — Anonymous multi-turn examples work per locale, local and hosted modes are distinguishable, all numeric results use the color engine and suggestions can be undone.

#### P1-39 · Ship policy pages, cookie choices, inquiries and public ad slots

Scope and work — PUB-17, X-PRIV, X-ACC, X-LANG. Build Usage and Licensing, Terms of Use, Privacy Notice, Cookie Notice, Cookie Preferences (screen 20), Advertise with Us and Get in Touch. Wire real consent and inquiry adapters, route eligibility, stable ad placement, no-fill behavior and privacy-preserving transitions. Link the active policy version per locale.

Depends on — P1-24, P1-26, P1-29. First failing check — Rejecting optional tracking blocks export, a pre-consent route loads an unauthorized script or an unfilled slot moves a control under the pointer. Done when — All seven destinations and post-withdrawal network behavior are verified in five locales, with keyboard-accessible choices and successful and failed inquiry flows.

### Gate 7. Verification and deployment

#### P1-40 · Rehearse migrations, release and rollback in staging

Scope and work — X-TDD, X-DATA, X-LANG, X-ACC, X-PRIV, X-OPS. Run the full public acceptance suite against the deployed release candidate using representative PostgreSQL and browser-storage fixtures. Check all five locales, stage-only approved vendor integrations, output readers, real HTTP behavior, assistive technology, 320px reflow, 400% zoom, performance with ads and no private egress. Rehearse restoration using non-production data.

Depends on — P1-29 through P1-39. First failing check — A deliberately incomplete locale bundle, failing parser fixture or private ad request must block promotion. Done when — A versioned evidence report identifies the complete candidate, database and content versions, measured global checks, owners and a successfully exercised rollback path.

#### P1-41 · Release and verify the complete public website

Scope and work — PUB-01 through PUB-17, X-OPS. Ship an approved web build and verified locale/content release after additive migrations. Use a limited rollout with health and cost checks. Run browser smoke tests against the public host in all five locales. Document how to revert the build/content pointer and preserve compatible writes before considering a restore.

Depends on — P1-40. First failing check — A staging exercise pauses promotion for failed localized navigation, repeated API errors or a private-data egress regression and restores the last good build. Done when — Public tools, free Guide, clean exports, consent and inquiries pass on the production host, the status owner records evidence and no revenue, accessibility or store-approval claims exceed the evidence.

### Phase 1 release evidence

| Accountable reviewer | Evidence attached to the production release record |
| --- | --- |
| Product and localization | Successful anonymous generation, discovery, validation, save and export at the live URL. Critical journeys and the seven public notices work in all five locales. |
| Design and accessibility | Desktop keyboard and assistive-technology walkthrough, tested narrow viewport and zoom, focus order around an advertisement, and error recovery for an upload and a clipboard denial. |
| Privacy and operations | Network traces for rejected and withdrawn consent, a failed ad load and a protected local workspace. Hosted Guide and contact intake reach the approved providers. |
| Platform and data | Container digest and migration head, verified database reuse, a repeatable upgrade, compatible prior image and evidence from the restore rehearsal. |

Record the reviewer, date, environment, result and supporting test run for each row. A failed public workflow keeps Phase 1 open.

## Phase 2 portals, mobile, connector and Chrome

Use the Phase 1 public contracts as the compatibility baseline. Project membership controls access to private developer work. Staff permissions protect the operations that change the public catalog. These permissions apply to ownership and publication and introduce no charge for using a feature. Reuse the platform's verified identity, tenancy and canonical records where available. Before introducing or binding a schema, record the deployed platform schema version, owner, fields, supported interface and relevant permission. A privileged portal action uses an authorization decision even when its navigation control is hidden. The repository snapshot at commit `e30ea886dfc07fa05067c551ffeabe5b863d9140` contains only a README, so the example table names are proposals. Unknown upstream interfaces stay explicitly unbound.

### Gate 1. Database extensions and storage boundaries

#### P2-01 · Model project identity and role membership

Scope and work — DEV-01, ADM-01, X-DATA, X-PRIV. Map verified platform subject and organization IDs, then add Color Kitchen-owned project and membership records (proposed `ck.project` and `ck.project_member`) only where the platform provides no equivalent. Define owner, editor and viewer roles, scoped uniqueness, inactive membership and lifecycle rules. Keep staff catalog roles distinct from developer roles.

Depends on — P1-41. First failing check — The same member gains an unintended role in another project or the last active owner may be removed without a replacement. Done when — Upgrade fixtures preserve public data, enforce the ownership model and document the platform-to-Color-Kitchen ID boundary.

#### P2-02 · Model game theme assets and immutable releases

Scope and work — DEV-01, AI-01, X-DATA. Define project-owned assets, append-only revisions and release pointers (proposed `ck.asset`, `ck.asset_revision`, `ck.asset_release`). Store validated game-theme roles/tokens and provenance with a versioned palette reference or frozen snapshot. Bind asset/project/revision through referential constraints and record optimistic concurrency tokens. Default release audience to project. Persist current release, explicit public audience and withdrawal state independently from immutable revision content. Add transactional `ck.command_receipt` or its verified shared equivalent. A partial unique key permits one active release per asset while retaining every withdrawn release, including repeated publication of the same saved revision.

Depends on — P2-01. First failing check — A release in project A points to a revision in B or an exported release changes when a later draft is edited. Done when — Cross-project references fail and immutable releases remain readable through the migration and current schema.

#### P2-03 · Model catalog drafts, translations, approval and audit

Scope and work — ADM-01, X-DATA, X-LANG, X-PRIV. Extend Phase 1 catalog records with proposed `ck.catalog_item`, `ck.catalog_revision`, `ck.catalog_text` and an append-only `ck.audit_event` or equivalent reused tables. Track language coverage, reviewer state, publish/rollback pointers and revision history. Backfill existing public content as the initial published revision, preserving URLs and slugs.

Depends on — P1-02, P2-01. First failing check — Migrating a published Spanish page changes its public ID or moving a publish pointer loses history. Done when — Before/after public fixtures match across five languages and draft/public/audit retention rules are documented.

#### P2-04 · Model scoped grants and extension-local state

Scope and work — AI-01, EXT-01, X-DATA, X-PRIV. Map grant metadata to the verified identity provider and define the minimum local binding to approved project/assets, release visibility, scopes, expiry and revocation. Use existing token storage where supported. Bind the required `project:read` scope to selected projects; membership is checked again at request time. Version the extension's own storage for user-selected values/settings. Keep raw browser pages and private game records out of these stores.

Depends on — P2-01, P2-02. First failing check — A revoked grant still resolves as current or upgrading an extension fixture drops its chosen palette. Done when — Grant lookup/expiry constraints and local extension migration fixtures pass with an inventory that separates browser and server state.

### Gate 2. Repositories and upstream contracts

#### P2-05 · Implement project and theme repositories

Scope and work — DEV-01, X-DATA, X-PRIV. Implement identity mapping, membership lookup, project-scoped asset lists, committed revision reads for viewers, compare-and-swap edits and transactional current release and withdrawal pointers. Provide an anonymous projection restricted to the current public, unwithdrawn release; retain immutable internal history. Return typed conflicts and distinguish staff permissions from project membership. Use query-level project predicates in addition to application authorization.

Depends on — P2-01, P2-02. First failing check — A valid asset ID from another project is returned or simultaneous edits silently overwrite the first revision. Done when — Integration tests with two tenants and competing writers prove isolation, deterministic conflicts and immutable version retrieval.

#### P2-06 · Implement moderated catalog and audit repositories

Scope and work — ADM-01, X-LANG, X-DATA. Create draft, translation revision, review and audit repositories; commit release pointer and audit write atomically. Preserve the Phase 1 public query interface using published projections only. Implement pagination/filtering for the audit view with limited payloads.

Depends on — P2-03, P1-05, P1-06. First failing check — Publishing succeeds if the audit insert fails or a public query sees a draft translation. Done when — Database tests roll back both writes on failure, return consistent snapshots and preserve the public response fixture.

#### P2-07 · Implement scoped external reads and extension persistence

Scope and work — AI-01, EXT-01, X-PRIV. Implement the anonymous public catalog and the connector read repository. Anonymous theme reads return only current public, unwithdrawn releases. Authenticated reads require `project:read`, selected project grant, current membership and permitted resource/audience, including project-only releases. Exclude withdrawn releases and superseded history. Add an independently testable local storage adapter for Chrome selected swatches. Keep grant management and unpublished revisions off the connector read port.

Depends on — P2-02, P2-04. First failing check — A client can retrieve a draft by supplying its revision ID or accidentally read a previous Chrome user's captured values. Done when — Consumer fixtures prove release-only reads with scope/revocation checks and extension state is confined to its intended profile/storage boundary.

#### P2-08 · Define six authorized game read adapters and fixtures

Scope and work — DEV-01, X-DATA, X-PRIV. Define read interfaces for authorized user summaries, puzzles, word-resource metadata, session presentation state, published result status and leaderboard display summaries. For each, document canonical owner, minimal fields, ID mapping, tenant/subject predicates, loading/unavailable results and freshness. Build a clearly synthetic fixture provider for the theme preview. Bind an actual provider only when its owner, endpoint/view/schema and authorization are verified. Keep users' private sessions, answers, contact details, unreleased puzzle contents and result calculation outside the projections.

Depends on — P2-05. First failing check — The provider returns an out-of-project user or session, unpublished result, private leaderboard entry, raw word corpus, or puzzle solution when only presentation fields were requested. Done when — Six provider consumer-contract suites pass for allowed, missing, stale and denied reads. The binding matrix marks each adapter verified/live, fixture-only or blocked with an owner/dependency. No new canonical game tables, scoring logic or gameplay are required.

### Gate 3. Isolated domain and business rules

#### P2-09 · Define developer permissions and the theme lifecycle

Scope and work — DEV-01, X-PRIV. Define owner/editor/viewer permissions. Viewers can read committed theme revisions in the portal, editors can author revisions and owners control membership and releases. Only an owner can publish or withdraw: a new release defaults to project audience and a public release requires explicit owner confirmation. Define theme role requirements, permitted asset formats, revision conflict rules, release compatibility and restoration from a prior revision. Restoring creates a new auditable event and retains the former release.

Depends on — P2-05, P1-10. First failing check — An editor publishes or withdraws, a new release is public without confirmation, or an edit retroactively changes the released token set. Done when — Table-driven tests exercise each role/action pair, stale revision and cross-project denial independently of database or UI.

#### P2-10 · Define administrative publication and translation rules

Scope and work — ADM-01, X-LANG, X-PRIV. Define who can draft, review and publish catalog revisions, how approval is invalidated by subsequent edits and how rollback works. Make complete en/fr/es/pt/de text, license/provenance and valid message placeholders release preconditions. Model explicit localizable versus invariant fields.

Depends on — P2-06, P1-16. First failing check — A previously approved item can be published after its German translation or license changes without renewed validation. Done when — State transition, role, version, missing-locale and invariant-token fixtures all pass using deterministic inputs.

#### P2-11 · Define the external connector's permitted projections

Scope and work — AI-01, DEV-01, X-PRIV. Offer anonymous public catalog search and public reads limited to each current public, unwithdrawn release. A separate authenticated `project:read` operation reads current released themes for selected, authorized projects including project-only audience. On authenticated reads check current membership, scope/grant, exact project, target asset and expiry. Both access modes check the current release, permitted audience and withdrawal state. Neither mode returns drafts or historical releases. Return allowlisted token/role metadata with bounded lists and cursors. Keep external access separate from free public Color Guide chat.

Depends on — P2-07, P2-09. First failing check — A scoped grant can enumerate another project's titles, call a write, read a draft, or continue after revocation. Done when — Allow/deny contract matrices cover these cases, cross-scope cursors and fields absent from every external response.

#### P2-12 · Define Chrome capture eligibility and portable handoff

Scope and work — EXT-01, X-PRIV, X-ACC. Define user-invoked page capture, normal versus restricted-page behavior, selected-swatch limits, sRGB reporting, permission denial and deduplication. Reuse the Phase 1 validated share format for explicit transfer. Never include page text, full URL or browsing history in a palette handoff.

Depends on — P1-09, P1-22, P2-07. First failing check — A handoff accepts a foreign destination or includes the source page's URL/title by default. Done when — Eligibility and transfer fixtures reject inappropriate destinations, oversized payloads and restricted invocations and retain exact selected colors.

### Gate 4. Application services and orchestration

#### P2-13 · Orchestrate developer themes and reference-game previews

Scope and work — DEV-01, X-LANG, X-PRIV. Implement create/fork/edit/compare/restore/release/withdraw/export use cases. Recheck current owner membership for release/withdraw inside the transaction, default to project audience, require a separate public confirmation and record the action. Coordinate conflicts and audit writes with the theme repository. Preview semantic roles on labeled reference-game scenes using synthetic fixtures by default. Only a verified, authorized opt-in binding may enable a real linked preview. Keep the game platform responsible for sessions, ranking and results.

Depends on — P2-05, P2-08, P2-09. First failing check — Membership is revoked between requests but a cached preview still reveals game data, or duplicated publish retries produce multiple releases. Done when — Races, forbidden live reads, fixture mode, upstream outage and idempotent publication all have explicit outcomes.

#### P2-14 · Orchestrate catalog moderation, publication and rollback

Scope and work — ADM-01, X-LANG, X-OPS. Coordinate draft editing, translation comparison, validation, review, atomic publish, cache invalidation and republishing a previous good revision. Store audit actor, action, timestamp and revisions while minimizing captured content. Retry post-commit cache invalidation without generating a second publication.

Depends on — P2-06, P2-10. First failing check — A publication retry double-records the release or serves a mixed group of old/new translations. Done when — Concurrent and failed jobs preserve one consistent release across all five locales and provide a retryable incident record.

#### P2-15 · Orchestrate the read-only external AI connector

Scope and work — AI-01, X-PRIV, X-OPS. Combine anonymous public catalog reads with authenticated `project:read` calls for current project releases. Check revocation, current membership, grant scope and selected project on each authenticated call. Check the exact resource, current release, audience and withdrawal state for both access modes. Revoked, withdrawn or superseded records never escape through a cache. Limit response sizes, respect locale selection and record minimal audit/operational outcomes. Return explicit denied/unavailable results without exposing the existence of other projects' assets.

Depends on — P2-07, P2-11. First failing check — A cached authorized result is replayed after revocation or an unavailable backend produces fabricated theme data. Done when — Service tests prove denial, bounded pagination and consistent upstream failure. Only authorized, immutable released asset data is exposed.

#### P2-16 · Orchestrate browser capture and mobile recovery

Scope and work — EXT-01, MOB-01, X-PRIV, X-ACC. Gate Chrome extraction on an actual invocation; limit computed-style scanning, support user-selected sample/copy, and handle restrictive pages and canceled picks. Reuse existing workspace services for mobile return-from-picker, interrupted file jobs and local-state restoration. Add new orchestration only where a Phase 1 service cannot already fulfill the path.

Depends on — P2-12, P1-17, P1-19. First failing check — A popup initiates a capture in the background or an interrupted mobile picker replaces the user's last palette. Done when — Tests cover cancellation, denial and interruption independently of toolbar or mobile components and no automatic page capture occurs.

### Gate 5. Authenticated HTTP, connector protocol and browser interfaces

#### P2-17 · Expose authorized project and game-theme HTTP APIs

Scope and work — DEV-01, X-DATA, X-PRIV. Define and implement project-scoped REST resources for themes, revisions, release/withdraw, export and reference preview. Portal viewers can retrieve committed revisions. Only owners release or withdraw; public visibility requires explicit confirmation. Expose current public, unwithdrawn themes to anonymous reads. Validate authentication and membership server-side, require conditional revisions on writes and return 412 for a failed HTTP revision precondition or 409 for a conflicting domain transition. Expose only minimal authorized preview data from verified providers with an explicit synthetic/live origin indicator.

Depends on — P2-13. First failing check — An HTTP request using an editor's valid token and another project's ID succeeds, or stale writes return 200. Done when — Tests against real HTTP and PostgreSQL cover owner/editor/viewer, denied cross-project, conflict/retry, immutable release retrieval and each game-data projection.

#### P2-18 · Expose moderated administration HTTP APIs

Scope and work — ADM-01, X-LANG, X-PRIV. Implement staff-only content/revision, locale, diff, review, publish, rollback and audit routes. Bind authorization per operation, validate input, check version preconditions and protect cookie-authenticated mutations. Return locale-specific validation errors and safe audit summaries.

Depends on — P2-14. First failing check — A project owner without staff authorization publishes a catalog edit or a stale reviewer approves a newer unseen revision. Done when — Real HTTP tests exercise denied and approved role combinations, race handling, transaction rollback and all-locale publication.

#### P2-19 · Expose and contract-test the external connector transport

Scope and work — AI-01, X-OPS, X-PRIV. Publish a versioned tool/resource contract and the adapter required by the selected external AI host. Support the host authorization discovery/flow for required `project:read` and selected projects alongside anonymous public-catalog access. Bound and validate output; enforce no draft/history access, writes or arbitrary queries. Document how a user grants and revokes permitted theme access.

Depends on — P2-15. First failing check — A real protocol client requests an undeclared write or asks for a theme outside its grant; neither request may succeed or disclose private metadata. Done when — Transport tests at the actual network boundary and one supported host's development environment pass, including expired token, revocation, unsupported tool and version handling.

#### P2-20 · Expose minimal Chrome and mobile browser interfaces

Scope and work — EXT-01, MOB-01, X-ACC. Define typed messages between popup, worker and user-invoked capture handler; validate sender, tab, payload and explicit web destination. Declare minimum MV3 permissions and bundle code. Publish any necessary mobile recovery facade over existing local APIs. Keep extension and site storage separate.

Depends on — P2-16. First failing check — An unsolicited sender triggers capture, or an unrecognized message opens another origin. Done when — Chrome integration tests verify a real extension lifecycle, approved invocation, denied/restricted tabs and explicit browser-to-site handoff under a minimal permission manifest.

### Gate 6. Portals, enhanced mobile and distribution interfaces

#### P2-21 · Build the game developer portal

Scope and work — DEV-01, X-LANG, X-ACC. Create project selection, theme asset list, editable role mapping, labeled reference-game preview, committed revision comparison/history and export. Only owners receive release/withdraw controls; show project as default audience and require confirmation to make a release public. Show stale-edit recovery and archived releases honestly. Keep ordinary public tools available without portal sign-in and localize all portal text in the five supported languages.

Depends on — P2-17. First failing check — A viewer sees a working publish action or unresolved provider data appears as live gameplay. Done when — An editor can author a theme, an owner can release/withdraw it, and a viewer can preview/export the allowed committed revision using keyboard and touch. Unauthorized project data never appears in DOM or network responses.

#### P2-22 · Build the site administration portal

Scope and work — ADM-01, X-LANG, X-ACC. Build catalog/revision lists, multilingual editor, missing-key/placeholder reports, change comparison, approval/publish/rollback and searchable audit history. Preserve entered translations and show conflicts with the current revision. Display draft status and the actual published version on each edit view.

Depends on — P2-18. First failing check — An incomplete Portuguese revision can be published from the UI, or a pending edit erases another editor's newer text. Done when — A staff author and authorized reviewer complete draft-to-publication and rollback across five locales; their visible history matches the immutable audit record.

#### P2-23 · Optimize essential mobile workflows

Scope and work — MOB-01, X-ACC, X-LANG, X-OPS. Improve manipulation of palette cards, image picking/crop, control sheets, reachability, keyboard-safe layouts and task recovery on small screens. Optimize decode/worker scheduling and memory for lower-end devices. Preserve Phase 1 direct URLs, screen-reader order, desktop workflows, content and ad placement safeguards.

Depends on — P2-20, P1-29 through P1-39. First failing check — A software keyboard hides Apply, a held swatch traps focus or mobile memory pressure loses the active palette. Done when — A specified real iOS/Safari and Android/Chrome matrix and the 320/390/768px regression suite complete extraction → palette → check → export with correct focus, reflow and measured performance against the recorded Phase 1 baseline.

#### P2-24 · Build Chrome UI and user-facing connector setup

Scope and work — EXT-01, AI-01, X-LANG, X-ACC, X-PRIV. Build the browser companion landing and popup (screen 17), explain permissions, enable keyboard capture/copy/select and explicit handoff. Provide external connector setup/help covering anonymous public catalog, selected-project `project:read` grant/revoke and example retrieval of a current project-only release. State that viewers use portal history for historical revisions. Wire UI only to the completed protocols; keep installation/listing links tied to verified distribution.

Depends on — P2-19, P2-20. First failing check — A restricted tab offers a misleading successful extraction or an external client appears able to read a draft. Done when — A review build completes both guided setup journeys, reports denied/revoked permissions correctly, and contains no extension advertisements or misleading store claims.

### Gate 7. Verification and deployment

#### P2-25 · Rehearse the combined Phase 2 deployment

Scope and work — DEV-01, ADM-01, MOB-01, AI-01, EXT-01, X-TDD, X-OPS. Upgrade a representative Phase 1 database and restore a copy. Exercise public compatibility, portal authorization, external host grants, Chrome package review, localized publication/rollback, mobile performance and scope/privacy denials. Record verification evidence from the provider owner for all six live bindings in one agreed existing game. Run a player journey in its own client using a released theme. Label fixture-only checks separately and report each missing live item.

Depends on — P2-21 through P2-24. First failing check — A cross-project leak, loss of public locale data, unavailable mandatory upstream contract or failing extension package blocks the affected release. Done when — The release evidence covers public regression, build/content rollback, connector disable/revocation, extension distribution recovery and the six-adapter binding matrix. Verify anonymous public-only, authenticated `project:read` project-only access, publisher confirmation, membership removal, superseded revision and post-withdrawal denial. Record a named dependency and separate component status for any of the six live bindings or the player journey still unverified. Full Phase 2 acceptance stays open.

#### P2-26 · Promote Phase 2 web services, portals, mobile and connector

Scope and work — DEV-01, ADM-01, MOB-01, AI-01, X-OPS. Apply additive migrations; promote compatible services and clients in dependency order. Enable portal/connector access for an authorized canary, run tenant-isolation and public-website smoke tests, then widen rollout. Bind only named verified providers and keep fixture previews visibly labeled wherever live data is unavailable.

Depends on — P2-25. First failing check — A staging rollout rehearsal must disable connector access or revert portal/content versions while the prior public release remains usable. Done when — Production checks pass in all locales, the external host reads only an authorized released theme, revocation works, and the owner-approved real-game checks cover all six source families and a player journey consuming the released theme. If a binding is unavailable, any verified portal or connector rollout has component-only status and full Phase 2 remains open.

#### P2-27 · Publish and verify Chrome distribution

Scope and work — EXT-01, X-PRIV, X-OPS. Submit the reviewed extension through the approved store account, retain the reviewed build fingerprint and handle the store's review outcome. After approval, link the verified listing, install from the store and smoke-test capture, denial and website handoff. Document the recovery path for a bad version, including delisting or an expedited corrective version as available.

Depends on — P2-25, P2-26. First failing check — A missing/unapproved or mismatched listing never activates the public install link. Done when — The actual approved listing installs the expected build, smoke tests pass, and the phase owner records browser distribution as live. Record full Phase 2 completion only after the verified distribution, all six approved real-game bindings and the player journey from P2-26 pass. While store approval or game access is pending, report verified components separately.

### Phase 2 release evidence

| Accountable reviewer | Evidence attached to the production release record |
| --- | --- |
| Game integration owner | All six approved data contracts pass isolation and failure tests. A test player opens the agreed game, completes a themed session and sees its result and ranking. |
| Project and staff owners | Owner, editor and viewer exercise their distinct permissions. A five-language change publishes and rolls back. Withdrawal hides the old public release. |
| Mobile and integrations | A member releases and exports on a tested phone. The external client reads the current selected-project release and loses access after revocation. |
| Distribution and operations | Install the approved extension from its production listing, verify a capture and a permission denial, run Phase 1 regression tests and rehearse recovery. |

List each production entry point and its release evidence. A partial rollout can remain useful while open criteria are tracked. Full Phase 2 sign-off requires all four rows.

## Requirement and screen index

The IDs below join the design specification, database and API work, local tool contracts, UI and release evidence. Gates P1-40/P1-41 and P2-25/P2-26/P2-27 additionally apply as described above.

| Requirement | Screens or surface | Principal delivery PRs |
|---|---|---|
| PUB-01 Palette Studio | 02, 19 | P1-09, P1-10, P1-17, P1-27, P1-30 |
| PUB-02 Palette Gallery and popularity | 03 | P1-05, P1-07, P1-16, P1-18, P1-24, P1-26, P1-35 |
| PUB-03 Image to Palette | 04 | P1-12, P1-19, P1-28, P1-32 |
| PUB-04 Contrast Lab | 05 | P1-09, P1-17, P1-27, P1-33 |
| PUB-05 Design Preview | 06 | P1-10, P1-13, P1-19, P1-27, P1-28, P1-34 |
| PUB-06 Color Inspector | 07 | P1-09, P1-27, P1-33 |
| PUB-07 Tailwind Studio | 08 | P1-14, P1-22, P1-27, P1-34 |
| PUB-08 Hosted conversational Color Guide | 09 | P1-03, P1-07, P1-20, P1-25, P1-38 |
| PUB-09 Color Atlas | 10 | P1-05, P1-16, P1-18, P1-24, P1-35 |
| PUB-10 Gradient Gallery | 11 | P1-05, P1-11, P1-18, P1-24, P1-35 |
| PUB-11 Gradient Studio | 12 | P1-11, P1-22, P1-23, P1-27, P1-36 |
| PUB-12 Gradient Steps | 13 | P1-11, P1-22, P1-27, P1-36 |
| PUB-13 Moodboard Maker | 14 | P1-12, P1-13, P1-19, P1-23, P1-28, P1-32 |
| PUB-14 Font Library | 15 | P1-05, P1-15, P1-18, P1-24, P1-37 |
| PUB-15 Type Playground | 16 | P1-15, P1-23, P1-28, P1-37 |
| PUB-16 Collection, share and exports | 18 and shared drawers | P1-04, P1-08, P1-17, P1-22, P1-23, P1-27, P1-28, P1-31 |
| PUB-17 Company pages, cookie choices and advertising | 01, 20 and seven footer destinations | P1-02, P1-03, P1-06, P1-07, P1-21, P1-24, P1-26, P1-29, P1-39 |
| DEV-01 Game developer portal | P2-A and P2-C. Project, theme, revision and game preview | P2-01, P2-02, P2-05, P2-08, P2-09, P2-13, P2-17, P2-21 |
| ADM-01 Administration | P2-B. Translation review, publication and audit | P2-03, P2-06, P2-10, P2-14, P2-18, P2-22 |
| MOB-01 Enhanced mobile | P2-C and 19–20. Enhanced small-screen workflows | P1-29 through P1-39, P2-16, P2-20, P2-23 |
| AI-01 External read-only AI connector | P2-D. Host authorization, tools and setup | P2-04, P2-07, P2-11, P2-15, P2-19, P2-24, P2-26 |
| EXT-01 Chrome Browser Companion | 17 | P2-04, P2-07, P2-12, P2-16, P2-20, P2-24, P2-27 |
| X-LANG Five live locales | All visible web and portal surfaces | P1-02, P1-06, P1-16, P1-18, P1-24, P1-29, P1-40, P2-10, P2-14, P2-22, P2-25 |
| X-ACC Accessibility | Interactive web, consent, mobile and extension surfaces | P1-09, P1-27 through P1-40, P2-20 through P2-25 |
| X-PRIV Privacy and access | Local files, consent, hosted endpoints, private portals and external reads | P1-03, P1-07, P1-19 through P1-28, P1-39, P2-01 through P2-20, P2-25 |
| X-OPS Operating and deployment controls | Both deployment pipelines | P1-01, P1-07, P1-20, P1-40, P1-41, P2-14, P2-15, P2-25 through P2-27 |
| X-DATA Data integrity | Database and browser schemas, data ownership and recoverable upgrades | P1-01 through P1-08, P1-17, P1-22, P2-01 through P2-08 |
| X-TDD Test-driven change | A first failing check and acceptance evidence per PR | P1-01 through P1-41, P2-01 through P2-27 |
