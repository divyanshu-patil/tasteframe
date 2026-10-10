# Qloo API Integration Guide

## Official references
- Qloo docs: https://docs.qloo.com/
- Public API documentation/OpenAPI repository: https://github.com/qloo/docs-public
- Hackathon developer guide/key setup: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key

**Important:** verify endpoint names, auth header, query parameters, entity types, response shape, rate limits and plan access against current docs and your hackathon key. Examples from old blog posts may be stale.

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
- [ ] Current official docs/schema inspected and test date recorded.
- [ ] Key works from server-side request.
- [ ] Search resolves at least three known artists and one film/brand.
- [ ] Ambiguous names can be disambiguated.
- [ ] One documented Insights query succeeds.
- [ ] Supported target entity types confirmed.
- [ ] Track-level support tested; fallback documented if unavailable.
- [ ] Empty results, invalid query/key, timeout and rate limit tested.
- [ ] Sanitized response fixtures saved.
- [ ] Caching/quota rules checked.
- [ ] Key absent from browser bundle, client response and logs.

## Proof for judges
Show selected seed, resolved provider entity, sanitized Qloo results and the recommendation influenced by them. Compare the same photo with two different taste seeds. Do not claim population-level predictive accuracy based on a small demo.
