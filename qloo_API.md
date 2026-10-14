# Qloo API Integration Guide

## Official references
- Qloo docs: https://docs.qloo.com/
- Public API documentation/OpenAPI repository: https://github.com/qloo/docs-public
- Hackathon developer guide/key setup: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key

**Important:** verify endpoint names, auth header, query parameters, entity types, response shape, rate limits and plan access against current docs and your hackathon key. Examples from old blog posts may be stale.

## Verified integration (docs checked 2026-10-10)

Sources: hackathon developer guide, `GET /search` and Insights deep-dive reference pages, and
`github.com/qloo/docs-public` (last commit 2026-02-25).

| Item | Value used in `apps/api/app/services/qloo/client.py` |
|---|---|
| Base URL | `https://hackathon.api.qloo.com` (hackathon keys don't work on staging/prod hosts) |
| Auth | `X-Api-Key: <key>` request header |
| Entity search | `GET /search?query=<text>&types=<urn>&take=6`; 404 means "No results" |
| Insights | `GET /v2/insights?filter.type=<urn>&signal.interests.entities=<id,id>&take=<n>` (take ≤ 50) |
| Types used | `urn:entity:artist`, `movie`, `tv_show`, `brand`, `book`, `podcast` (all listed for both search and Insights) |
| Track/song type | **None exists.** The guide says to use `urn:entity:artist` for music. The app is artist-level; song titles come from iTunes Search, labelled |
| Response fields read | Insights `results.entities[]`: `entity_id`, `name`, `properties.{release_year, short_description, description, image.url}`, `tags[].name`. Search `results[]`: same entity fields |
| Rate limits | Not published ("high enough for typical hackathon projects"). We handle 429 with ≤ 2 backoff retries |

| Tag lookup | `GET /v2/tags?filter.query=<text>&take=<n>` → `results.tags[].{id, name, type}` (build time only) |
| Tag affinity | `GET /v2/insights?filter.type=urn:tag&filter.results.tags=<urn,…>&signal.interests.entities=<id,…>&take=<n>` → `results.tags[].{tag_id, query.affinity}`; tags with no affinity are omitted (checked live 2026-10-14) |

### Layout suggestions with Qloo (admin switch, 2026-10-14)

Qloo doesn't know our layouts, so the mapping is ours and the scoring is Qloo's:
1. `apps/api/scripts/layout_tags.py` collects terms per layout: how Pinterest classifies the layout's
   reference pins (`design-refs/pinterest/pin_meta.json`: visual annotations, category breadcrumbs,
   related interests) plus the layout's own moods/style tags/keywords. Each term is resolved to real
   tag ids via `/v2/tags` (exact name match; only tag types that get affinity from artist/film
   signals: `style:qloo`, `genre:music`, `genre:media`, `subgenre:qloo`, `keyword:qloo`,
   `music:qloo`, `artist:qloo`, `audience:qloo`). Output: `layout_tags.json` (≤ 6 tags per layout).
2. At analysis time, with the switch on, one tag-affinity call per 50 tags scores those tags against
   the same entities as the artist/film calls (confirmed seeds + the photo-vibe artist).
3. A layout's Qloo fit = weighted mean of its tags' affinities (missing = 0), scaled so the best
   layout is 1. It replaces the keyword match and leads the score (see `layouts.py`); photo fit
   stays in so a single photo doesn't get a 4-photo grid. Switch off = the local ranking unchanged.

Queries the app makes per analysis (only when the user confirmed ≥ 1 seed): two Insights calls,
`filter.type=urn:entity:artist` (take 8) and `filter.type=urn:entity:movie` (take 5), both
signalled by the confirmed entity IDs. Seeds are excluded from results. Each taste search is one
`/search` call, triggered only on submit and rate-limited per session.

Browser input never reaches Qloo as raw parameters. `entity_type` is an app enum mapped to URNs
server-side. `entity_id` must be UUID-shaped and comes from a prior `/search` result. Free-text
mood words are never sent as tags or URNs.

Error mapping: 401/403 → `QLOO_AUTH_FAILED` (no retry); 400 → `QLOO_INVALID_QUERY`;
429 → retry, then `QLOO_RATE_LIMITED`; 5xx/transport → retry, then `QLOO_UPSTREAM_ERROR`;
timeout → `QLOO_TIMEOUT`; non-JSON or missing `results` → `QLOO_UPSTREAM_ERROR`. During
analysis a Qloo failure degrades the result: layouts still return and
`provenance.qloo_error` carries the code, which the UI shows.

Caching: **not implemented**. Qloo's terms on caching weren't verified.

### Live-key status
No Qloo key was available while building. Every behaviour above is covered by mocked tests built
from documented response shapes (`apps/api/tests/fixtures/qloo/`, marked as doc-derived). Run
`pnpm api:test -- -m integration -s` with `QLOO_API_KEY` set to verify live, and then record the
date and outcome here.

## Capability boundaries

| Need | Qloo role | Other component |
|---|---|---|
| Analyze uploaded image pixels/colors | Do not assume Qloo supports this | Vision model/manual controls |
| Resolve artist/film/brand | Supported entity search/lookup, subject to current docs | UI disambiguation |
| Return related entities/tags | Insights/taste endpoints with valid signals | Normalization/ranking |
| Render layouts | Not Qloo's job | Canvas/SVG engine |
| Return exact song track | Unverified until track types and fields are tested | Track catalogue/provider if needed |
| Play/distribute music | Not implied by recommendations | Licensed provider/Instagram native flow |

## Authentication and secrets
- Put the Qloo key in `QLOO_API_KEY` on FastAPI.
- Confirm the current documented auth header; Qloo references commonly use `x-api-key`, but validate before shipping.
- Never expose key to browser, `NEXT_PUBLIC_*`, logs or analytics.
- Do not accept arbitrary Qloo URLs/query strings from the browser.
- Redact authorization headers and provider details from logs.

## Integration workflow

### 1. Inspect current schema
Confirm:
- entity search/lookup endpoint,
- Insights endpoint,
- auth header,
- supported `filter.type`/target types,
- signal parameter names,
- pagination/limit controls,
- errors and rate-limit behavior,
- whether track entities are enabled.

Save sanitized response fixtures in `apps/api/tests/fixtures/qloo/`. Record test date/schema version here.

### 2. Resolve user taste seed
User enters an artist, film, brand or other supported entity. Call documented search/lookup, then present disambiguation options. Use the provider-returned ID and type, not a fabricated URN.

Internal normalized object example (placeholder values):
```json
{
  "provider": "qloo",
  "entity_id": "provider-returned-id",
  "name": "provider-returned-name",
  "entity_type": "provider-returned-type",
  "source_query": "user-entered query"
}
```

### 3. Retrieve recommendations
Conceptual flow:
`user seed → entity search → user confirms match → Insights query with resolved signal → supported target type → normalized results`

Do not send free-form image labels directly as entity URNs. Resolve them through supported search/tag mechanisms first. Do not copy unverified example URNs into production.

### 4. Normalize responses
Keep raw Qloo response parsing inside the adapter. UI should consume an internal schema such as:
```json
{
  "provider": "qloo",
  "kind": "artist",
  "provider_id": "opaque-provider-id",
  "name": "verified provider-returned name",
  "url": null,
  "evidence": [
    {
      "type": "seed_entity",
      "label": "user-confirmed taste seed",
      "provider_id": "opaque-seed-id"
    }
  ]
}
```
Populate only fields returned by the provider. Never invent scores, URLs or descriptions.

## Music fallback
1. If current Qloo schema/account supports track entities, query and verify title, artist and ID.
2. Otherwise show the Qloo-informed artist recommendation.
3. Optionally resolve a track from a permitted metadata catalogue/provider, clearly identifying its source.
4. Do not scrape streaming sites or download copyrighted audio.
5. Let the user add the track using Instagram's native music sticker.
6. If no verified track exists, show “Artist suggestion” rather than inventing a song.

## Visual mood integration
Vision output may include `cinematic`, `warm`, `night`, `streetwear`. These are visual descriptors, not automatically valid Qloo identifiers. Use confirmed user seeds for taste; Qloo supplies cultural associations; local rules select the layout.

Track provenance explicitly:
- `visual_signal`: vision/manual output.
- `taste_seed`: user-confirmed entity.
- `qloo_result`: actual provider result.
- `layout_rule`: local choice.
- `track_metadata`: Qloo or named catalogue/provider.

## Error handling, caching, quotas
- Explicit connect/read timeouts.
- Bounded retries with backoff only for transient failures.
- No repeated retries for invalid credentials/queries.
- Handle rate-limit responses and provide a retry path.
- Per-session analysis limit.
- Request IDs and redacted logs.
- Cache only where provider terms permit it; key includes all normalized query inputs and schema/API version.
- Do not persist personalized taste data indefinitely without a product need.

Suggested internal error codes:
`QLOO_AUTH_FAILED`, `QLOO_RATE_LIMITED`, `QLOO_TIMEOUT`, `QLOO_INVALID_QUERY`, `QLOO_EMPTY_RESULTS`, `QLOO_UPSTREAM_ERROR`.

## Adapter sketch
```python
class QlooClient:
    async def search_entities(self, query: str, entity_type: str | None = None):
        # Call current documented entity-search endpoint.
        ...

    async def get_insights(self, *, resolved_signals, target_type: str, limit: int = 10):
        # Call current documented Insights endpoint with validated parameters.
        ...
```
These are app-level method names, not Qloo API endpoint names.

## Validation checklist
- [x] Current official docs/schema inspected (2026-10-10).
- [ ] Key works from server-side request — **blocked: no key yet** (integration test ready).
- [ ] Search resolves three known artists and one film/brand live — blocked on key.
- [x] Ambiguous names can be disambiguated (UI lists candidates; user picks).
- [ ] One documented Insights query succeeds live — blocked on key (mocked tests pass).
- [x] Supported target entity types confirmed from docs.
- [x] Track-level support: no track entity type in docs → artist-level + iTunes fallback.
- [x] Empty results, invalid query/key, timeout, rate limit, malformed responses tested (mocked).
- [x] Doc-derived fixtures saved (live sanitized fixtures pending key).
- [ ] Caching rules — not verified; caching disabled.
- [x] Key absent from browser bundle (build scanned), client responses (tested) and logs.

## Proof for judges
Show selected seed, resolved provider entity, sanitized Qloo results and the recommendation influenced by them. Compare the same photo with two different taste seeds. Do not claim population-level predictive accuracy based on a small demo.
