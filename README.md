# Qloo Story Maker — Engineering Guidelines

A detailed implementation pack for a Qloo-powered Instagram Story maker in a pnpm + Turborepo monorepo.

## Product
A user uploads a photo, optionally supplies favorite artists/films/brands, and receives a visual mood summary, three editable 9:16 Story layouts, and a culturally informed artist/track suggestion when metadata is available. Users edit and export a 1080×1920 PNG.

**Boundary:** Qloo is the cultural-intelligence layer. It should not be described as the image-analysis model or layout renderer. Verify track-level support with the current API schema and hackathon key.

## Included files
- `architecture.md` — components, data flow, security and deployment.
- `plan.md` — phased build plan and delivery gates.
- `requirements.md` — functional and non-functional requirements.
- `qloo_API.md` — Qloo validation, integration and fallback strategy.
- `acceptance-criteria.md` — testable release criteria.
- `AGENTS.md` — coding-agent rules for the monorepo.
- `.env.example` — placeholder environment variables only.
- `docs/api-contracts.md` — proposed internal API contract.
- `docs/validation-matrix.md` — assumptions and verification tests.
- `supabase/schema.sql` — optional minimal saved-story schema.

Copy these files into the repository root. If `AGENTS.md` already exists, merge rather than blindly overwrite existing project-specific rules.

## Key assumptions
- `apps/web` is Next.js App Router.
- `apps/api` will contain FastAPI.
- Use pnpm/Turborepo for JavaScript tasks; Python dependencies are managed in a Python virtual environment.
- Guest-mode MVP first; Supabase persistence is optional.
- S3 bucket is private and browser uploads use short-lived presigned URLs.
- Only Qloo is intentionally paid, but hosting/S3 costs can exceed free limits. Verify current quotas and set alerts.
- Verify all Qloo endpoints, entity types, parameters and track-level capabilities against current official docs before implementation.
