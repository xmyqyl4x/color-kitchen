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

## Color Guide

Send an anonymous JSON POST to `/api/v1/guide` when the user submits the prompt. Browser clients use the same origin. The server limits the HTTP body to 16 KiB and verifies the exact shape.

```json
{
  "submitted": true,
  "locale": "fr",
  "prompt": "Propose un texte plus foncé",
  "history": [],
  "shareSwatches": true,
  "selectedColors": [{"space": "srgb", "components": [0.3, 0.4, 0.5], "alpha": 1}]
}
```

The supported locales are `en`, `fr`, `es`, `pt` and `de`. Prompts allow 2,000 characters. History is optional with up to eight `{role,text}` turns (`user` or `assistant`, up to 1,000 characters each). Send at most twelve color values only with explicit `shareSwatches: true`. Success returns `{version,requestId,locale,data}`, with computed contrast assessments in `data.suggestion` when requested. Errors include `requestId` and `error.code` with `localAvailable: true`. A 429 carries `Retry-After` and `error.retryAt` when available. There are distinct errors for invalid requests, unavailable service, invalid provider output and provider timeouts. All replies use `Cache-Control: no-store`.

Configure the optional server-side provider with `AI_GATEWAY_API_KEY`, `COLOR_KITCHEN_GUIDE_MODEL` (provider/model), `COLOR_KITCHEN_GUIDE_REQUESTS_PER_MINUTE` and `COLOR_KITCHEN_GUIDE_DAILY_UNITS`. Daily units conservatively budget the input and maximum output. Keep the key in the server environment. Hosted replies require configured credentials and budget. Local guidance remains available independently.
