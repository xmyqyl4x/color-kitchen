# Public HTTP API v1

Build with `npm run build`, then run `npm start` with `DATABASE_URL` set to a migrated database. Set `HOST`, `PORT` and `COLOR_KITCHEN_ORIGIN` for the intended environment. The development default is loopback port 3000.

## Catalog, policies and messages

| GET or HEAD | Representation |
| --- | --- |
| `/api/v1/catalog/{kind}` | Cursor-paged catalog. Supported kinds are `palette`, `gradient`, `color`, `font` and `template`. |
| `/api/v1/catalog/{kind}/{slug}` | The current published entry with its locale, canonical path and alternate paths. |
| `/api/v1/policies/{slug}` | Current published `licensing`, `terms`, `privacy` or `cookies` policy. |
| `/api/v1/locales[/{locale}]` | The released ICU message bundle and language registry. |

Each JSON success has `version`, `locale` and `data` fields. Use `locale=en|fr|es|pt|de` or the locale bundle path to select a language. Otherwise the server uses weighted `Accept-Language` preferences followed by English. Responses include `Content-Language` and `Vary: Accept-Language`. An explicit unsupported locale returns 400. Cookies do not affect these representations.

List parameters are optional and each can occur once. Use `q` for a word or URL-encoded HEX (up to 120 characters), `family` and `mood` for lower-case hyphenated slugs, `count` for 2–12, `lightness=dark|medium|light`, `sort=featured|popular` and `limit` for 1–50. Use the returned `nextCursor` unchanged with the same language, filters and sort. The default is Featured with 20 items. A Popular fallback reports the effective sort and reason.

Published content revalidates every time to reflect withdrawals immediately. Locale messages can be cached for five minutes. Send the returned `ETag` as `If-None-Match` to get a bodyless 304 for an unchanged representation. Errors use `{"version":1,"error":{"code":"not_found"}}` and `Cache-Control: no-store`. Expect 400 for invalid queries, 404 for absent or unpublished records, 405 for unsupported methods and 503 for catalog unavailability.

| Example | Result |
| --- | --- |
| `/api/v1/catalog/palette?locale=en&limit=1` | English first page |
| `/api/v1/catalog/palette/forest-study?locale=fr` | French detail after development seed |
| `/api/v1/locales/es` | Spanish interface messages |
| `/api/v1/locales/pt` | Portuguese interface messages |
| `/api/v1/catalog/palette/forest-study?locale=de` | German detail after development seed |
| `/api/v1/catalog/palette/missing-example?locale=en` | 404 with `not_found` |
| `/api/v1/locales/ja` | 400 with `unsupported_locale` |
