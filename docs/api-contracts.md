# Internal API Contracts

These are app contracts, not Qloo endpoint definitions.

## `GET /health`
```json
{"status":"ok","service":"tasteframe-api"}
```
Do not include infrastructure secrets or verbose internals.

## `POST /v1/uploads/presign`
Request:
```json
{"content_type":"image/jpeg","size_bytes":1234567}
```
Response:
```json
{
  "upload_url":"short-lived-presigned-url",
  "object_key":"temporary/session-random-id/random-object-id.jpg",
  "expires_in":300,
  "required_headers":{"Content-Type":"image/jpeg"}
}
```
Generate keys server-side. The URL is a temporary capability; never log it. Check size/type before issuing and validate the object after upload because declared MIME does not prove the bytes match.

## `POST /v1/analysis`
Request:
```json
{
  "object_key":"temporary/session-random-id/random-object-id.jpg",
  "taste_seeds":[{"entity_type":"artist","query":"user-entered artist"}],
  "manual_mood":["cinematic","nostalgic"],
  "locale":"en"
}
```
`entity_type` is an app-level value. Backend must map it to a currently supported Qloo type; do not accept provider URNs from the browser.

Response (illustrative placeholder data):
```json
{
  "analysis_id":"opaque-analysis-id",
  "visual_profile":{
    "palette":["navy","amber"],
    "lighting":"low",
    "composition":"portrait",
    "mood":["cinematic","nostalgic"],
    "source":"vision_or_manual"
  },
  "cultural_recommendations":[{
    "provider":"qloo",
    "kind":"artist",
    "name":"verified provider-returned name",
    "provider_id":"opaque-provider-id",
    "reason":"Related to a user-confirmed cultural seed",
    "evidence":["user_seed"]
  }],
  "layouts":[{
    "id":"cinematic",
    "name":"Cinematic",
    "reason":"High contrast suits this image",
    "config":{"photo_fit":"cover","overlay":"bottom-gradient","caption_alignment":"left"}
  }],
  "music":{
    "kind":"artist",
    "title":null,
    "artist":"verified artist name",
    "url":null,
    "source":"qloo",
    "explanation":"Artist-level suggestion; track metadata unavailable."
  },
  "provenance":{
    "qloo_used":true,
    "visual_analysis_used":true,
    "track_level_result":false
  }
}
```
All values are illustrative. Never invent scores, URLs or results. Omit unsupported fields.

## Error envelope
```json
{
  "error":{
    "code":"QLOO_RATE_LIMITED",
    "message":"Cultural recommendations are temporarily unavailable. Please try again shortly.",
    "request_id":"opaque-request-id",
    "retryable":true
  }
}
```
Suggested codes: `INVALID_IMAGE`, `IMAGE_TOO_LARGE`, `UPLOAD_EXPIRED`, `OBJECT_NOT_FOUND`, `INVALID_TASTE_SEED`, `QLOO_AUTH_FAILED`, `QLOO_RATE_LIMITED`, `QLOO_TIMEOUT`, `QLOO_EMPTY_RESULTS`, `VISION_UNAVAILABLE`, `INTERNAL_ERROR`.

## `DELETE /v1/uploads/{object_key}`
Confirm the object belongs to the caller/session. Never allow arbitrary bucket/key deletion. Return success if deletion succeeds or object is already absent.

## Optional persistence
`POST /v1/stories` may save story config, object key and minimal metadata. `DELETE /v1/stories/{story_id}` deletes the record and associated temporary object. Enforce ownership on every operation.
