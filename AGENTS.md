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

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

## Repo specifics (added during implementation)
- Versions: Node ≥ 24, pnpm 11.25, Python ≥ 3.11 (CI uses 3.12).
- API tasks run through `apps/api/scripts/py.mjs` (`pnpm api:setup`, `pnpm --filter api dev|test|lint`).
- Layout ids live in two places: `apps/api/app/services/recommendations/layouts.py` (ranking) and
  `apps/web/lib/story/templates.ts` (rendering). `templates.test.ts` fails if they drift.
- Rendering must stay pure: `renderStory(ctx, photo, state)` with no React state or randomness
  except the seeded `rng()`.
- Browser e2e: `pnpm --filter web e2e` against a running `pnpm dev` (uses installed Chrome).
- Pinterest reference images in `design-refs/pinterest/` are gitignored. Never commit them (Pinterest
  grants no republishing rights). Commit only `SOURCES.tsv` links + author credits; rebuild with
  `python3 design-refs/fetch.py`.
- Layout ids also live in `apps/web/lib/story/groups.ts` (editor/gallery sections; a test keeps it
  complete) and `supabase/schema.sql` (`stories_template` check; a test keeps it in sync).
- Layout ids also key `apps/api/app/services/recommendations/layout_tags.json` (Qloo tags per layout;
  rebuild with `apps/api/scripts/layout_tags.py`, needs the Qloo key; a test keeps it complete).
- Generated assets: `apps/api/scripts/make_elements.py` (PNG elements), `apps/api/scripts/
  key_template.py` (green-screen templates), `design-refs/build_pins.py` (pins.json credits).
- Commits: author is the repository owner only. No AI co-author trailers.
