# Technology register

| Component | Pinned version | Purpose and license | Owner and verification |
| --- | --- | --- | --- |
| Node.js | 24.22.3 | Development and CI runtime, MIT | Application team. Verify with `node --version` and the CI setup step. |
| TypeScript | 6.0.3 | Strict source compilation, Apache-2.0 | Application team. Verify with `npm run typecheck` and `npm run build`. |
| PostgreSQL | 18.6 | Disposable local and CI schema fixtures, PostgreSQL License | Database implementation. Verify clean migration, replay and prior-fixture upgrades. The production major is a shared-platform dependency. |
| node-postgres | 8.23.1 | Parameterized database access and transaction driver, MIT | Database implementation. Verify against real PostgreSQL in CI. |
| Playwright | 1.62.1 | Chromium browser integration tests, Apache-2.0 | Application team. Verify fresh, upgraded and blocked IndexedDB databases in CI. |
| FormatJS | ICU parser 3.5.23, IntlMessageFormat 12.2.0 | Locale-aware message parsing, placeholder validation and formatting, BSD-3-Clause | Application team. Verify five-locale parity and rendering in CI. |
| Tailwind CSS reference targets | 3.4.19 and 4.3.5 | Export compilation fixtures and pinned color references, MIT | Application team. Rebuild references with `node scripts/generate-tailwind-colors.mjs` after updating the pins. |
| Vercel AI SDK | 7.0.179 | Configurable structured Color Guide provider adapter, Apache-2.0 | Application team. Verify the adapter with the SDK mock model and choose a deployment provider during hosted integration. |

The Node version file and npm lockfile record the installed toolchain. Update the register when an adopted component or tested compatibility baseline changes.
