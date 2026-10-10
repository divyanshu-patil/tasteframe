# Tasteframe — Qloo-powered Instagram Story maker

**One photo. Three Stories. Your taste.**

Upload a photo, optionally confirm a few favourite artists / films / brands, and get three
distinct 9:16 Story layouts ranked by your photo's visual mood and real Qloo cultural
recommendations — plus an artist (and, when verifiable, song) to pair with it. Edit text, crop,
overlay and decorations, then download an exact **1080 × 1920 PNG**.

**Boundaries.** Qloo is the cultural-intelligence layer only. It does not analyse pixels or
render layouts. Visual analysis runs locally with Pillow on the API. Layouts are drawn by a
deterministic Canvas renderer in the browser. Qloo has no track entity type, so song titles come
from Apple's iTunes Search API, are clearly labelled, and are only shown on an exact
artist-name match.

## Monorepo

```text
apps/web            Next.js 16 App Router + TypeScript (UI, Canvas templates, editor, export)
apps/api            FastAPI (uploads, vision, Qloo adapter, ranking, music fallback)
packages/ui         shared React primitives (starter; unused by the app so far)
packages/*-config   shared ESLint / TypeScript config
design-refs/        Pinterest reference index that shaped the templates
docs/               API contracts, validation matrix, AWS policy templates
supabase/schema.sql optional persistence schema (not used by the guest MVP)
```

| Tool | Version used |
|---|---|
| Node | ≥ 24 (tested 24.10) |
| pnpm | 11.25 (`packageManager`) |
| Python | ≥ 3.11 (tested 3.12) |

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

## How it works

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

## Layouts, filters, stickers

- **19 layouts** (`apps/web/lib/story/templates.ts` + `templates-more.ts`), each modelled on a
  category in `design-refs/pinterest`: Cinematic, Vintage, Magazine, Film Stills, Film Strip,
  Photo Dump, Editorial, Newspaper, Journal, Paper Note, Soft Focus, Scrapbook, Mood Board, Torn
  Reveal, Minimal, Y2K Chrome, Now Playing, Vinyl, Ticket. All are vector-drawn; there are no
  copied images, logos or brand names.
- **Shuffle**: the API ranks every layout for the photo. The results page shows three at a time,
  and each set of three comes from distinct layout families.
- **Filters**: Original, Film, Warm, Golden hour, Cool, Faded, Vivid, Sepia, B&W, Noir, 8mm. These
  are deterministic per-pixel looks on a cached copy, so preview equals export. Each layout gets a
  mood-based filter suggestion, or its signature look (e.g. Newspaper → B&W).
- **Stickers & paper**: washi tape, star, sparkle, heart, flower, daisy, bow, paperclip, push
  pin, stamp, doodle arrow, swirl, torn note (editable text) and mini player (shows the suggested
  song). Drag them on the Story; size, rotation and colour are editable.
- **Crop**: Fill frame or Fit whole photo, zoom up to 4×, drag to pan, scroll or pinch to zoom,
  reset.

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

Creating and downloading never need an account. **Saving a Story to the backend requires login.**

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
4. Add your site URL (e.g. `http://localhost:3000`, then your production origin) under
   **Authentication → URL Configuration**, so confirmation links come back to `/create`.

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
- Vision is heuristic (colour/light statistics). There is no scene understanding.
- Single-instance in-memory rate limiting. No caching of Qloo responses, because the terms
  weren't verified for caching.
- Live Qloo behaviour is verified only when a key is configured (see `qloo_API.md`).

## License

MIT — see [LICENSE](LICENSE).
