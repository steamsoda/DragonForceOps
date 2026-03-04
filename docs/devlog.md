# Devlog

## 2026-03-03 (session 2)

### Player List UX Overhaul
- Players list now shows **only actively enrolled players** — `listPlayers` always starts by fetching player IDs with `enrollments.status = active`, using them as the base constraint. Removed `status` player filter from UI (redundant now).
- Removed campus + status columns from player table; kept name, campus, phone, actions.
- Added **"+ Nuevo jugador"** button to players list → `/players/new`.

### New Player Creation Flow
- `src/lib/validations/player.ts` — `parsePlayerFormData`: validates player fields (firstName, lastName, birthDate, gender) + guardian fields (firstName, lastName, phone required).
- `src/server/actions/players.ts` — `createPlayerAction`: creates guardian first, then player, then `player_guardians` link (is_primary = true). Redirects to player detail page.
- `src/components/players/player-form.tsx` — `PlayerCreateForm`: two sections (jugador + tutor principal), pure server component.
- `src/app/(protected)/players/new/page.tsx` — new player creation page with error handling.

### Player Detail Page Simplified
- Removed full enrollment history table.
- Now shows: player info card, guardians table, and a **single enrollment card** for the active enrollment.
- Enrollment card: campus, plan, start date, **days since enrollment**, total charges/payments, balance (colored), links to "Ver cuenta" and "Editar inscripcion".
- If no active enrollment: amber notice + "Nueva inscripcion" button.
- Balance shown in rose (positive = owes) or emerald (zero/credit).

### Breadcrumbs
- `PageShell` updated to accept `breadcrumbs?: { label: string; href?: string }[]` prop.
- Breadcrumbs added to: players list, player detail, new player, new enrollment, edit enrollment pages.

### Version Bump
- `v0.1 → v0.2` in layout header.

## 2026-03-02 / 2026-03-03

### Business Rules Confirmed
- Full Q&A session to nail down all SDD TBDs.
- Confirmed pricing: inscription $1,800 (includes 2 training kits), tuition 2 tiers ($600 early bird days 1–10 / $750 regular days 11+), extra kit + game uniform $600 each. No penalty surcharge tier.
- Confirmed enrollment creates 2 charges (inscription + first month at $600 flat), not 3.
- Confirmed player org hierarchy: Categoría = year of birth (primary), Campus → Gender → Level (B1/B2/B3) → Team.
- SDD updated throughout to reflect all confirmed rules.

### Schema Alignment (4 migrations)
- `20260302120000` — added `players.level`, renamed `teams.age_group → birth_year int`, added `teams.level + gender`, deactivated `uniform` charge type, added `uniform_training` + `uniform_game`.
- `20260302130000` — dropped legacy `charges_amount_check` constraint (was `> 0`; replacement `charges_amount_nonzero` is `<> 0` to allow discount credit lines).
- `20260302140000` — added `pricing_plan_items` table: fixed-price catalog per plan (inscription, uniform_training, uniform_game). Indexed via unique constraint on `(pricing_plan_id, charge_type_id)`.
- `20260302150000` — corrected all placeholder pricing data: renamed plan to "Plan Mensual", deactivated "Plan Avanzado", replaced 3-tier tuition rules with 2-tier ($600/$750), set correct item amounts.

### Enrollment Creation Flow
- `getEnrollmentCreateFormContext` query: loads player, campuses, active plan, and inscription default from `pricing_plan_items`.
- `parseEnrollmentFormData` validation: campusId, planId, startDate, inscriptionAmount, firstMonthAmount, notes.
- `createEnrollmentAction` server action: verifies no active enrollment exists, inserts enrollment + 2 charges atomically, redirects to ledger.
- `EnrollmentCreateForm` component: campus dropdown, date picker, editable amounts pre-filled from DB.
- `EnrollmentCreatePage`: replaced stub at `/players/[id]/enrollments/new`, handles errors + active-enrollment guard.

## 2026-02-26

### Infrastructure and Auth
- Re-established `preview` branch flow in GitHub/Vercel/Supabase.
- Fixed OAuth callback origin logic to use current deployment origin.
- Added visible sign-in error messaging for OAuth failures.
- Diagnosed and resolved Azure provider issues in Supabase preview project:
  - provider enablement
  - secret mismatch
  - callback and redirect URL mismatches
- Confirmed preview login reaches protected routes successfully.

### Process and Planning
- Added `docs/branching-workflow.md` to standardize preview-first delivery.
- Added `docs/roadmap-execution.md` with phase priorities and delivery criteria.

### Product
- Replaced dashboard placeholder with live KPI cards:
  - active enrollments
  - pending balance
  - payments today
  - payments this month

### Product Iteration
- Refactored dashboard into modular units to avoid page bloat:
  - `dashboard-filters` component
  - `kpi-card` component
  - `trend-card` component
  - dedicated dashboard query module
- Added dashboard filters:
  - campus selector
  - month selector
- Added month-over-month trend cards:
  - payments (selected month vs previous month)
  - charges (selected month vs previous month)

### Security and Performance Guardrails
- Added `docs/security-performance-baseline.md` with mandatory PR gates.
- Hardened bootstrap admin fallback to never grant access in production runtime.

### Billing and Collections Milestone
- Implemented full enrollment ledger screen with live data:
  - summary totals (cargos/pagos/saldo)
  - detailed charges table
  - detailed payments table
- Implemented payment posting flow:
  - server-side validation
  - amount allocation to pending charges
  - success/error feedback in Spanish
- Implemented charge creation flow:
  - active charge type selection
  - server-side validation and insert
  - redirect back to ledger with confirmation
- Implemented pending payments workflow:
  - live list from active enrollments with positive balances
  - filters by campus/team/balance bucket/overdue status
  - quick `tel:` call action and direct link to enrollment ledger
- Added preview sample data seed script for realistic QA in preview database.
