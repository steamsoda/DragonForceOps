# Dragon Force Ops — Claude Code Instructions

## Project
Internal ops app for FC Porto Dragon Force soccer academy, Monterrey MX.
Stack: Next.js App Router + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel.

## Key Docs (read before making decisions)
- `docs/new-sdd.md` — living spec, source of truth for schema and architecture
- `docs/roadmap-execution.md` — prioritized feature roadmap
- `docs/devlog.md` — session history
- `docs/roadmap-post-alpha.md` — live testing bug tracker and backlog

## Versioning
- Current version is in `package.json` → `"version"`
- **Bump the version on every commit** before committing
  - Patch bump (x.y.Z → x.y.Z+1): bug fixes, small tweaks — can go above 9 (e.g. 1.0.14)
  - Minor bump (x.Y.z → x.Y+1.0): new features or additions — can go above 9 (e.g. 1.21.0)
  - Major bump (X.y.z): reserved for special production milestones only
- Always include the new version in the commit message (e.g. `v1.1.0`)

## Workflow Rules
- Preview-first: all changes go to `preview` branch, never directly to `main`
- DB changes via migrations only — never ad-hoc SQL
- Migrations auto-apply on push to `preview` — never tell the user to apply manually
- TypeScript check (`npx tsc --noEmit`) must pass before committing
- Server-side logic only: Server Actions and API routes, no client-side DB access

## Code Style
- Keep it simple — avoid over-engineering
- No unnecessary abstractions for one-off operations
- Server Actions return typed result objects (`{ ok: true, ... } | { ok: false, error: string }`)
- RLS at DB layer for all security-sensitive data

## Architecture
- Enrollment is the operational anchor (not the player)
- Ledger model: charges + payments + payment_allocations
- Categoría = birth year (immutable), always sort/filter by this first in UI
