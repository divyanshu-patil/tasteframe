# Contributing to Tasteframe

Thanks for helping. Tasteframe is a Qloo-powered Instagram Story maker: a Next.js web app and a
FastAPI service in one Turborepo. This guide has everything you need to run it, find your way
around and land a good pull request. The product overview lives in the [README](README.md).

## Ways to help

- **Layouts.** Rebuild a Pinterest Story you love as a layout (see [Adding a layout](#adding-a-layout)),
  or pick one from the request queue.
- **Editor polish.** Finer controls, accessibility, mobile gestures.
- **Ranking.** Better visual and cultural fit, more honest explanations.
- **Bugs and docs.** Small fixes are as welcome as big ones.

Open an issue first for anything large, so we can agree on the shape before you build it.

## Prerequisites

| Tool | Version |
| :-- | :-- |
| Node | ≥ 24 (tested 24.10) |
| pnpm | 11.25 (pinned via `packageManager`) |
| Python | ≥ 3.11 (tested 3.12; CI uses 3.12) |
| Chrome | any recent version, for the end-to-end tests |
| uv | optional, for the Supabase setup scripts |

None of the cloud services are required to run the app locally.

## Ground rules

These mirror [`AGENTS.md`](AGENTS.md), which is the source of truth.

- **Boundaries.** Qloo is the cultural layer only: it never sees pixels and never generates
  layouts. Vision runs on the API (Pillow, optional Ollama); layouts render in the browser.
- **Secrets stay server-side.** Qloo, AWS, Ollama and any secret Supabase key never go in
  `NEXT_PUBLIC_*` or the bundle. Commit `.env.example` files only.
- **pnpm for JavaScript, a venv for Python.** Never install Python packages through pnpm, and
  commit `pnpm-lock.yaml` when dependencies change.
- **Strict TypeScript**, Server Components by default, `"use client"` only for interactivity.
  Validate every API response, and handle loading, empty, error, retry and success states.
- **FastAPI:** Pydantic models in, Pydantic models out; async `httpx` with explicit timeouts;
  routes, services, schemas and provider adapters kept separate; safe error codes, never upstream
  bodies or keys.
- **Rendering stays pure:** `renderStory(ctx, photos, state, assets)` with no React state and
  no randomness beyond the seeded `rng()`.
- **Music:** never invent track titles, never label an artist as a track, never download or
  redistribute audio.
- **Pinterest:** never commit pin images. Link and credit them (`design-refs/`).
- **Commits:** the repository owner is the author. No AI co-author trailers.

## Boundaries

Qloo is the cultural-intelligence layer only. It does not analyse pixels or
render layouts. Visual analysis runs locally with Pillow on the API. Layouts are drawn by a
deterministic Canvas renderer in the browser. Qloo has no track entity type, so song titles come
from Apple's iTunes Search API, are clearly labelled, and are only shown on an exact
artist-name match.


## Repository layout

```text
apps/web            Next.js 16 App Router + TypeScript (UI, Canvas templates, editor, export)
apps/api            FastAPI (uploads, vision, Qloo adapter, ranking, music fallback)
packages/ui         shared React primitives (starter; unused by the app so far)
packages/*-config   shared ESLint / TypeScript config
design-refs/        Pinterest reference index that shaped the templates
docs/               API contracts, validation matrix, AWS policy templates
supabase/           schema.sql, apply.py, make_admin.py (accounts, saved Stories, analytics, admin)
```


## Quick start (local, no cloud accounts)

```bash
pnpm install
pnpm api:setup                  # creates apps/api/.venv and pip-installs requirements-dev.txt
cp apps/api/.env.example apps/api/.env        # set SESSION_SECRET; STORAGE_BACKEND=local if no AWS yet
cp apps/web/.env.example apps/web/.env.local
pnpm dev                        # Turbo runs Next.js (:3000) and FastAPI (:8000) together
```

Open http://localhost:3000 (landing) or http://localhost:3000/create (studio). With no AWS bucket, `STORAGE_BACKEND=local` stores uploads in
`apps/api/.uploads/` behind HMAC-signed, expiring upload URLs that mimic S3 presigned POSTs.
With no `QLOO_API_KEY`, the app still works: taste search says it's unavailable, and layouts
are ranked on visual signals only (shown honestly in the UI).

`apps/web/.env.local` is optional locally. `API_BASE_URL` defaults to `http://127.0.0.1:8000`.


## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js + FastAPI with reload (Turbo) |
| `pnpm build` | Production build of the web app |
| `pnpm lint` | ESLint (web, ui) + Ruff check/format-check (api) |
| `pnpm typecheck` | `next typegen && tsc --noEmit` |
| `pnpm test` | Vitest (web) + pytest (api) |
| `pnpm api:test -- -m integration` | Optional live Qloo test (needs `QLOO_API_KEY`) |

The API scripts go through `apps/api/scripts/py.mjs`, a small cross-platform wrapper that runs
the venv's Python. Python packages are never installed through pnpm.


## Architecture: how a Story is made

1. The browser checks type (magic bytes) and size, gets a guest session token, asks the API for a
   presigned POST and uploads directly to private storage.
2. `POST /v1/analysis` streams NDJSON stage events (`photo → mood → taste → layouts`) and then
   the result:
   - **photo**: the API decodes the real bytes (JPEG/PNG/WebP only, pixel cap) and re-encodes them
     without EXIF/GPS.
   - **mood**: Pillow measures palette, brightness, contrast, saturation, warmth and orientation.
     Deterministic rules map these to broad mood words. Optionally, a vision model on Ollama adds
     moods, scene cues and headline ideas (see below). Everything is merged after the user's picks.
   - **taste**: for user-confirmed Qloo entity IDs, two `GET /v2/insights` calls run, with
     `filter.type` = artist and movie.
   - **layouts**: `score = 0.45·visual + 0.35·cultural + 0.20·readability`, then the top 3 from
     different template families. Cultural fit matches Qloo-returned tag names (e.g. "Funk",
     "Indie") to each template's style keywords.
3. Music: the top Qloo artist is the suggestion. An exact-artist iTunes Search lookup adds a song
   title and Apple Music link, labelled as iTunes metadata.
4. The editor is a pure reducer over a serializable `StoryState`. Rendering is
   `renderStory(ctx, photo, state)`, shared by previews and the 1080×1920 export, with fonts
   preloaded first.

If the API or Qloo is down, the UI says so and lets you continue with standard layouts. The
editor and export never need the network.


## Configuration

Templates (placeholders only): `apps/api/.env.example` → `apps/api/.env` and
`apps/web/.env.example` → `apps/web/.env.local`. The root `.env.example` points to both. Real env
files are gitignored. Turbo passes the API variables through `pnpm dev` (`passThroughEnv`).

- **API (`apps/api/.env`)**: `SESSION_SECRET`, `QLOO_API_KEY`, `QLOO_BASE_URL`, `STORAGE_BACKEND`,
  `AWS_*`, `S3_*`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `CORS_ORIGINS`, `PUBLIC_API_URL`, `MUSIC_METADATA_PROVIDER`, `RATE_LIMIT_*`.
- **Web (`apps/web/.env.local`)**: `API_BASE_URL` (server-only, used by the `/api` rewrite),
  `NEXT_PUBLIC_UPLOAD_MAX_MB` (non-secret hint), and `NEXT_PUBLIC_SUPABASE_URL` plus
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (public, for login).

The API refuses to start in `ENVIRONMENT=production` without a real `SESSION_SECRET` and S3.
Errors list variable names only, never values.


## Qloo setup

1. Get a hackathon key ([guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key)).
2. Set `QLOO_API_KEY` in `apps/api/.env`. Hackathon keys only work against
   `https://hackathon.api.qloo.com`.
3. Verify with `pnpm api:test -- -m integration -s`.

Details, verified endpoints and the fallback policy are in [`qloo_API.md`](qloo_API.md).


## AWS S3 setup (production)

1. Create a bucket and keep **Block Public Access** on (all four settings). Default SSE-S3
   encryption is fine. Set `AWS_REGION` to the bucket's **actual** region (check
   `aws s3api get-bucket-location`). Presigned POSTs go to the regional endpoint.
2. CORS: apply `docs/aws/cors.json` with your web origin. Only `POST` from that origin is allowed.
3. Lifecycle: apply `docs/aws/lifecycle.json`. It expires `tmp/` after 1 day. Account-owned
   `saved/` photos persist until the user deletes the Story.
4. IAM: attach `docs/aws/iam-policy.json` (Put/Get/Delete on `tmp/*` and `saved/*` only) to the
   API's role or user. Prefer an instance/task role over static keys.
5. Set `STORAGE_BACKEND=s3`, `AWS_S3_BUCKET`, `AWS_REGION` and credentials if no role.

```bash
aws s3api put-public-access-block --bucket $B --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-cors --bucket $B --cors-configuration file://docs/aws/cors.json
aws s3api put-bucket-lifecycle-configuration --bucket $B --lifecycle-configuration file://docs/aws/lifecycle.json
```

Presigned POST policies enforce `Content-Type` and `content-length-range` (≤ `S3_UPLOAD_MAX_BYTES`)
and expire after `S3_PRESIGNED_URL_TTL_SECONDS` (default 300 s). Keys are
`tmp/<session-id>/<random>.<ext>`, never derived from filenames. The API verifies the session
prefix on every read and delete.


## Layouts, filters and the editor

- **83 layouts**, grouped in the editor (Cutouts & posters, Screens & cameras, Song cover &
  music, Multi-photo, Type & notes, Film & mood, Paper & scrapbook). Each was modelled on Pinterest
  references (`design-refs/pinterest`; see `design-refs/README.md`):
  - 26 hand-drawn ones in `templates.ts`, `templates-more.ts` and `templates-multi.ts`.
  - 36 declarative ones in `layouts-aesthetic.ts`, built by the spec engine in `spec.ts`. The
    flat-colour ones were removed for quality.
  - 21 from the owner's own pins in `templates-refs.ts`, each matched to its pin:
    - **Playlist** uses the owner's sideways Instagram/Spotify screen template (green-screen
      keyed). It has your photo in the top window and, in the bottom one, either a prop shot or
      your own second photo. The 10 prop shots (can, matcha, iced latte, turntable…) are
      shuffleable, openly licensed, and credited in the app; see `public/props` and
      `lib/story/props.json`.
    - **Player Cutout** turns the whole Story sideways like its pin. You're a high-contrast B&W
      die-cut over a sepia collage, with the song running down the side.
    - **Red Block** is a translucent block you can put behind or in front of you, with opacity,
      move and resize.
    - **Torn Strip** has real ripped-paper edges over a darker B&W layer with a ghost masthead.
    - **Vinyl** is a release poster.
    - Also: CCTV, Triptych, Colour Box, Sticker Cutout, Focus, Camera Screen, Camcorder, Night
      Cam, Sepia Prints, Desktop, WhatsApp Screen, Kiss Mark, Xerox Poster, Yearbook, Song on
      Lips, Sepia + Song and Song Corner.
- **Pinterest originals**: every suggestion, the editor and the gallery show the pin a layout was
  modelled on. This uses Pinterest's own oEmbed thumbnail, linked to the pin with the creator
  credited (`lib/story/pins.json`, built by `design-refs/build_pins.py`). No pin images are stored
  or served.
- **Gallery** (`/gallery`): every layout rendered live, plus every reference pin. "Use this
  layout" opens `/create?layout=<id>`, which goes straight into that layout after upload.
- **Person cutouts** (Sticker Cutout, Player Cutout, Colour Box, Yearbook) use MediaPipe's selfie
  segmenter in the browser.
  - The model (Apache-2.0, 250 KB) is vendored in `public/models`. The wasm runtime (pinned) loads
    on first use only.
  - Free, no server load; the photo isn't sent anywhere for this step.
  - The die-cut outline has adjustable thickness, gap from the person and colour.
- **Song sticker** (Instagram music-sticker looks): album art with the playing bars and
  title/artist (white or black), the white pill, or art only.
  - Artwork comes from the suggested song, a song search (`GET /v1/music/search`, Apple Music
    catalogue), or your own image.
  - Apple artwork is proxied same-origin by `GET /v1/music/artwork/{track_id}` (only
    `*.mzstatic.com`, decoded and validated), so the canvas stays exportable.
  - Saved Stories keep the track id and refetch the artwork.
- **Playlist panel**: a Spotify-style table filled with real tracks by the song's artist (Apple
  Music catalogue, never invented). You can drag, rotate or delete it like any sticker.
- **WhatsApp Screen** uses the owner's green-screen template. `apps/api/scripts/key_template.py`
  keys out the green, keeps the white UI and finds the photo windows.
- **Filters**: Original, Film, Warm, Golden hour, Cool, Faded, Vivid, Sepia, B&W, Noir, 8mm and
  Xerox. They are deterministic per-pixel looks, so preview equals export.
- **Stickers & elements**: paper stickers (tape, stars, flowers, notes, mini player…) plus
  transparent-PNG elements (lipstick kiss, focus brackets, REC, torn strip, folder, cursor, warning,
  cat doodle, cheek heart, barcode, playlist panel).
  - The PNGs in `public/elements` are generated by `apps/api/scripts/make_elements.py`; the
    lipstick kiss is the owner's PNG.
  - A layout's own elements are regular stickers, so they can be dragged, resized, rotated,
    recoloured, reordered, duplicated or deleted, and "Bring back removed elements" restores them.
- **Editing**: tap anything on the Story to select it. The inspector then shows only that
  element's fine controls: sliders with −/+ nudges, and arrow keys (Shift for bigger steps).
  - Photo boxes support fill/fit, zoom, pan and rotate in 90° steps.
  - **Every box that shows part of a photo** (repeated bands, collage tiles, CCTV callouts, insets)
    can be dragged or zoomed to choose what it shows.
  - Strips and windows (Torn Strip, Focus, Colour Box) drag, or move and resize with sliders.
  - Layout boxes (CCTV's subject, detail and callout frames, Xerox's inset, Red Block's block)
    move by dragging their frame and resize in the inspector. Inside a picture box, dragging pans
    the picture.
  - The "This layout" section shows only the controls that layout uses.

### How layouts are ranked

`score = 0.30 visual + 0.30 AI pick + 0.25 cultural + 0.15 readability` (with image reasoning),
otherwise `0.45 visual + 0.35 cultural + 0.20 readability`.
- **Visual** combines moods (yours, then the vision model's, then measured), the vision model's
  scene cues ("airport", "birthday"…), the main subject and orientation.
- **AI pick** is Gemma ranking the whole catalogue for this photo.
- **Readability** penalises text over busy photos. Off-photo text is neutral rather than a free
  win; the old 0.95 made paper layouts win every time.
- A tiny photo-specific tie-breaker separates near-equal scores.

On real photos (2026-10-10) the top sets were: birthday → Scrapbook, Photo Dump, Y2K; dog at
home → Paper Note, Scrapbook, Photo Dump; airport → Ticket, Journal, Film Strip; street collage →
Newspaper first. Previously all of these got Editorial/Minimal/Journal.


## Image reasoning (optional, Ollama)

With `OLLAMA_API_KEY` set, the "mood" stage also sends a downscaled (≤768px), EXIF-stripped JPEG
to a vision model on Ollama Cloud (`OLLAMA_MODEL`, default `gemma4:31b`). It runs concurrently
with the local Pillow measurements and returns:
- a one-line aesthetic summary and up to 4 scene cues ("golden hour", "city street"),
- up to 3 moods from the app's fixed list, which come after the user's own picks and before
  measured moods,
- 3 headline ideas, spread across the suggested layouts,
- the main subject's kind (person / people / object / scene) and rough position, used only for
  framing, never identity:
  - The default crop is aimed at the subject, which is guaranteed to stay in frame.
  - Text drawn over the photo (Cinematic, Vintage) moves to the half away from the subject.
  - Cinematic's shadow gradient follows the headline.
  - For photos of people, Film Stills and Film Strip (which split one photo into three shifted
    crops) are ranked lower.

Selfies and portraits, the most common Stories, were checked on 12 real photos (2026-10-10):
people were recognized and described only as "a person"/"people" (no age, gender or ethnicity
words), positions landed on the face or body, and Stories kept faces clear of text.

Safeguards:
- The prompt forbids identifying people or inferring sensitive traits.
- Replies are parsed defensively (code fences stripped, unknown moods dropped, emoji and markup
  removed, lengths capped).
- Any failure (timeout, retired model, auth, junk) is skipped with a safe code in
  `provenance.image_reasoning_error`. The rest of the analysis is unaffected.
- The UI discloses the Ollama step before upload, and shows the result in an
  "Image reasoning" panel.

Model check (2026-10-10): `qwen3-vl:235b` returns HTTP 410 (retired 2026-06-16) under every name
variant. `gemma4:31b` accepts images. JSON-schema `format` returns empty content on gemma4, so we
request `format: "json"` and validate ourselves. `gemma4:31b:cloud` is accepted too (the
`:cloud` suffix is stripped for the direct API).


## Routes

| Route | What it is |
|---|---|
| `/` | Landing page: pitch, example Stories, how it works, link to the studio |
| `/create` | The MVP studio: upload → mood → taste → three Stories → editor → PNG export |
| `/create?layout=<id>` | Same, but opens straight in a chosen layout after upload |
| `/gallery` | Every layout and every Pinterest reference (credited, linked); pick one to start |
| `/admin` | Admins only: analytics (visits, usage, referrers, devices, layouts) and the layout-request queue |

Creating and downloading never need an account. **Saving a Story to the backend requires login.**


## Requests, analytics and the admin dashboard

- **Request a layout**: the landing navbar opens a form.
  - Paste a Pinterest pin (`pinterest.com/pin/…` or a `pin.it/…` share link) and an instant
    preview appears. The API verifies it through Pinterest's oEmbed and contacts Pinterest hosts
    only; share links are followed hop by hop and must stay on Pinterest.
  - Add an optional note and email, then send. Requests are rate-limited, and the database caps
    them at 10 per visitor per day.
- **Server status dot** (landing navbar):
  - yellow and breathing while the API wakes up (the free Render plan can take about 50 s);
  - green when it answers;
  - red if it can't be reached after 90 s (click to retry).
  - The tooltip explains the wait, and tapping shows it on phones.
- **Analytics** cover page views, Stories made, layouts opened, downloads, saves, requests and
  gallery picks. They're privacy-friendly:
  - no cookies, IPs, account ids or full URLs;
  - a random browser id that the API hashes with the server secret;
  - the referring site's host only;
  - a coarse device class.
  - Do Not Track / Global Privacy Control turn it off, and `/admin` is never tracked.
- **Roles**: every account gets a row in `public.users` (`role` is the `user_role` enum: `user` or `admin`), created by
  a trigger on sign-up. Supabase RLS + `is_admin()` (checks `role = 'admin'`) gate everything, so
  a non-admin token gets nothing even when calling PostgREST directly. Users can read only their
  own row and nobody can change a role from the client. Promote an account from the database,
  after it has signed up in the app:

  ```bash
  uv run --no-project --with "psycopg[binary]==3.2.10" python supabase/make_admin.py you@example.com
  # … --revoke sets it back to user
  ```

  `/admin` shows:
  - totals and a daily traffic chart for 7, 30 or 90 days;
  - referrers, pages, devices and layout downloads;
  - the request queue (pending, accepted, built, rejected). Each request opens with the pin,
    creator, note, email, source and device, and can be accepted, marked built or rejected with an
    internal note.


## Supabase — accounts & saved Stories (optional)

When a guest clicks **Log in to save**, a login dialog opens (email + password via Supabase
Auth). Their editor state is kept, and the save continues automatically after login. Signed-in
users see "Your saved Stories" on `/create` on any device, and can reopen or delete them.

Setup:
1. Create a Supabase project and apply `supabase/schema.sql` (re-runnable). Either paste it into
   the **SQL editor**, or set `DATABASE_URL` in `apps/api/.env` and run
   `uv run --no-project --with "psycopg[binary]==3.2.10" python supabase/apply.py`.
2. Put the Project URL and **publishable** key (`sb_publishable_…`) in **both**
   `apps/api/.env` (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) and `apps/web/.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). Publishable keys are
   designed to be public. No secret or service-role key is used by the app.
3. **Authentication → Providers → Email** must be enabled (the default). If **Confirm email** is
   on, new users must click the emailed link before logging in. Supabase's built-in mailer only
   delivers to your project team's addresses and is rate-limited, so for real users configure
   custom SMTP (**Authentication → Emails → SMTP**) or turn confirmation off for the demo.
4. Under **Authentication → URL Configuration** set **Site URL** to `https://tasteframe.vercel.app`
   and add `https://tasteframe.vercel.app/**` and `http://localhost:3000/**` to **Redirect URLs**.
   Sign-up redirects to `NEXT_PUBLIC_SITE_URL` (set it on Vercel too); without an allowed match,
   Supabase falls back to the Site URL. The confirmation link lands on `/`, which signs the user
   in and shows a toast.

Security model (standard Supabase RLS):
- The browser logs in with supabase-js. For saved-Story calls it sends the user's access token to
  our API. The API verifies it with Supabase (`GET /auth/v1/user`), then forwards the same
  token to PostgREST, so queries run as role `authenticated` with `auth.uid()` = that user.
- `public.stories` has RLS with select/insert/delete policies `user_id = auth.uid()` and no
  updates. `anon` has no access.
- A CHECK constraint requires `s3_object_key` to start with `saved/<user_id>/`, so even a direct
  PostgREST call can't point a row at someone else's photo. The API also re-checks the prefix
  before reading.
- A trigger limits each user to 20 Stories (`STORY_LIMIT` → 409). Saved Stories persist until
  deleted, and deleting the auth user cascades to their rows.
- Verified with PGlite as `authenticated`/`anon`, and against the live project (anon denied;
  invalid tokens → 401).

How saving works:
- Saving needs the current browser's upload (session token) **and** a logged-in user. The
  EXIF-stripped photo is copied from `tmp/` to `saved/<user_id>/<random>.<ext>`. The row stores
  only that key, the validated Story config (strict schema) and minimal provenance (`qloo_used`,
  music artist/title). No seeds or image bytes are stored.
- Photos come back through `GET /v1/stories/{id}/photo` (same-origin, canvas-safe, no public
  URLs). Delete removes the row and the photo.


## Deployment

The web app and API deploy separately. Nothing has been deployed from this repository yet.

**API** (any Python/Docker host, e.g. Render, Fly.io, Cloud Run):
- Add the production web origin to the bucket's CORS `AllowedOrigins` and to `CORS_ORIGINS`.
- Docker: `apps/api/Dockerfile` (listens on `$PORT`). Without Docker: `pip install -r
  requirements.txt` then `uvicorn app.main:app --host 0.0.0.0 --port $PORT --proxy-headers`.
- Env: `ENVIRONMENT=production`, `SESSION_SECRET`, `QLOO_API_KEY`, `STORAGE_BACKEND=s3`,
  `AWS_S3_BUCKET`, `AWS_REGION`, `CORS_ORIGINS=["https://your-web-origin"]`.
- Health check: `GET /health`. OpenAPI docs at `/docs` are disabled in production.
- Rate limiting is in-process. Run a single instance, or move it to Redis before scaling out.

**Web** (Vercel or any Next.js host):
- Root directory `apps/web`. Build `pnpm build`. Install `pnpm install`.
- Env: `API_BASE_URL=https://your-api-host` (server-only rewrite target),
  `NEXT_PUBLIC_UPLOAD_MAX_MB=10`.

Free tiers change. Check current limits for your hosts, S3 (storage, requests, egress) and Qloo
quota, and set billing alerts.


## Security & privacy summary

- Qloo/AWS/session secrets are server-only. Supabase uses only the publishable key (also kept server-side). The browser only sees same-origin `/api` and
  short-lived upload URLs.
- Uploads are validated three times: client magic bytes, presign type/size policy, and server
  decode with format and pixel caps. SVG and other formats are rejected.
- EXIF/GPS is stripped on the server copy. Objects are deleted on "Start over" and expire after
  1 day.
- No face recognition or sensitive-attribute inference.
- Structured errors carry request IDs and never echo upstream bodies or keys. Logs record route
  templates only; uvicorn access logs are off and httpx logging is set to WARNING.
- Rate limits cover sessions, presign, search and analysis. Qloo calls have 8 s timeouts and
  ≤ 2 retries, and only on 429, 5xx or timeouts.


## Known limitations

- Track titles depend on iTunes Search having the exact artist. Otherwise the card is an
  explicit artist suggestion.
- Without `OLLAMA_API_KEY`, vision is heuristic (colour and light statistics), with no scene
  understanding.
- Single-instance in-memory rate limiting. No caching of Qloo responses, because the terms
  weren't verified for caching.
- Live Qloo behaviour is verified only when a key is configured (see `qloo_API.md`).


## Adding a layout

A layout touches a few files; tests fail loudly if any of them drift.

1. **Draw it** in `apps/web/lib/story/`:
   - Hand-drawn layouts are `Template` objects (`templates-refs.ts` is the most modern
     example). Use the helpers there: `slotPhoto` for photo boxes, `boxes` for movable
     frames, `stickers` for layout elements, `spot` for strips and windows, `front` for things
     drawn over the headline, `needsMask` for cutouts.
   - Simpler ones can be a declarative `Spec` in `layouts-aesthetic.ts`.
   - Keep text inside the Instagram safe areas, and make every photo box adjustable.
2. **Register the id**:
   - `TEMPLATE_IDS` in `types.ts`;
   - a picker group in `groups.ts`;
   - the ranking catalogue in `apps/api/app/services/recommendations/layouts.py` (moods,
     scenes, expressions, subjects, capacity);
   - `LayoutId` in `apps/api/app/schemas/api.py`;
   - the `stories_template` check in `supabase/schema.sql`. Regenerate it from the catalogue
     and apply it with `supabase/apply.py`.
3. **Credit the reference:** add the pin to `design-refs/pinterest/SOURCES.tsv` (or to
   `OWNER` / `pin_layouts.json` in `design-refs/build_pins.py`), then run
   `python3 design-refs/build_pins.py` to refresh `pins.json`.
4. **Test:** `pnpm test` covers safe areas, determinism, distinct compositions and catalogue
   sync. Then export it from the editor and look at it next to the reference.

## Generated assets

| Asset | How it's made |
| :-- | :-- |
| `apps/web/public/elements/*.png` | `apps/api/.venv/bin/python apps/api/scripts/make_elements.py [kiss.png]` (recreated, nothing cut from reference photos) |
| `apps/web/public/templates/*.png` | `apps/api/scripts/key_template.py <in> <out>` keys out a green screen and prints the photo windows |
| `apps/web/lib/story/pins.json` | `python3 design-refs/build_pins.py` (oEmbed links and credits only) |
| `apps/web/public/props/*` + `props.json` | openly licensed images from Openverse, credited in the app |
| `apps/web/public/models/selfie_segmenter.tflite` | MediaPipe selfie segmenter (Apache-2.0), vendored |
| `docs/screenshots/*` | captured from the running app with a CC0 demo photo |

## Pull requests

Before you open one:

- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass (web: ESLint, tsc, Vitest; API:
      Ruff, pytest).
- [ ] `pnpm --filter web e2e` passes against a running `pnpm dev`.
- [ ] Error paths are handled and tested, not just the happy path.
- [ ] You checked it on a phone-sized screen (upload, editor, export).
- [ ] No secrets, signed URLs or personal photos in the diff, bundle or logs.
- [ ] Docs and `.env.example` are updated if a contract or setting changed.

Keep each pull request to one change, explain *why* in the description, and include a
screenshot or export for anything visual.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
