# Acceptance Criteria

Status as of 2026-10-10: `[x]` = verified by automated tests or a browser run in this repo; unchecked items note what blocks them.

These are pass/fail checks, not just UI tasks.

## A. Setup/repository
- [x] `pnpm install` succeeds with committed lockfile.
- [x] `pnpm dev` starts Next.js and FastAPI via documented orchestration.
- [x] FastAPI `/health` returns success.
- [x] Python virtualenv setup is documented.
- [x] `.env.example` has placeholders only; real env files are gitignored.
- [x] README includes setup and deployment.

## B. Upload/S3
- [x] JPEG, PNG and WebP accepted.
- [x] Unsupported, corrupt and oversized files rejected clearly.
- [x] User can preview, replace and remove photo.
- [x] Server validates size/type and actual image decoding.
- [ ] Bucket private with Block Public Access enabled. — documented commands/policies in README + `docs/aws/`; no bucket provisioned yet.
- [x] Browser uses short-lived presigned URL; no AWS secrets in browser.
- [x] Random object keys; not derived directly from original filename.
- [x] Expired/unauthorized URLs rejected.
- [ ] Temporary objects expire through lifecycle/cleanup. — `docs/aws/lifecycle.json` (1 day) + delete on Start over (tested locally).

## C. Visual analysis
- [x] Returns broad visual features or asks for manual mood selection.
- [x] Manual mode works if vision provider is unavailable.
- [x] No face recognition or sensitive-attribute inference.
- [x] Low-confidence/empty vision response does not crash flow.
- [x] Any external image processing follows provider terms and is disclosed.

## D. Qloo
- [x] Qloo called only server-side.
- [x] API key never returned to client.
- [ ] User seed resolves through supported endpoint. — implemented + mocked tests; live run blocked on Qloo key.
- [x] Ambiguous matches can be confirmed by user.
- [ ] One documented Insights query succeeds. — implemented + mocked tests; live run blocked on Qloo key.
- [ ] At least one actual Qloo result visibly influences recommendation. — music card, Qloo panel and tag-based ranking; live run blocked on key.
- [ ] Changing seed changes at least one cultural recommendation in a controlled test. — passes with mocked provider (`test_seed_changes_cultural_results`); live pending key.
- [x] UI distinguishes Qloo data, visual data and local template rules.
- [x] Invalid key, timeout, rate limit, malformed response and empty results handled.
- [x] No static sample is falsely labelled as live Qloo output.

## E. Layout/editor
- [x] At least three distinct layouts for valid input.
- [x] Each layout has a name and rationale.
- [x] Crop can be adjusted/reset.
- [x] Caption/headline, size, color, alignment and position editable.
- [x] Text readable and inside safe margins.
- [x] Portrait, square and landscape images supported.
- [x] Switching layouts preserves the source image.
- [x] Mobile and desktop usable.

## F. Music
- [ ] Verified artist displayed. — artist comes from Qloo results; live pending key.
- [x] Track title shown only with verified metadata.
- [x] Artist-level result labelled as artist suggestion.
- [x] No unlicensed audio downloads/redistribution.
- [x] Links valid, never fabricated.
- [x] Instructions explain native Instagram music sticker where available.

## G. Export
- [x] PNG dimensions exactly 1080×1920.
- [x] Includes selected layout, crop, text and decorations.
- [x] Excludes editor controls.
- [x] Works without paid image-generation API.
- [x] Safe filename.
- [x] Export errors offer retry.

## H. Privacy/security
- [x] Qloo key, AWS secret and Supabase service-role key absent from browser bundles.
- [ ] Production CORS restricted. — `CORS_ORIGINS` allowlist + S3 CORS template; production values set at deploy.
- [ ] S3 bucket private. — see B; pending provisioning.
- [ ] Supabase RLS enabled if user-owned data stored. — no user data stored (Supabase not used); schema has RLS.
- [x] Raw photos not stored in Postgres.
- [x] Deletion/retention documented and tested.
- [x] Signed URLs and credentials not logged.
- [x] Rate limits/timeouts prevent uncontrolled API use.

## I. Reliability/performance
- [ ] Measure end-to-end timing; target under 10 seconds p95 for typical image excluding free-host cold starts. — local: analysis ≈50 ms without Qloo; with Qloo bounded by 8 s timeout. Not measured against production.
- [x] External requests have timeouts.
- [x] Repeated clicks do not create unbounded Qloo calls.
- [x] Stale results cannot overwrite a newer image's results.
- [x] Provider outage does not break editor.
- [x] Errors have recovery actions.

## J. Differentiation experiment
- [ ] Test at least five images and three taste profiles.
- [ ] Compare no seed, seed A and seed B for same photo.
- [ ] Save sanitized Qloo evidence.
- [ ] At least one cultural/artist result changes across seeds.
- [ ] Human reviewer can explain why output differs.
- [x] No unsupported claim of proven engagement lift.

## K. Public submission
- [ ] Demo URL works in incognito without private access.
- [ ] Main flow works end-to-end.
- [ ] Public repo has source, setup and open-source license.
- [ ] Production secrets configured outside source control.
- [x] Live Qloo behavior distinguishable from preview/sample mode.
- [x] Mobile browser tested.

## Release gate
Do not submit until upload/S3, Qloo, editor, music truthfulness, export, security and public demo criteria pass. If track-level Qloo support is absent, artist-level Qloo recommendation plus a clearly attributed metadata fallback is acceptable.
