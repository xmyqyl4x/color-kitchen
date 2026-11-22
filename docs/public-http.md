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

## Inquiries, consent and aggregate use

| Method and path | Request and success |
| --- | --- |
| POST `/api/v1/inquiries/contact` | `{requestId,purpose,locale,replyEmail,message}`. Use `support`, `privacy`, `accessibility` or `licensing`. A durable queue receipt returns 202. |
| POST `/api/v1/inquiries/advertising` | Same fields with purpose `advertising`. A durable queue receipt returns 202. |
| GET `/api/v1/consent` | Returns both verified optional choices, defaulting to false. |
| POST `/api/v1/consent` | Set `{advertising:boolean,analytics:boolean}`. Both false withdraws the choice and removes its first-party cookie. |
| POST `/api/v1/events/catalog-open/nonce` | Send only `{itemId}` after an explicit public palette open. Returns the signed action token. |
| POST `/api/v1/events/catalog-open` | Send only `{token}` and reuse that token for retry. Returns 202 once counted or on safe replay. |

Use a new UUID for each inquiry and retain it across retries with the same content. Matching retries return the original receipt during the first 24 hours, changed content returns 409, and expired receipts return 410 while retained. A queue receipt confirms acceptance for processing. Messages allow up to 12,000 characters and reply addresses up to 254. Private workspace data belongs on the device.

Requests stay on the same origin and all responses use `no-store`. Event intake checks the signed consent cookie on every request, returns 403 for disabled measurement, and accepts only published palettes. Signed event tokens expire after 24 hours and carry no user identifier. The signed choice lasts up to 90 days. A deployment uses HTTPS for the Secure, host-only consent cookie.

Configure independent 32-byte hex keys with `COLOR_KITCHEN_CONTACT_ENCRYPT_KEY`, `COLOR_KITCHEN_CONTACT_HMAC_KEY`, `COLOR_KITCHEN_CONSENT_KEY` and `COLOR_KITCHEN_EVENT_KEY`. The contact key identifier defaults to `contact-v1`, and configurable inquiry retention defaults to 30 days. Keep previous contact keys in the deployment key resolver during rotation. Event counting also requires `COLOR_KITCHEN_MEASUREMENT=true`. Delivery runs separately through the configured inquiry worker and provider.

For an approved inquiry receiver, set `COLOR_KITCHEN_INQUIRY_WEBHOOK` (HTTPS), `COLOR_KITCHEN_INQUIRY_TOKEN` and `COLOR_KITCHEN_INQUIRY_DEDUP_MS` to its documented idempotency window. The optional worker sends the accepted purpose, locale, reply address and message with a bearer token and a stable `Idempotency-Key`. A 2xx reply acknowledges the handoff. The receiver may return a non-sensitive `X-Delivery-Receipt` header. Select the receiver and verify synthetic delivery before turning it on.

`COLOR_KITCHEN_AD_FRAME_URL` optionally names an approved HTTPS advertising unit. Eligible pages reserve the space and load the frame only after verified advertising consent. The frame is sandboxed, receives no referrer, and is removed on withdrawal or navigation. The four policy destinations use the current published PostgreSQL revision and its effective date.
