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

Open http://localhost:3000. With no AWS bucket, `STORAGE_BACKEND=local` stores uploads in
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
     Deterministic rules map these to broad mood words, merged with any manual picks.
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
- **Web (`apps/web/.env.local`)**: `API_BASE_URL` (server-only, used by the `/api` rewrite) and
  `NEXT_PUBLIC_UPLOAD_MAX_MB` (non-secret hint).

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
3. Lifecycle: apply `docs/aws/lifecycle.json`. It expires `tmp/` after 1 day and `saved/` after
   8 days.
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

## Supabase — saved Stories (optional)

Guests can **Save to my Stories** from the editor, then reopen or delete them from the start
screen. The feature turns on automatically when `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are
set (`GET /v1/features` reports it). Otherwise the UI hides it.

1. Create a Supabase project, then apply `supabase/schema.sql` (re-runnable) in one of two ways:
   paste it into the **SQL editor**, or set `DATABASE_URL` in `apps/api/.env` and run
   `uv run --no-project --with "psycopg[binary]==3.2.10" python supabase/apply.py`. The script
   applies the schema in one transaction and verifies the functions and grants.
2. Under **Project Settings → API Keys**, copy the Project URL and the **publishable** key
   (`sb_publishable_…`) into `apps/api/.env`. No secret or service-role key is used.
3. Optional: schedule `select public.purge_expired_stories()` daily with pg_cron (as a
   privileged role). The functions already hide expired rows.

Security model. The publishable key is public by design (role `anon`), so the database enforces
everything:
- RLS is on and `anon` has **no table privileges**. Direct reads and writes are denied.
- `anon` can only execute four `SECURITY DEFINER` functions: `tf_save_story`, `tf_list_stories`,
  `tf_get_story` and `tf_delete_story`. Each requires the owner hash
  `sha256(SESSION_SECRET:session_id)`. The API computes it and never sends it to browsers, so even
  a direct caller holding the publishable key can't enumerate or guess anyone's rows.
- Limits are enforced in SQL so callers can't bypass them: 20 active Stories per owner
  (serialized with an advisory lock) and 7-day expiry. Templates, storage-key format and JSON
  sizes are checked by constraints.
- Residual risk: someone holding the publishable key can create rows under made-up owners. They
  are size-capped, expire in 7 days, and can't reference other users' data. Use Supabase's API
  rate limits, or switch to a secret key if this matters.
- Verified locally with PGlite as role `anon`: own rows are reachable, other owners' rows and
  direct table access are denied, and the limit and constraints are enforced.

How it works:
- Saving copies the EXIF-stripped photo from `tmp/` to `saved/<session>/<random>.<ext>`. The row
  stores only that key, the validated Story config (strict schema, no extra fields) and minimal
  provenance (`qloo_used`, music artist/title). No seeds or image bytes are stored.
- Photos are served back through `GET /v1/stories/{id}/photo`, which is same-origin, so the canvas
  is never tainted. There are no public or presigned GET URLs.
- Delete removes both the row and the photo. `saved/` objects also expire after 8 days via S3
  lifecycle.
- The session token lives in `localStorage`, so saved Stories belong to that browser.

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
