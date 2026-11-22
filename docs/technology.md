# Technology register

| Component | Pinned version | Purpose and license | Owner and verification |
| --- | --- | --- | --- |
| Node.js | 24.22.3 | Development and CI runtime, MIT | Application team. Verify with `node --version` and the CI setup step. |
| TypeScript | 6.0.3 | Strict source compilation, Apache-2.0 | Application team. Verify with `npm run typecheck` and `npm run build`. |
| PostgreSQL | 18.6 | Disposable local and CI schema fixtures, PostgreSQL License | Database implementation. Verify clean migration, replay and prior-fixture upgrades. The production major is a shared-platform dependency. |
| node-postgres | 8.23.1 | Parameterized database access and transaction driver, MIT | Database implementation. Verify against real PostgreSQL in CI. |

The Node version file and npm lockfile record the installed toolchain. Update the register when an adopted component or tested compatibility baseline changes.
