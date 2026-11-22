# Design and functionality review

Phase 1 delivers the public workspace in English, French, Spanish, Portuguese and German. Phase 2 adds game-theme projects, staff publishing, enhanced mobile workflows, the external read-only connector and the Chrome extension. The browser prototype is available now. Production acceptance for both phases remains future work.

## Decisions and changes

| Finding | Resolution |
| --- | --- |
| CSS export used a fixed palette, contrast results could go stale after invalid entry, and static screens had controls that appeared interactive. | Palette Studio, its mobile view, Contrast Lab and CSS export share the active colors. The demo supports lock, edit, sample generation and undo. Invalid pairs hide the old result, and the comparison reports normal and large text AA and AAA. Static screens open their original mockup. |
| Demo preferences changed visually without a saved choice. | Optional choices start off. Accept, reject and save persist through local browser storage where available, with an in-session fallback. The demo sends no advertising or analytics requests. |
| Word and PDF specifications would diverge from the updated source. The galleries also embedded a second copy of each PNG. | The maintained specifications live in Markdown, with this review and the repository README as entry points. Both galleries load the 24 original PNGs. The annotated mockup screen books remain available, including the overview montage on the cover of the public screen book. The original specification exports are available in the [import commit](https://github.com/xmyqyl4x/color-kitchen/tree/2d8b942169ccdeae0e1bbab2a3e00b2b14bde46b/docs/design-package). |
| The product design and delivery plan gave staff different responsibilities for translations. | Interface messages and placeholders go through code review and CI. Staff edit assigned catalog and policy locales. A publisher approves and releases one complete five-language revision in a single command. A concurrent change to the reviewed draft requires review again. The four versioned notices use stable slugs and a shared effective date. |
| The Popular sort lacked a minimum signal, and the share-link size and fields were open. | Start with 25 consented opens across at least five published palettes over 30 complete UTC dates. Use Featured below that threshold. Palette links carry approved swatches and role bindings in a fragment capped at 4 KiB, with JSON backup available for larger payloads. |
| Theme role names varied by document, and a protected read could refer to several themes in the same project. | Use the six keys shown in P2-A. A protected lookup supplies the selected project and exact theme asset. Both theme read paths resolve the current release with fresh access checks. Withdrawal and archival stop new reads, and restoring an archive requires an explicit new release to expose it again. |
| Work items inherited whole-layer prerequisites, and the extension could be held up by unrelated real-game integration. | Schedule using explicit prerequisites and start local slices against fixtures. Shared migrations and production promotion retain their evidence gates. The extension can ship once its own web handoff and store checks pass. Full Phase 2 still requires verified live game integration and the other release criteria. |

## Open release dependencies

| Dependency | Working default | Evidence required to close |
| --- | --- | --- |
| Shared PostgreSQL and deployment | Develop with disposable PostgreSQL and keep the proposed schema conditional. | The platform owner confirms the target, major version, migration owner, canonical schema, approved reuse and staging upgrade/restore. The [inventory script](scripts/schema_inventory.sql) supports authorized, read-only review. |
| Identity and existing game | Use synthetic member and game fixtures. Keep live previews and protected integration disabled until their real mappings are approved. | Identity owner confirms issuer, subject, tenant and membership/revocation behavior. Game owner validates the six permitted data projections and a player journey using a released theme in the agreed game client. |
| Vendor, rights and policy readiness | Use local Guide suggestions and provider fakes in development. Keep optional advertising and analytics disabled without valid consent or approved providers. | Verify production Guide, inquiries and consent/ad integrations. Record real policy text, asset and font rights, retention and complete five-language content. |
| Connector, extension and devices | Use a fixture connector and unpacked extension in development. Keep the public install link tied to verified distribution. | Confirm the supported client, grant/revocation contract, actual store installation and capture/handoff, and desktop/mobile accessibility and browser results. |

## Verification

- Validated all 24 original PNGs, 20 prototype routes, local document links and the 68-item delivery dependency graph.
- Exercised palette locking, undo, linked contrast checks, CSS export and the clipboard fallback in Chrome. Verified the CSS bytes served by the download link. Headless Chrome did not report a file-save event.
- Checked reflow from 320 to 1440 CSS pixels, persistence of optional choices, and the in-session fallback when browser storage is denied. The prototype made zero external requests.
- Reduced the package by approximately 9 MB while retaining both annotated screen books.
