# AGENTS.md — Coding Rules

## Project
Build a Qloo-powered Instagram Story maker. Upload a photo, optionally provide favorite cultural entities, receive visual/cultural recommendations and three editable Story layouts, then export a 1080×1920 PNG.

## Architecture boundaries
- `apps/web`: Next.js App Router + TypeScript.
- `apps/api`: FastAPI/Python.
- `packages/ui`: reusable React UI primitives.
- Qloo and AWS secret-bearing calls are server-side only.
- Story rendering is local Canvas/SVG.
- Supabase persistence is optional for guest MVP.
- S3 bucket private; uploads use short-lived presigned URLs.
- Keep vision, Qloo cultural intelligence and layout rendering separate.
- Do not claim Qloo analyzes pixels or generates layouts unless current official docs prove it.

## Before changes
1. Read README, architecture, plan, requirements, qloo_API and acceptance criteria.
2. Inspect existing root package/workspace/Turbo configs and preserve existing app files.
3. Verify current official Qloo schema before coding provider parameters or entity URNs.
4. Do not replace the monorepo wholesale or delete starter files without reason.

## Tooling
- Use pnpm for JavaScript dependencies and scripts; do not use npm/Yarn to alter lockfile.
- Commit `pnpm-lock.yaml` changes when dependencies change.
- Use Turborepo to orchestrate JS and documented API tasks.
- Python dependencies belong to `apps/api`, installed in a Python venv via `pyproject.toml` or pinned `requirements.txt`.
- Never install Python dependencies with pnpm.
- Document Node, pnpm and Python versions.

## TypeScript/Next.js
- Strict TypeScript; avoid `any` unless justified.
- Server Components by default; use `"use client"` only for interactivity.
- Never expose Qloo/AWS/service-role secrets in `NEXT_PUBLIC_*`.
- Validate API responses; handle loading, empty, error, retry and success states.
- Revoke object URLs when no longer needed.
- Keep layout configs typed and serializable.
- Avoid dependencies where native Canvas/SVG is sufficient.

## FastAPI/Python
- Use Pydantic request/response models and central settings.
- Use async `httpx` with explicit timeouts.
- Separate routes, services, schemas and provider adapters.
- Do not accept arbitrary Qloo query strings from browser.
- Normalize provider responses inside Qloo adapter.
- Return safe errors; never return keys or raw secret-bearing upstream errors.
- Add pytest coverage; use Ruff for lint/format.

## Qloo
- Verify endpoints, entity types, parameters and response schema against official docs.
- Qloo key server-side only.
- Distinguish provider results from vision signals and local rules.
- Never fabricate track titles or label artist as track.
- Bounded retries for transient errors only.
- Cache only if provider terms allow it.
- Redact API keys, signed URLs, images and sensitive user text from logs.

## Storage/security
- S3 private with Block Public Access.
- Random object keys, short-lived presigned URLs, least-privilege IAM.
- Validate file size, MIME type and image decoding server-side.
- Prefer JPEG/PNG/WebP; reject arbitrary SVG as photo input unless sanitized.
- Lifecycle expiry and deletion support.
- Never store image bytes in Postgres.
- Enable Supabase RLS for user-owned data.
- Never expose service-role key.
- Strip EXIF/GPS where practical.
- Keep `.env` files out of Git; commit `.env.example` only.

## Music/copyright
- Do not scrape streaming services or download copyrighted audio.
- Do not redistribute audio without rights.
- Use verified metadata and permitted URLs.
- Prefer Instagram native music-sticker flow.

## Tests and done definition
Before declaring complete:
1. Run relevant web lint/typecheck/tests.
2. Run Python tests and Ruff.
3. Test meaningful error paths.
4. Check mobile upload/editor/export.
5. Verify no secret/signed URL in bundle/logs.
6. Update docs and `.env.example` when contracts/config change.
7. Never claim tests passed unless run.
A task is done when requirements, tests, UX states, docs and secret hygiene are satisfied.
