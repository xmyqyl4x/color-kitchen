# Color Kitchen delivery phases

Phase 1 delivers a multilingual color website. Visitors can create or find a palette, check a design, save work on their device and export it. Phase 2 adds project and game-theme services and staff publishing. Phase 3 adds the game developer portal, mobile workflow improvements, a read-only external connector and the Chrome extension. Production is planned for containers backed by the shared PostgreSQL service, subject to confirmation by its owner. Isolated development can proceed with disposable PostgreSQL and synthetic fixtures. The [implementation plan](Color_Kitchen_Implementation_Plan.md) lists the work and shared release gates for each phase.

| Decision | Phase 1 public website | Phase 2 services and administration | Phase 3 developer portal and integrations |
| --- | --- | --- | --- |
| Who can finish a task | Anonymous visitors can use every public web tool, including hosted Color Guide conversation, in five languages. | Authorized staff can publish localized catalog content. Project members use scoped theme APIs. | A developer can manage a private project, release a theme and export it from the portal. |
| Mobile | The entire public site works with touch, keyboard, zoom and a narrow viewport. | Service APIs support the existing clients with the same permissions. | Refine high-frequency mobile tasks using real-device evidence, including input, export, sharing and returning to an unfinished edit. |
| AI and extension | Color Guide receives a prompt intentionally submitted in the website. It offers a clearly identified local fallback during service interruption. | Define connector grants, release-only read rules and the portable palette handoff. | An external connector lets approved clients read permitted resources. Browser Companion ships as an installable Chrome extension. |
| Data | PostgreSQL holds published reference data and necessary hosted records. Private images, drafts and personal collections stay on the device. | Reuse platform identity and permissions. Saving selected color data to a developer project creates a server-side, project-scoped asset. | The portal and connector use the same scoped records. Extension selections stay in browser-local storage. |
| Live completion | A real visitor can finish all PUB-01 through PUB-17 journeys at the public URL. Gates include translations, real adapters, a production smoke test and rollback evidence. | Shared release evidence covers project API permissions and staff publication and rollback. | Shared release evidence covers the developer portal, mobile, authorized connector and installation of the approved Chrome build. |

The notes mention player and game data. This plan interprets those terms in the context of Color Kitchen. Game developers use palettes and semantic color roles in an existing game. A reference game lets them preview a board, an outcome and ranked rows with synthetic data. The data design also defines the boundary for authorized access to shared game records. The game platform owns play, words, scores and ranking. Phase 3 live game acceptance requires approved bindings for all six data families and a player journey using a released theme in the agreed existing game. Synthetic previews keep the editor usable while those bindings are being verified.

The same free capabilities are available across all five languages. Authentication protects private projects and staff operations. Public tools, exports and the website Color Guide require no subscription or account. An ad blocker, a failed ad load or rejection of optional tracking preserves those capabilities.

# Navigation and reference screens

The existing 20-screen book establishes the visual language and public interaction patterns. The screen numbers below refer to that book. The product workflows below describe the Phase 2 administration portal and Phase 3 developer portal. The two mobile concepts already in the book guide the Phase 1 baseline. Screen 17 previews the Phase 3 Chrome extension.

| Navigation | Destinations and screen references |
| --- | --- |
| Home | Home (01) offers palette creation, image extraction and discovery. |
| Create | Palette Studio (02), Image to Palette (04), Contrast Lab (05), Design Preview (06), Color Inspector (07), Tailwind Studio (08), Color Guide (09), Gradient Studio (12), Gradient Steps (13), Moodboard Maker (14), Type Playground (16). |
| Explore | Palette Gallery (03), Color Atlas (10), Gradient Gallery (11), Font Library (15). |
| My Collection | Saved local work and export (18). Mobile Studio (19) provides a narrow-viewport reference. |
| Browser tools | Browser Companion (17). Show an informational destination during Phase 1. Enable Install when the shared distribution gate verifies the Phase 3 extension. |
| About and Help | Usage and Licensing, Terms of Use, Privacy Notice, Cookie Notice, Cookie Preferences (20), Advertise with Us, Get in Touch. |
| Phase 2 and Phase 3 entry points | Authorized staff see Catalog Administration in Phase 2. In Phase 3, Game Developers opens project selection and the theme editor. Integrations explains client connection, authorization and revocation. |

The package includes the original 20-screen book and a four-screen supplement for the developer platform. The supplement shows the theme editor (P2-A), multilingual publishing (P2-B), mobile release and export (P2-C), and connector authorization (P2-D). Desktop concepts use a neutral canvas, dark text and evergreen actions. Swatch names and values sit on neutral surfaces. Preserve visible Generate, Copy, Lock, Save and Export actions, textual status, predictable focus order and numerically editable alternatives to dragging.


# Visual direction and menu crosswalk

## Navigation crosswalk

The four requested headings become **Create** (Tools), **Explore** (Discover), **Browser tools** (Apps), and **About and Help** (Company). An action such as making a gradient belongs in Create. Browsing finished palettes belongs in Explore. Each proposed route below follows the selected locale, so `/contrast` opens at `/fr/contrast` in French. Cookie Preferences also opens directly from the footer. The navigation uses localized labels across all five languages.

| Requested heading and option | Color Kitchen destination | Route after locale prefix |
| --- | --- | --- |
| Tools · Generate your palettes | Create › Palette Studio | /palette-studio |
| Tools · Explore popular palettes | Explore › Palette Gallery | /palettes |
| Tools · Extract palette from image | Create › Image to Palette | /image-to-palette |
| Tools · Contrast checker | Create › Contrast Lab | /contrast |
| Tools · Preview palettes on designs | Create › Design Preview | /design-preview |
| Tools · Color picker | Create › Color Inspector | /color-inspector |
| Tools · Tailwind Colors | Create › Tailwind Studio | /tailwind |
| Tools · Color Bot | Create › Color Guide | /color-guide |
| Discover · List of colors | Explore › Color Atlas | /colors |
| Discover · Browse gradients | Explore › Gradient Gallery | /gradients |
| Discover · Create a gradient | Create › Gradient Studio | /gradient-studio |
| Discover · Make a gradient palette | Create › Gradient Steps | /gradient-steps |
| Discover · Create a collage | Create › Moodboard Maker | /moodboard |
| Discover · Browse free fonts | Explore › Font Library | /fonts |
| Discover · Font Generator | Create › Type Playground | /type-playground |
| Apps · Chrome Extension | Browser tools › Browser Companion | /browser-companion |
| Company · License | About and Help › Usage and Licensing | /licensing |
| Company · Terms of service | About and Help › Terms of Use | /terms |
| Company · Privacy policy | About and Help › Privacy Notice | /privacy |
| Company · Cookie policy | About and Help › Cookie Notice | /cookies |
| Company · Manage cookies | About and Help › Cookie Preferences | /cookie-preferences |
| Company · Advertise | About and Help › Advertise with Us | /advertise |
| Company · Contact | About and Help › Get in Touch | /contact |

## Reference workflows and original choices

Coolors documents pressing Space to generate, locking chosen colors, dragging to reorder, then exporting. Color Kitchen provides a visible Generate button, persistent lock status, move controls and undo. Screen 02 keeps each swatch's value and Copy action on a neutral footer. The current palette appears beside the next practical steps, Check contrast and Export. The user's colors and role choices carry into those tools. [Coolors generator workflow](https://coolors-help.zendesk.com/hc/en-us/articles/360010581980-Generate-a-palette) · [Coolors export workflow](https://coolors-help.zendesk.com/hc/en-us/articles/360010581920-Export-a-palette)

The reference gallery supports search by HEX or keyword and can pass a palette to its editor. Its image picker also offers automatic and manual sampling. Color Kitchen uses those familiar workflows with an independently sourced catalog, a visible sort explanation, local image processing and numerical alternatives to dragging a sampling point. The comparison draws on official documentation and indexed pages. Direct access to several live pages was restricted, so any comparative usability claim needs a task study. [Coolors gallery documentation](https://coolors-help.zendesk.com/hc/en-us/articles/360010698899-Explore-all-color-palettes) · [Coolors image-picker documentation](https://coolors-help.zendesk.com/hc/en-us/articles/360010537260-Create-a-palette-from-a-photo)

## Visual system

Retain the original Color Kitchen wordmark and three short vertical color strokes shown in the screen book. Use editorial serif headings, a readable sans serif for controls and body copy, and tabular or monospaced figures for editable values. A production pairing to test is **Spectral** for headings and **Source Sans 3** for text, subject to license verification and accents in all five languages. The viewer's chosen palette should occupy more visual space than the brand.

| Role | Color | Application |
| --- | --- | --- |
| Canvas and surface | #F7F8F4 and #FFFFFF | Soft page background and neutral text surfaces |
| Text and secondary text | #202722 and #5C665F | Headings, values, instructions and source notices |
| Primary action | #215845 | White action text gives approximately 8.25 to 1 contrast |
| Selection and focus | #E8EFE8 and #215845 | Selected surface plus text/icon state. Evergreen focus outline with a white offset for dark surfaces |
| Decorative boundary | #DCE2DA | Low-emphasis panel divisions. Use a stronger edge wherever a control needs one to be identifiable |

Use a 4-pixel spacing base with 8, 16, 24 and 32-pixel gaps, 12–16-pixel corner radii, approximately 16-pixel body text and 1.5 line height. Make main targets at least 44 × 44 CSS pixels. Keep each result specific. On screen 05, sage `#6F8F7B` on cream `#F8F5EF` measures 3.28 to 1 and fails AA for normal text. The suggested `#3E6452` measures 6.13 to 1 and passes. Show both values, the affected role and an explicit Apply action. [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)

## Adapting the workspace

At 1280 CSS pixels and wider, the canvas may sit between contextual navigation and one eligible ad rail. Drop the rail first when space is tight. At 768–1279 pixels, collapse navigation into a tool selector and place properties after the canvas or in a labeled sheet. At 767 pixels and below, use one column. Screen 19 turns five swatches into stacked rows; the row's name, value, lock and copy stay together. At 320 CSS pixels, including zoomed layouts, let translated labels wrap and keep the focused field visible above the software keyboard. Screen 20 gives Accept and Reject equal visual weight. [WCAG reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

On an eligible gallery, label the reserved unit **Advertisements** in the selected language and place it outside the interactive swatch grid. On narrow screens, place it after useful results. A no-fill response must leave the active control in place. Track hosted Color Guide cost and advertising receipts separately using actual operating data. [Google AdSense placement guidance](https://support.google.com/adsense/answer/1346295)

# Public workflow and acceptance

A visitor can start in a tool or a gallery from a localized direct link. One active document carries ordered color IDs, locks, role bindings, source type and applicable tool settings. Generate, apply a fix, move a swatch and accept an AI suggestion each produce one undoable edit. Reordering preserves role assignments. Replacing unsaved work offers the choice to keep a copy. Storage denial leaves the active document and a JSON backup action available.

Preview and export read the same active document. Locks exclude colors from automatic changes. Undo restores the previous document state, including locks and role bindings, and direct edits to locked colors require unlocking first. Deleting a swatch assigned to a role asks the user to reassign or clear that role before the edit commits. Validating a replacement document or export never mutates the active document.

The following IDs are stable references for pull requests and automated tests. Pass criteria apply in every supported locale. Fixtures use identical numeric values in each locale so translated display cannot change color or scoring calculations.

## PUB-01  Palette Studio

Start with five colors. Support two through twelve, seeded generation, harmony selection, warm or cool ranges, direct entry, adding and deleting colors, reordering and locking. Balanced, analogous, complementary, split complementary, triadic and monochromatic modes provide starting points. Let users preview a global adjustment before applying it to unlocked colors. Background, surface, text, primary and accent reference stable swatch IDs.

**Acceptance.** Lock two swatches and generate twice. Their values and bindings persist through preview, export and undo. With all colors locked, explain how to unlock one. The Space shortcut works only on the active canvas and can be disabled.

## PUB-02  Palette Gallery

Search original or licensed palettes by HEX, word, mood or family. Filter by color count and lightness, paginate results and expose clear copy, save and use actions. Show provenance and the real sorting method. Popular ranks eligible palettes by consented opens in Studio over the preceding 30 complete UTC dates. Enable the sort when the published palette catalog has at least 25 accepted opens across at least five currently published palettes in that window. Otherwise show Featured and explain the threshold. Apply search and filters after deciding whether Popular is available.

**Acceptance.** A known fixture appears under matching filters and survives a locale switch. Empty results retain the filters and offer reset. The sort switches at 25 accepted events across five palettes, with item ID as the stable tie-breaker. Private collection saves contribute zero events and stay private.

## PUB-03  Image to Palette

Accept JPEG, PNG and WebP, clipboard paste where available, and an original sample. Decode locally and compute a dominant or balanced palette in a worker. Offer two through twelve swatches, numeric region controls, manual pixel selection and cancel. Proposed starting limits are 20 MiB compressed and 40 megapixels, subject to device testing. Bound the analysis surface and release buffers. Skip fully transparent pixels and resolve partial transparency against the selected backing color.

**Acceptance.** Two equivalent test images produce matching colors within the declared quantization tolerance. Oversized, corrupt, all-transparent or canceled input preserves previous work and yields actionable feedback. A network capture shows no source pixels leaving the device.

## PUB-04  Contrast Lab

Calculate WCAG sRGB contrast for opaque or explicitly composited color pairs. Show AA and AAA for normal and large text, the tested backing color and the scope of any result. Preserve high-precision input and label conversions from wide gamut. Allow swap, role-pair comparison, an optional preview of a correction, explicit apply and undo. Gradient or photo checks show sample coverage and limits.

**Acceptance.** Black on white returns 21 to 1. Identical colors return 1 to 1. A ratio immediately below a threshold fails even when its rounded display equals that threshold. Garden sage #6F8F7B on #F8F5EF scores about 3.28. The suggested #3E6452 on the same background scores about 6.13. Both values follow from the same tested calculation.

## PUB-05  Design Preview

Render original landing page, dashboard, editorial and shop-card templates. Bind palette colors to semantic roles, select a component to inspect its foreground and background, and compare light, dark, desktop and mobile variants. Export the preview image or role tokens. Resetting a template restores its default role mapping.

**Acceptance.** Reordering the palette preserves the role displayed on a button. Changing a role updates every relevant preview. Export excludes application controls and advertisements. The text color changes only when the visitor accepts an edit.

## PUB-06  Color Inspector

Inspect HEX, RGB, HSL and OKLCH, alpha, tints, shades, tones, harmonies and nearest color names. Preserve supported Display P3 inputs and display the sRGB fallback separately. Screen sampling uses a supported browser capability on user activation. Manual entry and image sampling are available across supported browsers.

**Acceptance.** Conversion round-trips within format precision. Invalid input stays editable, cancellation preserves the prior color, and a missing native eyedropper still leaves a complete path to select a color. Nearby names are identified as suggestions.

## PUB-07  Tailwind Studio

Generate a named eleven-step scale, 50 through 950, or inspect the pinned built-in palette for the selected Tailwind version. The developer chooses which step anchors the base. Show example text, controls and surfaces. Export v4 CSS theme variables or v3 extended color configuration with explicit color space. Keep version selection visible.

**Acceptance.** Representative v3 and v4 projects compile their respective exports and resolve an expected utility to the intended value. A locked base retains its exact value. A conflicting token name is resolved explicitly. [Tailwind colors](https://tailwindcss.com/docs/colors) · [Theme variables](https://tailwindcss.com/docs/theme)

## PUB-08  Color Guide

A visitor sends a natural-language request, optionally attaches selected swatches, refines the suggestion and applies it as one reversible edit. Show the hosted provider disclosure before sending. A response contains a short explanation, candidate values and optional roles. Validate the structure and use the shared color engine for all measurements. The local Quick suggestions mode works with curated rules and is clearly labeled. Service-wide budget and fair-use safeguards apply equally to all visitors.

**Acceptance.** A live hosted conversation works in each supported language. An unavailable or timed-out provider preserves the draft and offers local help. Invalid model values cannot enter the active document. Tests verify that images, collection names and unrelated work are excluded from the request.

## PUB-09  Color Atlas

Search CSS color names, aliases and the licensed or original reference collection by localized name, HEX, family and lightness. Show a color's original name, source, canonical value and related palettes. Open the same value in Color Inspector.

**Acceptance.** A CSS keyword resolves to the same value in every locale, even when its displayed description differs. An alias lands on the same canonical item. Show provenance and distinguish an exact hit from a nearest-name suggestion.

## PUB-10  Gradient Gallery

Browse licensed or original linear, radial and conic gradients by type, family and mood. See the stops, copy CSS, save locally or open the recipe in Gradient Studio. Palette and gradient catalog detail pages are public, indexable and localized.

**Acceptance.** The editor reproduces each catalog fixture's geometry, alpha, stop positions and interpolation. Unpublished revisions never appear in public search. A static preview works with reduced motion.

## PUB-11  Gradient Studio

Edit two through twelve stops, opacity, position, direction or center and interpolation. Allow equal-position stops for hard edges and numeric alternatives to dragging. Use CSS-compatible alpha interpolation in the chosen space. Export CSS, PNG and SVG where representable. Explain any raster fallback before export.

**Acceptance.** Selected hard edges and transparent stops agree among preview, sampled palette and exported result. A conic gradient that cannot be represented faithfully as vector SVG offers the correct alternative without quietly changing the design.

## PUB-12  Gradient Steps

Sample the actual gradient at n evenly spaced positions, including both endpoints. Allow two through twelve samples, reverse, sRGB or perceptual interpolation and hue-path selection when applicable. Show sampling positions. Open the resulting discrete colors in Palette Studio.

**Acceptance.** At two steps both endpoints match exactly. A three-stop gradient samples its intermediate stop under the selected interpolation. The explicit reverse action reverses the result with deterministic rounding.

## PUB-13  Moodboard Maker

Compose one to four local images with a palette using simple bottom-strip, side-strip, two-image and square layouts. Set crop, spacing, background, legend and caption with keyboard-accessible numeric controls. Export PNG or JPEG, and a print-ready board PDF for supported templates. Explain a device-dependent output limit before export. Saving a board with images requires a deliberate device-storage choice.

**Acceptance.** An exported board contains only its content, with no ad, application chrome or watermark. An unavailable storage quota does not produce a saved confirmation. A smaller export remains available after a resource limit.

## PUB-14  Font Library

Filter by family type, supported scripts, weight and variable axes. Test a sample string in actual licensed font files. Show authorship, version, upstream source, license and language coverage before using or downloading a family. Load only selected assets with a readable fallback when a file fails.

**Acceptance.** Each font entry has source and license evidence. A supported accented sample renders in the selected family. If that font cannot display a glyph, indicate fallback. Any redistributed package contains required notices. [Google Fonts source and licensing](https://github.com/google/fonts/blob/main/README.md)

## PUB-15  Type Playground

Styled text offers Unicode variants plus a visible plain-text copy. Preserve unsupported characters, combining marks and emoji. Explain assistive reading and search limitations. Typography uses real fonts and controls for weight, size, spacing, line height and palette color. Export CSS or an image preview.

**Acceptance.** Copy plain text returns the original Unicode sequence. Test multilingual accents and an emoji sequence. Site labels, focus announcements and policy text use ordinary readable text. [Unicode guidance](https://unicode.org/faq/ligature_digraph.html)

## PUB-16  My Collection and export

Save named palettes, gradients and explicitly saved boards in IndexedDB. Search, tag, duplicate, delete with undo, back up and import a versioned JSON document. Allow HEX and channel text, CSS variables, JSON, SVG swatches, PNG, PDF, ASE and the supported Tailwind variants. Explain supported fidelity per format. A palette share link carries a versioned snapshot of ordered swatches and role bindings in its URL fragment. Exclude project IDs, document names, source images, notes and history. Preview the exact payload before copying and offer a JSON file when the complete encoded fragment exceeds 4 KiB. Import validates before applying a snapshot and prompts before replacing unsaved work.

**Acceptance.** Refresh a saved document, import a backup and compare color IDs, order, roles, alpha and spaces. Parse an ASE fixture in an independent decoder and handle unsupported alpha explicitly. Corrupt imports leave prior work intact. When clipboard access fails, expose selectable text. When local storage fails, offer backup before the session ends.

## PUB-17  Policies advertising and contact

Provide all seven About and Help destinations in five languages, a real advertising/contact submission path, a functioning preferences editor and eligible public ad placements. Match provider and retention disclosures to deployment configuration. The next section specifies the behavior of each destination.

**Acceptance.** Submit a contact request through production using a marked synthetic fixture and confirm receipt in its authorized destination. Reject optional storage, revisit a public tool, use a private workspace and export successfully. Audit allowed network destinations at each step.

# Public trust and company pages

| Destination | User outcome and release check |
| --- | --- |
| Usage and Licensing | Read output-use terms and source notices. Each distributed font retains its actual upstream license and authorship. Uploaded images remain subject to their original rights. |
| Terms of Use | Find the real operator, contact method, expected use and conditions in the selected language. Version and effective date are visible. |
| Privacy Notice | Understand local images and collections, operational logs, opt-in analytics, advertising, contact handling, hosted chat transfers and Phase 2 project storage. Name the selected providers and actual retention periods. |
| Cookie Notice | See purposes, vendors and storage durations. Link directly to the live preferences controls. |
| Cookie Preferences | Accept or reject optional purposes with equal prominence. Reopen and withdraw a choice. Simulate a failed consent provider and complete an export with optional requests suppressed. |
| Advertise with Us | See available public placements and send a real inquiry using the contact workflow. Publish only verified audience data. |
| Get in Touch | Submit feedback, privacy, accessibility or licensing requests. Show actionable validation and acknowledge only durable acceptance. An operator can find the inquiry in the chosen service. |

Advertisements use reserved slots on eligible public tool and discovery pages. Keep the slots away from Generate, Copy, download and navigation controls. Never refresh an ad for a palette change. Small screens show placements after useful content. Protect image processing, moodboards, collection/export, chat, project and admin routes from third-party ad scripts. Enter these workspaces via a clean document or an independently tested isolation boundary. A hidden slot alone cannot isolate a script. Exports, connector responses and the extension carry no advertising.

Start with optional advertising and analytics disabled until the consent integration returns a valid choice for that purpose. Withdrawal stops optional requests and clears applicable optional storage through the provider's supported path. An unavailable or unapproved provider leaves the corresponding integration disabled. Test production rejection, withdrawal and failure. A component rollout can serve creative tools while approval is pending. Full Phase 1 acceptance still requires an approved placement demonstrated with a provider-approved test impression where available. Delivery of paid inventory depends on demand. [Google placement guidance](https://support.google.com/adsense/answer/1346295) · [Consent requirements](https://support.google.com/adsense/answer/13554116)

# Language experience across phases

English (en), French (fr), Spanish (es), Portuguese (pt) and German (de) ship together. Use general Portuguese for this first release. Retain stable internal token names, API keys, CSS keywords, document IDs and HEX strings when a language changes. Preserve the user's own names, fonts, prompt text and source license names. The site offers a persistent language switcher using each language's own name.

| Surface | Localization contract | How acceptance is demonstrated |
| --- | --- | --- |
| Routing and discovery | Locale-prefixed URLs. An explicit URL or manual selection wins over a saved preference, then a supported browser language, then English. Public detail identity stays stable. | Navigate from a French filtered catalog to German and back. Preserve the same content item, active document and compatible filter IDs. Honor direct links without a locale redirect loop. |
| Interface and interaction | Version-controlled message keys cover menus, forms, dialogs, ARIA labels, errors, feedback, empty states, shortcuts, ad labels and notices. Use whole messages with plural rules. | CI requires key and placeholder parity for all five languages. Exercise zero, one and many, long German strings, French accents, Spanish punctuation and Portuguese diacritics. |
| Catalog and policies | Publish five complete text variants of required catalog items and public notices. Keep license originals available with localized explanations. Use stable slugs and the locale prefix for the initial release. | Block an incomplete release revision, retain the last complete publication, and verify selected-language detail, search and policy navigation. |
| Numbers and exports | Use locale-aware display for ratios, dimensions and dates. Convert locale number input into validated numeric values. Re-serialize code and interchange data in their format's canonical syntax. | French and German readers can enter decimal values in the supported form. The same colors produce the same machine-readable CSS and JSON in every locale. |
| AI and browser clients | Pass the requested locale to hosted chat, local help and connector presentation. Localize the extension popup, errors, portal and staff UI. Production provider dialogs and distribution listings display supported translations where the provider allows them. | Ask the same color question in five languages. Validate response language, structure and numeric results. Verify portal access failures and extension restrictions in every language. |
| Indexing and fallback | Give each complete public language page a self-canonical URL and reciprocal hreflang for all available variants, plus a suitable x-default. Index only intentional public pages. | Crawl all five variants. Check 200 responses, canonical targets, reciprocal links and localized titles. Missing required strings block release. An emergency runtime fallback logs the key privately and preserves the user task. |

Use the locale in catalog cache keys and ETags. Site text comes from message bundles while catalog text follows its published PostgreSQL revision. Staff can edit translated catalog content in Phase 2. A code review and release updates interface bundles. These different publishing paths prevent a catalog edit from altering interface behavior. [Google guidance on localized pages](https://developers.google.com/search/docs/specialty/international/localized-versions)

# Accessibility and mobile acceptance

WCAG 2.2 AA is the release target across all phases. Use an explicit product target of 44 × 44 CSS pixels for main controls. Check normal text at 4.5 to 1 and large text at 3 to 1 for AA. Compare the unrounded result. Show the tested roles, size category, backing surface and standard. With transparent colors, resolve the effective rendering against an opaque surface before measuring. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [Contrast thresholds](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)

On a small screen, swatches become stacked rows with independent copy and lock actions. Inspectors appear in reading order or an accessible sheet. At 320 CSS pixels, ordinary content reflows. Simple coordinates, move buttons and numeric gradient positions support users who cannot drag. Keep the focused control and validation message visible above the software keyboard. Announce completed saves and exports once. Keyboard-only, VoiceOver, NVDA, high zoom and forced-color checks complement automation.

The publicity, privacy and mobile promises apply to the complete task. In the live acceptance session, choose a language, reject optional tracking, extract a palette from an image, adjust a locked palette, check contrast, preview, export and reload the saved work. Capture an artifact and a network trace using synthetic data. Repeat on a touch device. The release log records browser, viewport, assistive technology, locale, build digest and test result.

# Product specification for Phases 2 and 3

Phase 2 establishes theme services and staff operations. Phase 3 gives game developers a portal to package a Color Kitchen palette as a reusable game theme and adds richer mobile web workflows, browser capture and a read-only connector for external AI clients. The public site continues to support anonymous creation and export. Signing in establishes who may access a private project or operate staff tools. Every authorized project member gets the same formats and color functions without payment.

| Capability | Owner of the action | Result | Design references |
| --- | --- | --- | --- |
| DEV-01 Game developer portal | Project owner, editor and viewer | Role-mapped, versioned game theme can be tested, released and downloaded | 02 Palette Studio, 05 Contrast Lab, 06 Design Preview, 08 Tailwind Studio, 18 My Collection and Export. P2-A shows the theme editor and P2-C shows mobile release. |
| ADM-01 Administration | Authorized content, localization and security staff | Reviewed catalog and translation changes, scoped access administration and an auditable release history | 03 Palette Gallery, 10 Color Atlas, 11 Gradient Gallery, 15 Font Library and 20 Cookie Preferences show affected public surfaces. P2-B shows the five-language review. |
| MOB-01 Mobile web | Visitor or project member | Touch-friendly authoring, recovery, sharing and file export in a phone browser | 19 Mobile Palette Studio, 20 Mobile Cookie Preferences, plus 04 and 18 for transfer. P2-C shows an owner releasing on a phone. |
| EXT-01 Browser Companion | Visitor invoking a Chrome extension | Selected colors move from the current page into a local palette and then, on request, to the website | 17 Browser Companion and 02 Palette Studio |
| AI-01 External AI connector | AI client reading public data or a user granting protected access | Read-only discovery of public catalog and current released themes, plus protected reads of the current released theme in explicitly authorized projects | 09 Color Guide shows the in-site assistant. P2-D shows project selection and authorization for the external client. |

## DEV-01 Game developer portal

A developer opens a private project, imports an explicitly chosen palette from the browser workspace and maps its colors to interface roles. The first theme schema requires the six keys shown in P2-A: `scene.background`, `tile.text`, `selection.fill`, `selection.outline`, `action.primary` and `action.label`. Drafts may be incomplete. A released snapshot includes all six bindings. Additional keys enter through a versioned theme contract with the game owner. The preview checks board lettering and action-label pairs in Contrast Lab. State icons, outlines or labels accompany color changes so the preview communicates selection without relying on hue alone.

The developer supplies a project name and theme name. Reuse verified platform project identifiers and membership if available. Represent imported colors with their stable IDs, color space, components and alpha. Store the palette snapshot and role assignments together so a later change to the source palette cannot break an existing release. Localize built-in role display labels. Preserve user-entered project and theme names as authored. Machine identifiers and exported color values remain stable across languages. A synthetic preview can apply these same roles to a puzzle board, a selected cell, success and error feedback, a result panel and a ranked list while keeping text, shape and position cues. The original game service remains authoritative for game rules and ranking.

**Permissions.** An owner manages project membership, releases and archives themes. An editor creates or revises drafts and previews and exports a draft with its status visible. A viewer reads and exports committed revisions of themes in their project. An editor’s unsaved buffer is local until explicitly committed. Only an owner can release or withdraw a theme. The release preview defaults to the project audience. Choosing public requires a separate visible selection and confirmation that describes who may access the exported color data. Check membership in the requested project and the operation on every server read or write, including version history and exports. Enforce a last-owner rule. Deactivating a member ends future access. Prior downloaded files remain in that recipient's possession.

**Draft and release.** Track the draft's expected edit version. A stale HTTP If-Match returns 412 with options to reload or save a copy as a separate theme asset. Changed input under an existing operation key or a conflicting domain transition returns 409. Release validates required role references, named text/background pairings, color ranges, supported formats and project permissions. Missing roles or invalid data prevent release. Show contrast results for declared pairs with the tested foreground, background, text size and threshold. An optional project policy may require passing specified pairs before release. Do not label a game as accessible based on its palette. Each committed edit creates an immutable asset revision. Owner publication locks the project and asset, validates the chosen committed revision, withdraws the former current release, creates a release record tied to the chosen revision and selected audience, and appends the audit event in one transaction. This permits only one current release per asset. A project-audience release remains restricted to authorized members. Only an active, unwithdrawn release explicitly marked public is available anonymously. A stored command receipt replays the original release or withdrawal result for a matching retry. An owner can explicitly re-release the same withdrawn revision and audience using a new request key, a current precondition and renewed public confirmation when applicable. The former release ID remains withdrawn. Restoring an older design creates a new revision with a link to its source. Archiving a theme withdraws its current release in the same transaction. Members of an active project can explicitly open archived theme history under the retention policy. Archiving the project removes its assets from normal member access and withdraws their current releases. Restoring an archive never restores release visibility.

**Export contract.** The canonical JSON includes `schemaVersion`, theme identifier, revision identifier, draft or released status, stable role keys, color references, ordered source colors, color spaces and alpha. A CSS custom-property export supports web games. The selected application's existing exporter may add other supported formats. An engine consumes the documented JSON rather than requiring a custom plug-in. An authorized member can reproduce a version-pinned download after another revision ships. Public access follows only the current, unwithdrawn release when its owner explicitly selected the public audience. A historical public URL cannot expose a withdrawn revision. Verify one pinned fixture by importing it in a small sample game menu. Include any dependent asset attribution in the package. Exclude member identities, private project notes and origin images from the theme file.

**Acceptance.** An owner creates a project, imports a palette, maps roles and releases revision 1 to the default project audience. An anonymous request cannot retrieve that release. The owner later selects and confirms the public audience for a new release and can withdraw it again. An editor changes the selected and focus roles while preserving the first release. A viewer in that project can read committed revisions but cannot edit them or change release status. A user from another project cannot see these private revisions. After the owner releases revision 2, both pinned revisions export correctly. A second project member with the same role in a different project cannot retrieve the first project's theme by guessing an identifier. Concurrent release requests produce one intended current revision. Unauthenticated visitors retain the public palette, contrast and export workflows.

### Game data and preview contract

A developer can choose **Sample game data** to compare a theme on a board, feedback panel, result summary and ranked list. Label the sample on screen and in any exported preview. For example, highlight the current tile with a visible outline, show correct/incorrect feedback using a symbol and text, distinguish winners and tied ranks with labels and numbers, and test the small scoreboard text against its actual surface. Switching to another theme changes only the color role bindings. The agreed live game, once approved and verified by its owner, appears as a separate source with the game, permitted scope, source version or retrieval time, and the last successful refresh. A failed live request shows **Live preview unavailable** and an explicit option to switch to samples. A sample result never receives a live status.

| Shared entity family | Permitted contract and example | Ownership and release prerequisite |
| --- | --- | --- |
| Users or players | Resolve an authenticated member to a stable platform subject and their project permissions. Preview screens use synthetic display labels such as Player A. | Owner confirms issuer, subject and tenant mapping, deactivation, access scope and suppression of personal identifiers in previews. A display name, email address or member list never goes into a theme export. |
| Puzzles | Receive an approved puzzle reference, layout or set of cell states needed to preview selected and disabled colors. | Verify game ID, puzzle ID, variant, publication and release visibility, especially for unreleased puzzles. Retain source IDs only when the approved integration needs them. |
| Words and word resources | Use sample strings to test typography, character coverage and feedback. If linked, the game service supplies only a permitted published label or test word in the requested locale. | Verify word-resource ownership, licensing, language, visibility and join keys. Future puzzle answers and entire dictionaries stay outside the preview contract. |
| Game sessions | Receive only projection data such as a permitted board state or active/inactive cell state when a specific integration requires it. | Verify session ownership and allowed state fields through the owning service. Exported themes contain color roles, with gameplay state excluded. Use an explicit session access check when the service exposes private sessions. |
| Results | Display synthetic outcome states by default. If linked, use an approved, minimized result summary or aggregate to render success, failure and draw. | Require a verified completed-result representation and visibility policy. The color application performs no scoring, adjudication or result mutation. |
| Leaderboards | Render an ordered, synthetic ranked list with tie and current-row markers. A live preview accepts only an approved public or deidentified ranking projection. | Keep the platform's order, tie rules, scope and visibility. Display rows may have a rank and a permitted label. Raw player records, source tables and historical results are unavailable to this client. |

Each source adapter must document the actual versioned service or owner-approved read view, field whitelist, key types, tenant and project scoping, visibility, freshness, empty/error cases and authorized caller. Verify it against an isolated environment with synthetic accounts and game records. Boundary tests must reject cross-project reads and private or unpublished source data. The public website, staff area and AI connector do not gain game-data access through these preview adapters. The connector receives just its approved color representations. The repository contains six synthetic adapter contracts. Their live reuse remains **unverified and blocked** until the owning platform supplies the mappings, version and permission evidence. Phase 3 live game acceptance requires all six owner-approved bindings for one agreed existing game and a player journey in that game’s own client using the released theme. A labeled fixture preview can run earlier.

## ADM-01 Administration and multilingual content

Provide a staff entry point with work queues for public catalog items, licensed assets, translations, feature availability and restricted access administration. A catalog operator can create a draft, supply source and license details and preview the presentation. A staff publisher with the separate release permission can publish, withdraw and restore catalog and policy revisions. The approval action commits the exact revision the publisher reviewed. A concurrent edit requires another review. Require license/provenance fields appropriate to the asset before publication. Staff can distinguish a broken external resource from a withdrawn license. Invalidate only the affected cached public entries and any indexes that expose them. Keep audience, effective version and last status visible. A withdrawn public asset should leave an understandable status for old links when retention and rights permit it.

Each operational permission has a named scope. Content operators manage public records. Locale editors edit the catalog and policy text for their assigned locales and see missing variants or stale source revisions. A designated publisher reviews and releases the complete five-locale record. Access administrators can grant approved staff roles and revoke connectors. Project owners administer their own membership. A staff role does not automatically reveal private theme drafts, images, notes, collections or prompts. Record actor, target identifier, action, version, timestamp and outcome. Store evidence required for support and auditing without collecting object contents in general application logs. Review any exceptional support access under the actual platform's approved policy.

Version-controlled interface bundles cover public tools, role names, error states, consent controls, staff forms, portal notifications and extension strings. Review their message keys, plural branches and placeholders in code and CI. Staff-managed catalog and policy text uses the Phase 1 locale registry and publishes only as a complete five-locale revision. If machine translation is used, it enters the same review flow as any draft. Editors can restore a locale's wording into a new draft. Publication or rollback switches the complete revision atomically and invalidates affected localized caches.

Operational settings should be limited to those a member of staff must change, such as making a withdrawn catalog item unavailable or disabling a failing integration. Show the proposed change and its user impact before saving. Reject concurrent publication against an obsolete version. Exclude any ad scripts from staff and private work surfaces. Review consent vendor configurations through the chosen provider's approved flow. The site can link to those settings without inventing a duplicate consent-management system.

**Acceptance.** A catalog operator prepares an item with its attribution. A staff publisher releases it, then withdraws it. Cached public views reflect each action within the agreed cache window. A locale editor can edit only assigned locales and cannot publish or alter permissions. CI rejects invalid interface message placeholders. A mistaken content translation can be restored with its audit history intact. The first protected request after a grant revocation commits is denied.

## MOB-01 Mobile optimized experience

Ship the Phase 1 responsive site to mobile users from the start. Phase 3 adds a deeper touch authoring experience in the same web application. Put swatches in a single column at narrow widths. Show the color name, exact value, copy action and lock state in each row. Keep Generate, Export and Undo reachable, account for safe areas and the software keyboard, and move supplementary tools into a labelled menu. Reordering also works with Move up and Move down. A color field accepts typed or pasted values when picking from the screen is unavailable. Show reversible changes and errors close to their cause, and preserve a draft across supported orientation changes and interrupted navigation.

The Share action previews exactly what leaves the device. On a supporting browser, a user gesture opens the platform share sheet. Offer a copied palette link, a JSON backup, and a downloadable visual when a share target or file type is unavailable. Check file support before invoking native sharing. A dismissed share sheet returns to the draft without a success message. If clipboard permission is denied, present selectable text. Browser-local collections can be transferred using a validated backup, with counts and a duplicate-resolution preview before import. A public link includes only the snapshot the user approved. Private project links continue to require membership, and exported files behave as copies. Label whether the operation shares a private project link or an independent palette copy. [W3C Web Share API](https://www.w3.org/TR/web-share/)

Provide image selection from the device through supported browser pickers, decode and extract locally and allow cancellation. If the image exceeds an agreed pixel or memory limit, offer a smaller rendition before processing. Storage exhaustion, orientation changes and unsupported file formats leave the user with an actionable recovery path. Keep offline capabilities explicit, including which previously loaded editors remain usable and when catalog or protected server data requires connectivity. Respect reduced motion, browser zoom, keyboard access, screen-reader labels and target sizing in both orientations. Avoid an advertising overlay near touch actions. Suppress third-party advertising on private editing and consent screens.

**Acceptance.** On actual iOS Safari and Android Chrome, exercise create, lock, reorder, compare a pair, save, reopen and export. Test a 320 CSS pixel viewport, zoom, rotation, a visible software keyboard and focus recovery after the share dialog. Verify shared JSON reimports with the same colors, alpha, order and role links. Test cancellation, permission denial and unsupported file sharing. Confirm the primary tools remain available when optional cookies are rejected. A native app release would require a separate product and distribution decision.

## EXT-01 Browser Companion

Use a Manifest V3 popup with local palette generation, exact value entry, copying and a user-invoked page color picker. Limit permission requests to the implemented capture path. Chrome's `activeTab` permits temporary access for a user-invoked action on a permitted current tab. Restricted pages and some navigations end or prevent access. When a page cannot be sampled, explain the state and offer manual entry or opening the website's image picker. A successful pick adds a color locally and records its exact value. Do not retain page URLs, page text, screenshots or browsing history as part of the palette. [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)

**Handoff and tests.** The popup previews the colors and asks the user to open them in Palette Studio. Use the same versioned palette import contract as the website. Extension storage remains distinct from the website's local collection. Verify a permitted page, a restricted page, dismissal, storage denial, invalid payload, lock preservation and alpha round trip. Release is complete when an approved distribution supports installation and the end-to-end capture and handoff path works in a clean browser profile. The site reflects the actual installation status throughout rollout.

## AI-01 Read only AI platform connector

The external connector lets an AI client answer questions such as “Which released theme does this project use, and what is the contrast of its action label?” A separate in-site Color Guide interprets color requests and offers changes for a user to apply. Build a thin adapter that uses the protected application services and the same color engine. Proposed MCP operations are `search_catalog`, `get_palette`, `get_released_theme` and `check_contrast`. The first two expose only approved public catalog representations. The public theme operation reads an active, unwithdrawn release by its release identifier. The protected project operation reads only the current, unwithdrawn released revision for the selected project, including a release marked for project members. It must refuse drafts, superseded or withdrawn releases and arbitrary revision-history lookups, even when the same user may read committed history in the member portal. Return stable role keys and color values required to answer the question. The contrast operation computes a result from supplied colors or authorized role pairs. Bound search size and pagination. [MCP tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)

For protected HTTP access, implement the selected protocol revision's authorization discovery, authorization code flow with PKCE and resource-specific audience validation. Show the client name, requested permissions and projects on the grant screen. A public catalog operation requires no private grant. Phase 3 also requires a protected project connector. Require `project:read` and a selection of authorized projects for every protected theme read. Bind the private grant to the actor, client and selected project IDs and intersect it with current membership on every call. The shared release-read service enforces audience visibility, release status and project membership. The connector exposes only this release-read path. Portal revision-history access is a separate authorized operation. Include short-lived credential handling and a place for the user to review or revoke a grant. Validate issuer, expiration, audience and scope. Reject unapproved project IDs, expired/revoked grants and reads after membership removal. Use safe, distinct responses for invalid credentials, insufficient authorization, unknown version, unsupported inputs, throttling and upstream unavailability. Avoid disclosing private object existence to a caller who lacks access. [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)

Return minimal structured JSON with a version, relevant IDs, color space, alpha, exact values, role names, contrast threshold and computed ratio where applicable. Local browser collections, private drafts, source images, chat history, account attributes, raw database rows and staff functions remain outside the connector contract. Treat descriptive content as data. The adapter has no public operation for project creation, editing, publishing, deleting, changing membership or writing a catalog entry. An advertised read-only hint supplements server-side authorization. Provide concise integration examples for one compatible client and a reproducible client-level acceptance test. Track request counts, latency and errors without retaining prompts, tokens or private payloads.

**Release lookup.** The anonymous call takes a public release ID. The protected call takes both a project ID and a theme asset ID, identifies that asset's one current release, and checks that the asset belongs to the requested project. A grant covers only the projects expressly selected by the member. Require current access to the selected project and active grant on each request. Send `Cache-Control: no-store` for all theme release lookups, including anonymous reads. A public or project-only release can therefore become unavailable on the first new request after a withdrawal or supersession commits. Downloaded copies remain with their recipients.

**Acceptance.** The client gets a current public theme and reproduces the website's contrast result. The former public URL stops serving the release after supersession. A consenting member can read a selected project's requested theme asset, including a project-only release. Draft, historical and withdrawn revisions stay outside this interface. A wrong-audience token, expired or revoked grant, missing `project:read`, disabled integration, removed membership, mismatched asset and project, or unselected project produces a controlled response without private data. The first protected request after committed revocation is denied. Both anonymous and protected reads ship before Phase 3 acceptance. A different client requires its own grant.

## Dependencies and release evidence

| Workstream | Dependency before implementation | Evidence for acceptance |
| --- | --- | --- |
| Shared project data | Confirm identity provider, project scope, membership, roles, IDs, migration authority and schema version using the real platform | Signed-off mapping from durable identity and project keys to authorization decisions, with scoped read/write checks and anonymized test fixtures |
| DEV-01 and ADM-01 | Versioned palette and role contracts, data repository layer, constraints, permission policies and transactional release service | Cross-project access isolation, stable revision downloads, retry safety, stale edit handling, locale rollback and audit history |
| MOB-01 | Responsive accessible Phase 1 editor, same engine and validated importer/exporter | Device tests across supported browser capabilities, private draft recovery and file fidelity |
| EXT-01 | Stable website handoff schema, local color package and permission review | Capture and denial flows verified. Installation listing and privacy statement match requested permissions. |
| AI-01 | Released-theme read model, protected service APIs, grant model and compatible authorization server | Client integration, resource-bound grant tests, membership revocation and numerical parity with the website |

The shared release record covers Phase 2 staff publication and Phase 3 developer portal, mobile release and export, authorized connector, approved Chrome installation, and a player journey in the agreed existing game. Private operations use private cache rules and carry no advertising.

## Color and export acceptance fixtures

Use identical fixtures in Studio, Contrast Lab, the portal and the AI connector. Keep full precision until display. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [CSS Color 4](https://www.w3.org/TR/css-color-4/) · [Compositing and Blending](https://www.w3.org/TR/compositing-1/)

| Fixture | Expected result at the user interface or export boundary |
| --- | --- |
| Opaque sRGB text | Black and white give 21:1. Identical colors give 1:1. An unrounded result below 4.5 fails the normal-text AA threshold, even if the displayed ratio rounds to 4.50. |
| Transparency | Resolve the background against a declared opaque backing surface, then the foreground against that resolved background. Show both effective colors and a changed result when the backing color changes. |
| Color preservation | An OKLCH or Display P3 input keeps its source coordinates and alpha. Mark any sRGB fallback. For an opaque-only export, ask for an explicit backing surface and show the resulting swatch. |
| Gradient | At the two endpoints, return the corresponding stop values. Preserve an intentional hard edge. Sample translucent stops using the selected interpolation space and its specified alpha treatment. |
| Portable documents | Import a versioned JSON file on a second device. The color IDs, roles, order and precision survive. A missing role reference produces a recoverable error and preserves the original document. |
| Rendered and code output | Parse ASE with an independent reader. Compile CSS and both pinned Tailwind examples. Render SVG, PNG and PDF with a known palette and compare output dimensions and values within the documented tolerances. |
