# Acceptance Criteria

These are pass/fail checks, not just UI tasks.

## A. Setup/repository
- [ ] `pnpm install` succeeds with committed lockfile.
- [ ] `pnpm dev` starts Next.js and FastAPI via documented orchestration.
- [ ] FastAPI `/health` returns success.
- [ ] Python virtualenv setup is documented.
- [ ] `.env.example` has placeholders only; real env files are gitignored.
- [ ] README includes setup and deployment.

## B. Upload/S3
- [ ] JPEG, PNG and WebP accepted.
- [ ] Unsupported, corrupt and oversized files rejected clearly.
- [ ] User can preview, replace and remove photo.
- [ ] Server validates size/type and actual image decoding.
- [ ] Bucket private with Block Public Access enabled.
- [ ] Browser uses short-lived presigned URL; no AWS secrets in browser.
- [ ] Random object keys; not derived directly from original filename.
- [ ] Expired/unauthorized URLs rejected.
- [ ] Temporary objects expire through lifecycle/cleanup.

## C. Visual analysis
- [ ] Returns broad visual features or asks for manual mood selection.
- [ ] Manual mode works if vision provider is unavailable.
- [ ] No face recognition or sensitive-attribute inference.
- [ ] Low-confidence/empty vision response does not crash flow.
- [ ] Any external image processing follows provider terms and is disclosed.

## D. Qloo
- [ ] Qloo called only server-side.
- [ ] API key never returned to client.
- [ ] User seed resolves through supported endpoint.
- [ ] Ambiguous matches can be confirmed by user.
- [ ] One documented Insights query succeeds.
- [ ] At least one actual Qloo result visibly influences recommendation.
- [ ] Changing seed changes at least one cultural recommendation in a controlled test.
- [ ] UI distinguishes Qloo data, visual data and local template rules.
- [ ] Invalid key, timeout, rate limit, malformed response and empty results handled.
- [ ] No static sample is falsely labelled as live Qloo output.

## E. Layout/editor
- [ ] At least three distinct layouts for valid input.
- [ ] Each layout has a name and rationale.
- [ ] Crop can be adjusted/reset.
- [ ] Caption/headline, size, color, alignment and position editable.
- [ ] Text readable and inside safe margins.
- [ ] Portrait, square and landscape images supported.
- [ ] Switching layouts preserves the source image.
- [ ] Mobile and desktop usable.

## F. Music
- [ ] Verified artist displayed.
- [ ] Track title shown only with verified metadata.
- [ ] Artist-level result labelled as artist suggestion.
- [ ] No unlicensed audio downloads/redistribution.
- [ ] Links valid, never fabricated.
- [ ] Instructions explain native Instagram music sticker where available.

## G. Export
- [ ] PNG dimensions exactly 1080×1920.
- [ ] Includes selected layout, crop, text and decorations.
- [ ] Excludes editor controls.
- [ ] Works without paid image-generation API.
- [ ] Safe filename.
- [ ] Export errors offer retry.

## H. Privacy/security
- [ ] Qloo key, AWS secret and Supabase service-role key absent from browser bundles.
- [ ] Production CORS restricted.
- [ ] S3 bucket private.
- [ ] Supabase RLS enabled if user-owned data stored.
- [ ] Raw photos not stored in Postgres.
- [ ] Deletion/retention documented and tested.
- [ ] Signed URLs and credentials not logged.
- [ ] Rate limits/timeouts prevent uncontrolled API use.

## I. Reliability/performance
- [ ] Measure end-to-end timing; target under 10 seconds p95 for typical image excluding free-host cold starts.
- [ ] External requests have timeouts.
- [ ] Repeated clicks do not create unbounded Qloo calls.
- [ ] Stale results cannot overwrite a newer image's results.
- [ ] Provider outage does not break editor.
- [ ] Errors have recovery actions.

## J. Differentiation experiment
- [ ] Test at least five images and three taste profiles.
- [ ] Compare no seed, seed A and seed B for same photo.
- [ ] Save sanitized Qloo evidence.
- [ ] At least one cultural/artist result changes across seeds.
- [ ] Human reviewer can explain why output differs.
- [ ] No unsupported claim of proven engagement lift.

## K. Public submission
- [ ] Demo URL works in incognito without private access.
- [ ] Main flow works end-to-end.
- [ ] Public repo has source, setup and open-source license.
- [ ] Production secrets configured outside source control.
- [ ] Live Qloo behavior distinguishable from preview/sample mode.
- [ ] Mobile browser tested.

## Release gate
Do not submit until upload/S3, Qloo, editor, music truthfulness, export, security and public demo criteria pass. If track-level Qloo support is absent, artist-level Qloo recommendation plus a clearly attributed metadata fallback is acceptable.
