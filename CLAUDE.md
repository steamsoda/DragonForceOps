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
  - Patch bump (0.8.2 → 0.8.3): bug fixes, small tweaks
  - Minor bump (0.8.x → 0.9.0): new features or significant additions
  - Major bump: reserved for production launch milestones
- Always include the new version in the commit message (e.g. `v0.8.3`)

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

---

## Post-Alpha Roadmap (INVICTA)
Live testing started 2026-03-19. Source of truth: `docs/roadmap-post-alpha.md`.

### P0 — Critical Bugs ✅ All done
| # | Item |
|---|------|
| 1 | Receipt on enrollment ledger page |
| 2 | Receipt from player profile payment |
| 3 | Garbled ñ / accents on printed receipts |
| 4 | Corte Diario UTC offset |
| 5 | Date format DD/MM/YYYY |

### P1 — High Priority ✅ All done
| # | Item |
|---|------|
| 6 | Alphabetical sort in Caja category drill-down |
| 7 | Categoría + Campus on receipt |
| 8 | Sequential receipt folio numbers (LV-202603-00042) |
| 9 | Split payment (multiple methods) |
| 10 | "Nueva Inscripción" button in Caja |
| 11 | Edit guardian/tutor info from player profile |

### P2 — Near Term 🔴 Open
| # | Item | Notes |
|---|------|-------|
| 12 | Jersey number on player profile | `players.jersey_number` int nullable; show + edit |
| 13 | Coach on player profile | Active team shown; add coach name |
| 14 | Past receipt / ticket search | By folio or player name; needs P1-8 first |
| 15 | Advance month payment | Manual charge creation for next period |
| 16 | Pendientes — call center mode | "Contactado" checkbox + notes per enrollment row |

### P3 — Backlog 🔴 Open
| # | Item | Notes |
|---|------|-------|
| 17 | Uniformes tab | `uniform_orders` table exists, needs dedicated page |
| 18 | Server-side route blocking | Explicit role check on every `(protected)/` route |
| 19 | Dashboard KPI verification | Saldo Pendiente / Alumnos con Saldo may show 0 |
| 20 | Caja cancel UX | Cancel → return to enrollment panel, not page top |
| 21 | Caja pending charge detail | Expandable rows with period month + charge type |
| 22 | Folio → payment lookup in Actividad | Surface payment ID in audit log |
