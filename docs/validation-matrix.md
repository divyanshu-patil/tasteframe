# Validation Matrix — Evidence and Tests

| Claim/assumption | Status | Official evidence | Test |
|---|---|---|---|
| Qloo entity search/lookup exists | Verify current endpoint/schema | https://docs.qloo.com/ and https://github.com/qloo/docs-public | Search three known artists and one film/brand |
| Qloo Insights returns taste-related entities/tags | Capability family documented; exact parameters vary | Official Insights/taste-analysis docs | Run query with resolved entity signal and supported target |
| Qloo directly analyzes uploaded photos | Do not assume; this design treats it as unsupported | Current official API docs | Do not depend on it unless docs explicitly confirm |
| Qloo generates Story layouts | Not a Qloo responsibility here | Current official docs | Render locally with Canvas/SVG |
| Qloo returns exact track-level suggestions | Unverified until tested with current schema/key | Current entity types/OpenAPI | Check track type and returned title/artist/ID |
| Free vision processing is available | Depends on provider terms and quota | Provider pricing/data-use docs | Test quota, retention and image training terms |
| Supabase is free for all use | Not guaranteed | https://supabase.com/pricing | Check current quotas and project policies |
| S3 is free for all use | False as a blanket guarantee | https://aws.amazon.com/s3/pricing/ | Check storage, requests, region and egress |
| Hosting is always free | False as a blanket guarantee | Current provider plan | Verify bandwidth, cold starts and terms |
| Exported image can contain Instagram's interactive music sticker | No; PNG is not an interactive licensed sticker | Instagram/Meta product and music terms | Show track info and direct user to native sticker |
| Qloo meaningfully changes output | Product hypothesis | Controlled product test | Same image with two taste seeds; compare results |

## Evidence protocol
For every API test, record date, schema/version, endpoint family, sanitized parameters, status, sanitized response fixture, expected/observed behavior, quota headers and conclusion. Never commit keys, private photos, signed URLs or personal data.

## Go/no-go gates
**Go:** entity search and one Insights query work; output has traceable Qloo provenance; local editor/export works; music fallback is truthful.

**Revise scope:** required target type is unavailable; results cannot be traced to valid taste signals; static results are misrepresented as Qloo; or music requires scraping/unlicensed audio.
