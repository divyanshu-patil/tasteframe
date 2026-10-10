# Validation Matrix — Evidence and Tests

| Claim/assumption | Status (2026-10-10) | Official evidence | Test |
|---|---|---|---|
| Qloo entity search exists | **Docs verified**: `GET /search` (`query`, `types`, `take`); live call pending key | https://docs.qloo.com/reference/get-search | `tests/test_qloo_client.py`, `test_api.py::test_taste_search` (mocked); `-m integration` (live) |
| Qloo Insights returns related entities/tags | **Docs verified**: `GET /v2/insights`, `filter.type`, `signal.interests.entities`, `take` ≤ 50; live pending key | Insights deep dive; docs-public repo | `test_insights_normalizes_tags`, `test_seed_changes_cultural_results` (mocked) |
| Qloo directly analyzes uploaded photos | Not assumed; photos never sent to Qloo | Current docs list no image input | — |
| Qloo generates Story layouts | Not used; local Canvas renderer | — | `apps/web/lib/story/templates.test.ts` |
| Qloo returns track-level suggestions | **No**: no track/song entity type documented; guide says use `urn:entity:artist` | Hackathon developer guide | Artist-level card + iTunes metadata fallback (`test_itunes_exact_artist_match_only`) |
| Free vision processing is available | Local Pillow statistics; no third-party vision provider, no data leaves our API | — | `tests/test_services.py::test_vision_*` |
| iTunes Search API provides track metadata | Verified live with a manual request; used for title + Apple Music link only, exact artist match, no audio | https://performance-partners.apple.com/search-api | `test_itunes_*` (mocked) |
| Supabase is free for all use | Not guaranteed; used only for optional saved Stories (small JSON rows, 7-day expiry) | https://supabase.com/pricing | `tests/test_stories.py` (mocked PostgREST); live pending project keys |
| Real S3 bucket accepts presigned POST and enforces limits | Verified 2026-10-10 on `ap-south-1`: 204 upload, 11 MB rejected (`EntityTooLarge`), regional endpoint needed (global → 307) | — | `test_presign_uses_regional_endpoint`, manual curl, browser e2e |
| S3 is free for all use | False as a blanket guarantee; lifecycle 1-day expiry + 10 MB cap bound cost | https://aws.amazon.com/s3/pricing/ | `tests/test_storage_s3.py` (Stubber) |
| Hosting is always free | False as a blanket guarantee; not deployed yet | Provider plan pages | — |
| Exported PNG contains an interactive music sticker | No; the UI directs users to Instagram's native Music sticker | — | UI copy in `MusicCard` |
| Qloo meaningfully changes output | Seed → Insights results → music + Qloo-tag-driven layout ranking | Controlled test | `test_seed_changes_cultural_results`, `test_cultural_tags_shift_ranking` (mocked); live comparison pending key |
| Export is exactly 1080×1920 | Verified in headless Chrome (desktop + 390px mobile), all 8 templates | — | Manual e2e via Playwright (see README) + `editor.test.ts` |

## Evidence protocol
For every API test, record date, schema/version, endpoint family, sanitized parameters, status, sanitized response fixture, expected/observed behavior, quota headers and conclusion. Never commit keys, private photos, signed URLs or personal data.

## Go/no-go gates
**Go:** entity search and one Insights query work; output has traceable Qloo provenance; local editor/export works; music fallback is truthful.

**Revise scope:** required target type is unavailable; results cannot be traced to valid taste signals; static results are misrepresented as Qloo; or music requires scraping/unlicensed audio.
