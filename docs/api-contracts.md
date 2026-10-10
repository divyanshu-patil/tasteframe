# Internal API Contracts (implemented)

App contracts between `apps/web` and `apps/api` — not Qloo endpoint definitions. The browser
calls them same-origin via the Next.js rewrite `/api/* → API_BASE_URL/*`. Live OpenAPI docs are at
`http://localhost:8000/docs` in development. Source: `apps/api/app/schemas/api.py`.

Every endpoint except `/health`, `POST /v1/session` and the dev-only local upload needs the header
`X-Session-Token: <token from POST /v1/session>`.

## `GET /health`
```json
{"status":"ok","service":"tasteframe-api"}
```

## `POST /v1/session`
Anonymous guest session (HMAC-signed; no account). Rate-limited.
```json
{"session_token":"<22-char id>.<signature>"}
```

## `POST /v1/uploads/presign`
Request:
```json
{"content_type":"image/jpeg","size_bytes":1234567}
```
`content_type` ∈ `image/jpeg | image/png | image/webp`; `size_bytes` ≤ `S3_UPLOAD_MAX_BYTES` or 413.

Response (S3 presigned POST; the browser sends `multipart/form-data` with all `fields` and then
`file`):
```json
{
  "upload_url": "https://<bucket>.s3.amazonaws.com/",
  "method": "POST",
  "fields": {"key": "tmp/<session>/<random>.jpg", "Content-Type": "image/jpeg", "policy": "…", "…": "…"},
  "object_key": "tmp/<session>/<random>.jpg",
  "expires_in": 300,
  "max_bytes": 10485760
}
```
The policy enforces `Content-Type` and `content-length-range`. In `STORAGE_BACKEND=local` the URL
is `PUBLIC_API_URL/v1/uploads/local` with HMAC `signature` + `expires` fields (dev only; 404 when
S3 is configured). The URL is a temporary capability and is never logged.

## `POST /v1/analysis`
Request:
```json
{
  "object_key": "tmp/<session>/<random>.jpg",
  "taste_seeds": [{"entity_id": "<UUID from /v1/taste/search>", "entity_type": "artist", "name": "…"}],
  "manual_mood": ["cinematic", "nostalgic"],
  "locale": "en"
}
```
- `object_key` must belong to the caller's session (else 404 `OBJECT_NOT_FOUND`, same as missing).
- `taste_seeds` ≤ 5; `entity_id` must be UUID-shaped; `entity_type` ∈ `artist | movie | tv_show |
  brand | book | podcast` (mapped to Qloo URNs server-side).
- `manual_mood` ≤ 4 of `cinematic minimal nostalgic editorial warm cool moody bright playful
  dreamy bold natural`.

Response: `application/x-ndjson`, one JSON object per line:
```text
{"stage":"photo"}
{"stage":"mood"}
{"stage":"taste"}
{"stage":"layouts"}
{"result":{ …AnalysisOut… }}      ← or {"error":{…}} at any point
```
`AnalysisOut` (values illustrative):
```json
{
  "analysis_id": "opaque",
  "visual_profile": {
    "palette": ["#283c6e", "#e79647"], "brightness": 0.39, "contrast": 0.51, "saturation": 0.65,
    "warmth": 0.13, "composition": "landscape", "mood": ["moody", "warm"],
    "source": "vision+manual", "width": 1200, "height": 800
  },
  "cultural_recommendations": [{
    "provider": "qloo", "kind": "artist", "entity_id": "…", "name": "provider-returned name",
    "tags": ["Indie"], "reason": "Qloo affinity with <seed names>", "evidence": ["<seed name>"]
  }],
  "layouts": [{
    "id": "vintage", "name": "Vintage", "reason": "…", "style_tags": ["grain", "light leak", "date stamp"],
    "score": {"visual_fit": 0.8, "cultural_style_fit": 0.9, "readability_fit": 0.7, "total": 0.82},
    "headline": "golden hour, again.", "caption": "on repeat — <artist>", "accent": "#e79647",
    "focus_x": 0.55, "focus_y": 0.42
  }],
  "music": {
    "kind": "track | artist | none", "artist": "…", "title": "only when kind=track", "url": "https://music.apple.com/… or null",
    "artist_source": "qloo", "track_source": "itunes | null", "explanation": "…"
  },
  "image_reasoning": {
    "provider": "ollama", "model": "gemma4:31b", "summary": "…", "moods": ["cinematic"],
    "scene": ["golden hour"], "headline_ideas": ["quiet moments"],
    "subject": "person", "subject_x": 0.55, "subject_y": 0.42
  },
  "provenance": {
    "qloo_used": true, "qloo_error": null, "visual_analysis_used": true,
    "image_reasoning_used": true, "image_reasoning_error": null, "track_level_result": false,
    "seeds": ["<seed name>"], "layout_rule": "local heuristic: 0.45 visual + 0.35 cultural + 0.20 readability"
  }
}
```
`layouts` contains **every** template, ranked for this photo; each consecutive group of three has
distinct families (the UI shows three at a time and Shuffle moves to the next group). Each layout
also has `filter` (suggested photo look) and `score.ai_pick` (the vision model's pick weight, or
null without image reasoning). `score` is an internal heuristic, never a provider score. `focus_x`/`focus_y` (0..1) is the default
crop focus: the main subject's position from image reasoning, or 0.5/0.5 when unknown. Layout `id`s are rendered by
`apps/web/lib/story/templates.ts` (a test keeps both catalogues in sync).

## `GET /v1/taste/search?q=<2–80 chars>&type=<taste type>`
```json
{"query":"…","entity_type":"artist","candidates":[
  {"provider":"qloo","entity_id":"…","name":"…","entity_type":"artist","disambiguation":"provider descriptor or null","image_url":null}
]}
```

## `GET /v1/music/search?q=<2–80 chars>` (session required)
Songs from the iTunes Search API, for picking a Story's square song cover. No audio.
```json
{"query":"golden hour","tracks":[{"track_id":1640157165,"title":"golden hour","artist":"JVKE","album":"…","has_artwork":true,"explicit":false}]}
```

## `GET /v1/music/artwork/{track_id}` (session required)
The track's 600×600 cover as `image/jpeg` or `image/png`, fetched server-side from Apple's
artwork CDN (https `*.mzstatic.com` only, ≤3 MB, decoded with Pillow) so the browser can draw
it on the canvas and still export. Returns 404 `ARTWORK_NOT_FOUND` otherwise. The UI credits
"Artwork via Apple Music". `music.track_id` in the analysis result feeds the automatic cover.

## `DELETE /v1/uploads/{object_key}`
Idempotent 204 for own keys, including ones already deleted. 404 for foreign or malformed keys.

## Error envelope
```json
{"error":{"code":"QLOO_RATE_LIMITED","message":"Cultural recommendations are busy. Please try again shortly.","request_id":"…","retryable":true}}
```
Every response carries an `X-Request-ID` header. Codes: `INVALID_REQUEST`, `SESSION_INVALID`,
`RATE_LIMITED`, `IMAGE_TOO_LARGE`, `INVALID_IMAGE`, `OBJECT_NOT_FOUND`, `UPLOAD_FORBIDDEN`,
`UPLOAD_EXPIRED`, `AUTH_REQUIRED`, `AUTH_UNAVAILABLE`, `STORY_NOT_FOUND`, `STORY_LIMIT`, `PERSISTENCE_NOT_CONFIGURED`,
`PERSISTENCE_UNAVAILABLE`, `QLOO_NOT_CONFIGURED`, `QLOO_AUTH_FAILED`, `QLOO_RATE_LIMITED`,
`QLOO_TIMEOUT`, `QLOO_INVALID_QUERY`, `QLOO_UPSTREAM_ERROR`, `INTERNAL_ERROR`.

## `GET /v1/features`
```json
{"qloo": true, "image_reasoning": true, "saved_stories": true, "storage": "s3"}
```
Booleans only (never values). The UI hides taste search and saving when these are off.

## Saved Stories (login required; 503 `PERSISTENCE_NOT_CONFIGURED` if Supabase isn't set up)

Every call needs `Authorization: Bearer <Supabase access token>` (from supabase-js after login).
Missing or invalid tokens get 401 `AUTH_REQUIRED` ("Log in to save Stories to your account."). The
API verifies the token with Supabase Auth, then queries PostgREST **as that user** (RLS).

`POST /v1/stories` → 201. Also needs `X-Session-Token`: the upload must belong to this browser.
```json
{"object_key": "tmp/<session>/<random>.jpg",
 "config": { "...exact StoryState from apps/web/lib/story/types.ts (strictly validated)..." },
 "provenance": {"qloo_used": true, "music_artist": "…", "music_title": null, "track_source": null}}
```

`config` is the editor's serializable state, validated field by field. Beyond text, crop and
overlay it can carry:

- `stickers`: user stickers and layout elements, with `layout: true`;
- `cover`: the Instagram-style song sticker (`ig` | `igpill` | `igart`, `trackId`);
- `tracks`: real Apple Music tracks for the playlist panel;
- `views`: per-box pan/zoom, keyed `slotN` or a named inset;
- `spot`: the movable strip/window;
- `outline`: thickness, gap and colour of the die-cut;
- `focus`;
- `crop.rot`.

Unknown keys are rejected.

Copies the photo to `saved/<user_id>/`, inserts a row, and returns
`StoryOut {id, template_id, config, provenance, created_at}`. Errors: `STORY_LIMIT` (409, 20 per
user), `OBJECT_NOT_FOUND` (404, upload expired), `PERSISTENCE_UNAVAILABLE` (503, copy rolled back).

`GET /v1/stories` → `{"stories": [StoryOut…]}`, the user's own, newest first (any device).

`GET /v1/stories/{id}/photo` → image bytes (`Cache-Control: private, no-store`). 404 for other
users' Stories.

`DELETE /v1/stories/{id}` → 204 (idempotent). Removes the row and its photo.

## Error envelope
```json
{"error":{"code":"QLOO_RATE_LIMITED","message":"Cultural recommendations are busy. Please try again shortly.","request_id":"…","retryable":true}}
```
Every response carries an `X-Request-ID` header. Codes: `INVALID_REQUEST`, `SESSION_INVALID`,
`RATE_LIMITED`, `IMAGE_TOO_LARGE`, `INVALID_IMAGE`, `OBJECT_NOT_FOUND`, `UPLOAD_FORBIDDEN`,
`UPLOAD_EXPIRED`, `AUTH_REQUIRED`, `AUTH_UNAVAILABLE`, `STORY_NOT_FOUND`, `STORY_LIMIT`, `PERSISTENCE_NOT_CONFIGURED`,
`PERSISTENCE_UNAVAILABLE`, `QLOO_NOT_CONFIGURED`, `QLOO_AUTH_FAILED`, `QLOO_RATE_LIMITED`,
`QLOO_TIMEOUT`, `QLOO_INVALID_QUERY`, `QLOO_UPSTREAM_ERROR`, `INTERNAL_ERROR`.

## `GET /v1/features`
```json
{"qloo": true, "image_reasoning": true, "saved_stories": true, "storage": "s3"}
```
Booleans only (never values). The UI hides taste search and saving when these are off.

## Saved Stories (when Supabase is configured; otherwise 503 `PERSISTENCE_NOT_CONFIGURED`)

`POST /v1/stories` → 201
```json
{"object_key": "tmp/<session>/<random>.jpg",
 "config": { "...exact StoryState from apps/web/lib/story/types.ts (strictly validated)..." },
 "provenance": {"qloo_used": true, "music_artist": "…", "music_title": null, "track_source": null}}
```
Copies the photo to `saved/`, inserts a row, and returns a `StoryOut`:
`{id, template_id, config, provenance, created_at, expires_at}`. Errors: `STORY_LIMIT` (409),
`OBJECT_NOT_FOUND` (404, upload expired), `PERSISTENCE_UNAVAILABLE` (503, copy rolled back).

`GET /v1/stories` → `{"stories": [StoryOut…]}`, newest first, unexpired, this session only.

`GET /v1/stories/{id}/photo` → image bytes (`Cache-Control: private, no-store`). 404 for other
sessions or expired Stories.

`DELETE /v1/stories/{id}` → 204 (idempotent). Removes the row and its `saved/` object.
