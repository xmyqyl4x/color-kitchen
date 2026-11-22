# color-kitchen

## Development

Use Node.js from [.node-version](.node-version) and a disposable PostgreSQL 18 instance. Run `npm ci` and `docker compose up -d --wait postgres`. For integration tests, set `COLOR_KITCHEN_TEST_DATABASE_URL` to `postgresql://ck_dev:ck_dev_local@127.0.0.1:55432/color_kitchen_test` and run `npm test`. The test runner creates and drops uniquely named databases in that isolated instance. A local PostgreSQL 18 installation with a disposable `color_kitchen_test` database and a role allowed to create databases also works.

Install the integration browser using `npx playwright install chromium`. To use a local Chromium installation, set `COLOR_KITCHEN_CHROMIUM_EXECUTABLE` to its executable path.

Run `npm run db:migrate` with `DATABASE_URL` set to an intended development database. The command reports the verified schema head and migrations applied. See the [database runbook](docs/database.md) and [technology register](docs/technology.md).

## Design package

Color Kitchen is designed as a multilingual public color workspace and a developer platform for publishing game themes. The repository contains the design, delivery plan, mockups and an interactive browser prototype.

1. [Functional design and acceptance criteria](docs/design-package/docs/Color_Kitchen_Design_Specification.md)
2. [Architecture and implementation plan](docs/design-package/docs/Color_Kitchen_Implementation_Plan.md)
3. [Proposed PostgreSQL design](docs/design-package/docs/Color_Kitchen_PostgreSQL_Design.md)
4. [Review summary and open release dependencies](docs/design-package/REVIEW.md)

- 20 public, mobile, and browser mockups in the [screen book](docs/design-package/Color_Kitchen_20_Mockup_Screens.pdf), [HTML gallery](docs/design-package/Color_Kitchen_Screen_Gallery.html), and [PNG index](docs/design-package/mockups/public-screens.json).
- Four developer platform mockups in the [screen book](docs/design-package/Color_Kitchen_Developer_Platform_Mockups.pdf), [HTML gallery](docs/design-package/Color_Kitchen_Developer_Platform_Gallery.html), and [PNG index](docs/design-package/mockups/developer-platform-screens.json).
- [Interaction prototype](docs/design-package/Color_Kitchen_Interaction_Prototype.html) for palette editing, contrast, CSS export and demo preferences. Open the prototype and galleries in a browser from a local checkout.
- [Repository evidence](docs/design-package/docs/Repository_Evidence.md) and a [read-only schema inventory script](docs/design-package/scripts/schema_inventory.sql). The proposed schema is pending verification against the shared PostgreSQL database.
