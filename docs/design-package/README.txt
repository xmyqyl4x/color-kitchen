COLOR KITCHEN
Functional design and implementation package · Revision 2 · 21 November 2026
Project color-kitchen112026

READING ORDER

1. Color_Kitchen_Design_Specification.pdf defines both live releases. It maps 23 supplied options and four menu headings to their proposed names and routes, describes the public workflows and business model, and sets developer, staff, mobile and integration acceptance criteria.
2. Color_Kitchen_Implementation_Plan.pdf defines the architecture, technology register, TDD process, operating targets, container deployment and release checks. Its register contains P1-01 through P1-41 and P2-01 through P2-27. Each PR has scope, dependencies, tasks, a first failing check and a definition of done.
3. Color_Kitchen_PostgreSQL_Design.pdf describes the proposed data model and the checks required before using the existing shared database. There are 16 candidate relations to compare against the platform's existing data and services. scripts/schema_inventory.sql is a read-only metadata inventory for an authorized connection. No live inventory was run in preparing this package. The repository evidence note is in docs/.

All three documents include editable Word editions. The docs/ directory includes Markdown source for review in a repository.

SCREEN REVIEW

Color_Kitchen_20_Mockup_Screens.pdf contains the twenty original web, mobile and Chrome concepts. Color_Kitchen_Developer_Platform_Mockups.pdf adds four developer-platform screens. P2-A shows the theme editor, P2-B shows approval of a five-language catalog revision, P2-C shows project-default release and mobile export, and P2-D shows an external AI client's selected-project authorization. The two screen books contain 24 distinct designs in total.

Open Color_Kitchen_Screen_Gallery.html or Color_Kitchen_Developer_Platform_Gallery.html locally for the exact images. Color_Kitchen_Interaction_Prototype.html demonstrates selected public interactions. Individual PNG files and screen indexes are in mockups/. Interface copy and examples in these English mockups illustrate the designs. The release requirements cover English, French, Spanish, Portuguese and German.

RELEASE BOUNDARIES

Phase 1 ends when every specified public website workflow works on the live service in all five languages. The free hosted website Color Guide belongs here.
Phase 2 adds the game developer and admin portals, mobile workflow improvements, a read-only AI connector and the store-distributed Chrome extension. The player journey consumes a released theme in an agreed existing game. Its platform owner must verify the six data-access contracts. A sample game preview is clearly identified.
This package is a design and implementation plan. Production behavior, external integrations and accessibility conformance require the tests and release evidence defined in the plan.
