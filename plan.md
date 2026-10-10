# Implementation Plan

## Scope

### P0 — MVP
- Upload image.
- Optional favorite artists/films/brands as taste seeds.
- Visual analysis or manual mood selection.
- Real server-side Qloo calls.
- Three distinct editable Story layouts.
- Verified track suggestion or clearly labelled artist-level fallback.
- 1080×1920 PNG export.
- Error handling and public deployment.

### P1 — useful
- Save story configuration to Supabase.
- Optional session history, feedback, more templates, sanitized evidence panel.
- Scheduled S3 cleanup and richer telemetry.

### P2 — defer
- Social login, collaborative editing, automatic Instagram posting, video/audio rendering, paid image generation, complex multi-agent framework.

## Phase 0: Qloo and cost validation (Day 1)
1. Read current Qloo hackathon guide and API schema.
2. Obtain key through official process; never paste it into source code.
3. Test entity search for three known artists and one film/brand.
4. Test one Insights query with a resolved entity signal and supported target type.
5. Confirm whether track-level entity types/fields are available to this key.
6. Record endpoint, request shape, response fixture, quota and errors in `qloo_API.md`.
7. Check current free-tier terms for vision, hosting, Supabase and S3; set budget alerts.

**Exit gate:** a real server-side Qloo query works and track fallback is decided.

## Phase 1: Monorepo foundation (Days 1–2)
1. Inspect existing root `package.json`, `pnpm-workspace.yaml`, `turbo.json` and app files.
2. Keep the existing `apps/web` App Router and shared packages.
3. Add FastAPI in `apps/api`, with settings, health route and tests.
4. Add root scripts/Turbo tasks for web and API orchestration.
5. Add `.env.example`, `.gitignore` protections and setup docs.
6. Add CI for web lint/typecheck and Python tests/Ruff.

**Exit gate:** `pnpm dev` starts both apps; API health endpoint responds; no secrets tracked.

## Phase 2: Editor first (Days 2–4)
1. Build upload picker, local preview, replace/remove.
2. Create static layout definitions.
3. Build 9:16 canvas and responsive template gallery.
4. Add caption editing, font size/color/alignment/position, crop and overlays.
5. Export PNG at exactly 1080×1920.
6. Test portrait, square and landscape source photos.

**Exit gate:** user can upload, choose, edit and export without external APIs.

## Phase 3: S3 (Days 4–5)
1. Create private bucket with Block Public Access.
2. Create least-privilege IAM policy.
3. Implement `POST /v1/uploads/presign`.
4. Use random object key, short expiry, supported MIME and size limits.
5. Upload directly from browser; verify object metadata before analysis.
6. Configure lifecycle expiry and test unauthorized/expired URLs.

**Exit gate:** no AWS credentials in client bundle; uploaded objects remain private.

## Phase 4: Qloo adapter (Days 5–7)
1. Implement `QlooClient` with current documented base URL/auth header/timeout.
2. Implement entity search/lookup and disambiguation.
3. Resolve a user-selected taste seed.
4. Implement one verified Insights query.
5. Normalize response into internal schemas.
6. Add bounded retry, rate-limit handling, caching if permitted, request IDs.
7. Show sanitized “Qloo evidence” panel.

**Exit gate:** live Qloo data is visibly used in output.

## Phase 5: Visual analysis and recommendation (Days 7–9)
1. Define `VisualProfile`: palette, lighting, composition, mood and source.
2. Add a vision adapter only after checking free quota and image data terms.
3. Keep manual mood selection as a reliable fallback.
4. Combine visual fit, cultural fit and readability into layout ranking.
5. Produce three candidates with concise rationales.
6. Show track only if metadata is verified; otherwise artist-level fallback.

**Exit gate:** changing taste seeds changes at least one cultural recommendation while layout remains readable.

## Phase 6: API resilience (Days 9–10)
- Add Pydantic schemas, safe errors, timeouts, CORS allowlist and rate limits.
- Handle empty results, invalid key, malformed JSON, rate limit and provider outage.
- Prevent stale results from overwriting a newer photo's results.
- Test service layer with mocked Qloo responses.

## Phase 7: Supabase (optional, Days 10–11)
- Add only required tables.
- Enable RLS on user-owned data.
- Keep service-role key server-only.
- Implement record/object deletion.
- If persistence does not improve the demo, defer it.

## Phase 8: Polish and evaluate (Days 11–14)
- Progress stages: upload → visual mood → cultural research → layout generation.
- Clear error/retry/empty states.
- Test at least five diverse images and three taste profiles.
- Compare same image with no seed vs. taste seed A vs. seed B.
- Record sanitized Qloo evidence and human relevance notes.
- Do not claim scientifically proven engagement lift from a small demo.

## Phase 9: Deploy and submit (final days)
1. Deploy web and FastAPI separately.
2. Configure secrets in host dashboards.
3. Verify HTTPS, CORS, S3 CORS/IAM/lifecycle and Supabase policy.
4. Test in incognito and on mobile.
5. Publish public repository with an open-source license.
6. Confirm the live demo works without private access.
7. Submit before deadline and describe limitations honestly.

## Suggested 90-second demo
1. Upload a photo.
2. Add a favorite artist.
3. Show the resolved Qloo entity and sanitized evidence.
4. Generate three layouts and show a song/artist card.
5. Change the seed and demonstrate changed cultural recommendations.
6. Edit a caption and export PNG.

## Risk register

| Risk | Mitigation |
|---|---|
| No track entity support | Show Qloo-informed artist recommendation; use permitted track metadata fallback |
| API schema differs from examples | Validate official schema before implementation |
| Free vision provider not suitable | Manual mood controls or local/open-source model |
| S3/hosting costs | Alerts, quotas, lifecycle cleanup, low upload limits |
| Photo metadata leaks GPS | Strip EXIF and avoid unnecessary persistence |
| Qloo has no effect on output | Build controlled seed comparison and evidence panel |
| Free host sleeps | Deploy early and test cold starts |
