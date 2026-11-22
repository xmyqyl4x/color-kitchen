# Private HTTP API

The project and theme API accepts a signed application access token through `Authorization: Bearer ...`. A same-origin sign-in gateway can also set `__Host-ck_session` with the token and the `Secure`, `HttpOnly`, `Path=/`, and `SameSite=Lax` attributes. Cookie-authenticated writes require the exact application `Origin`. Set `COLOR_KITCHEN_ORIGIN` to that origin behind a reverse proxy.

Set `COLOR_KITCHEN_IDENTITY_ISSUER`, `COLOR_KITCHEN_IDENTITY_AUDIENCE`, and `COLOR_KITCHEN_IDENTITY_PUBLIC_KEY` together. The verifier accepts an RS256 `at+jwt` access token with an exact issuer, the configured application audience, `sub`, `org_id`, and an `iat` and `exp` at most 15 minutes apart. The key is a pinned RSA public key in PEM format. The issuer must provision its opaque organization and subject mapping in PostgreSQL, where each request also checks current membership. Issue a separate audience for this application and coordinate signing-key rotations with the application deployment. Production identity mapping and account-disable behavior need issuer verification before activation. There is no public sign-in endpoint in Color Kitchen. [JWT access token profile](https://www.rfc-editor.org/rfc/rfc9068.html#section-4)

## Project themes

Use `/api/v1/projects` to list the caller's active projects. In the paths below, `A` represents `/api/v1/projects/{projectId}/assets` and `T` represents `A/{assetId}`. All IDs are UUIDs.

| Method and path | Input and result |
| --- | --- |
| `GET A` | List themes. Use `limit` (1–99, default 20) and the returned `next` UUID in `after`. |
| `GET T` | Read the asset, its active release, and its row-version ETag. |
| `POST T/revisions` | Create or edit using `{name,snapshot}`. Fork using `{name,sourceAssetId,sourceRevision}` with a fresh destination asset ID. Restore using `{name,sourceRevision}`. Send the head revision in `If-Match`, or `"0"` for a new asset, plus a UUID `Idempotency-Key`. |
| `GET T/revisions/{rev}` | Read the committed revision and its ETag. |
| `GET T/revisions/compare?before=1&after=2` | Compare swatch order, colors and role assignments. |
| `GET T/revisions/{rev}/export?format=json` | Export the selected revision in `json` or `css`. |
| `GET T/revisions/{rev}/preview?locale=fr` | Return six localized reference views with `source: "fixture"`. Requests for `mode=live` are unavailable until a provider is verified. |
| `POST T/releases` | Owners send `{revision,audience?,confirmPublic?}`. The audience defaults to `project`. For `public`, set `confirmPublic` to `true`. |
| `DELETE T/releases/{releaseId}` | Owners withdraw that specific active release. |
| `GET /api/v1/theme-releases/{releaseId}` | Read a current public release without signing in. Add `/export?format=json` or `/export?format=css` for a file representation. |

Release and withdrawal require the asset row-version in `If-Match` and a current UUIDv7 `Idempotency-Key`. Retries keep both original headers and their original request body. Reusing the key with new input returns `409`. A stale new write returns `412` with the current version and ETag. A missing precondition returns `428`. Inaccessible and missing themes share a `404` response. All theme routes use `Cache-Control: no-store`.
