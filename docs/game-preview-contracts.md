# Game preview data contracts

The six adapters are **fixture-only**. Color Kitchen consumes approved display projections. Live services, canonical owners, external ID mappings and authorization contracts require verification for the agreed game.

| Adapter | Output fields | Live owner and binding evidence needed |
| --- | --- | --- |
| User summary | Approved display label | Identity or player service owner, authenticated subject mapping and permission |
| Puzzle | Column count and preview cell states | Puzzle service owner, game and puzzle keys, published visibility and layout contract |
| Word resource | Localized sample label and license | Lexicon owner, localized resource key, permitted test-label use and rights |
| Session | Display phase and active cell | Session service owner, session and subject keys and own-session authorization |
| Result | Published display outcome | Results owner, result key, completion and publication contract |
| Leaderboard | Ordered ranks and approved labels | Ranking owner, leaderboard key, visibility and approved display projection |

The adapter checks current project membership, exact organization, project, game, record and locale. The user and session adapters require the authorized subject. Providers supply observation timestamps and an explicit preview visibility decision. A fixture expires after five minutes. The caller can distinguish ready, missing, stale, denied and unavailable. Recheck membership before returning a ready result.

Live bindings stay disabled while their mapping, version and authorized read interface are unverified. Fixture tests use synthetic records and exercise missing, stale, private, unpublished and cross-project cases.
