# Devlog

## 2026-03-05 (session 4)

### Reports — Corte Diario + Resumen Mensual
- `src/lib/queries/reports.ts` — two query functions replacing the empty placeholder file:
  - `getCorteDiarioData({ date, campusId })`: payments posted on a given day grouped by method; returns summary tiles + detail rows (player name linked to ledger, time, method, amount, notes). Defaults to today UTC.
  - `getResumenMensualData({ month, campusId })`: charges by type + payments by method for a month; also returns active enrollment count and pending balance across active enrollments.
- `PAYMENT_METHOD_LABELS` map: Efectivo / Transferencia / Tarjeta / 360Player/Stripe / Otro.
- Corte Diario page: date + campus filter form, summary tiles (total + one tile per method), payments table with footer total row. Note in footer: times shown in UTC.
- Resumen Mensual page: month + campus filter, 4 KPI tiles, net balance line (cobrado − cargos), side-by-side tables (Cargos por tipo | Cobros por método) each with count + total + footer.

### Cargo por Equipo (Bulk Charge Admin)
- `src/lib/queries/teams.ts` — two query functions:
  - `listTeamsWithCampus()`: active teams with campus name, birth_year, gender, level for the grouped selector.
  - `listBulkChargeTypes()`: active charge types excluding auto-managed codes (`monthly_tuition`, `inscription`, `early_bird_discount`).
- `bulkChargeTeamAction` server action: validates inputs → gets active enrollments via `team_assignments` (end_date IS NULL + enrollment.status = active) → inserts one charge per enrollment. Not idempotent by design (multiple tournament charges are valid).
- `/admin/cargos-equipo` page: team selector grouped by campus (with birth year / gender / level in label), charge type selector, amount (accepts negative for credits/discounts), description. Success shows count of charges created. Warning note: not idempotent.
- Nav link added: "Cargo Equipo". Version bumped `v0.3 → v0.4`.

### Audit Log Wiring
- `src/lib/audit.ts` — `writeAuditLog(supabase, entry)` helper: inserts to `audit_logs` table, wraps in try/catch and swallows errors so audit failures never block operations.
- Wired into 5 action points (all with `after_data`, no `before_data` for Phase 1):
  - `enrollment.created` — after enrollment + initial charges inserted
  - `enrollment.ended` / `enrollment.reactivated` / `enrollment.updated` — after status change, with `dropout_reason`
  - `payment.posted` — after payment + allocations inserted, with amount + method
  - `charge.created` — after ad-hoc charge inserted
  - `charges.bulk_created` — after team bulk charge, with team_id + count

## 2026-03-04 (session 3)

### Bajas List
- `listBajas` query: fetches all ended/cancelled enrollments, deduplicates to most recent per player, excludes players with an active enrollment. Supports campus + name filters. In-memory pagination (total dataset is small).
- Players list now has **Activos / Bajas tabs** (`?view=bajas`). Bajas table: name (link), fecha inscripcion, fecha baja, dias inscrito, motivo.
- Active view unchanged; "Nuevo jugador" button hidden in bajas view.

### Inactive Player Profile
- `getPlayerDetail` now fetches `dropout_reason` and `dropout_notes` on all enrollment rows.
- Player detail page: inactive players (no active enrollment) now show a "Ultima inscripcion (baja)" card with campus, start date, dropout date, days enrolled, dropout reason + notes.
- Generic amber notice now only shows for players who have never been enrolled.

### Clickable Names in Pendientes
- `listPendingEnrollments` now includes `playerId` in each returned row.
- `PendingTable` `PendingRow` type updated; player name is now a `Link` to `/players/${playerId}`.

### Post-Signup Redirect
- `createPlayerAction` now redirects to `/players/${player.id}/enrollments/new` instead of the player detail page, enforcing the rule that all new players are immediately enrolled.

### Monthly Charge Generation (Manual + Automated)
- `src/lib/billing/generate-monthly-charges.ts` — shared core logic extracted: fetches active enrollments, looks up tuition rates (prefers open-ended `day_to IS NULL` rule, falls back to highest-amount rule), skips already-charged enrollments (idempotent), inserts charges with `NULL` created_by for system jobs.
- `src/server/actions/billing.ts` — thin server action wrapper; takes month form input, calls core, redirects with result.
- `src/app/(protected)/admin/mensualidades/page.tsx` — manual generation UI: month picker + submit button; shows `creados`/`omitidos` result or error in Spanish. Notes that pg_cron runs automatically on day 1 at 06:00 UTC.
- Migrations: `20260304000000` seeds correct tuition rules (idempotent, handles both old/new plan name); `20260304010000` adds `early_bird_discount` charge type.
- Root cause of earlier "no_rate_found" error: the original pricing migration searched for `Plan Mensual Basico` (which may not exist in some environments), silently skipping rule inserts. Fixed by the idempotent reseed migration.

### Early Bird Discount Automation
- When a payment is posted on days 1–10 of the month and it touches a `monthly_tuition` charge for the current period, `applyEarlyBirdDiscountIfEligible()` automatically inserts a **negative credit line** (`early_bird_discount` charge, `status = 'posted'`, amount = -(regular − early_bird), e.g. -$150).
- Uses a separate charge type so it doesn't conflict with the unique partial index on `(enrollment_id, charge_type_id, period_month)`.
- Idempotent: checks for existing discount before inserting. Silently no-ops on any error — discount is a bonus, never fails the whole payment.
- Ledger math: `v_enrollment_balances` sums all non-void charges including negatives, so a $750 tuition + -$150 discount + $600 payment = $0 balance correctly.

### pg_cron Automation
- Migration `20260304020000`: enables `pg_cron`, creates `public.generate_monthly_charges(p_period_month date)` as a `SECURITY DEFINER` function (bypasses RLS, runs as the defining role), schedules it at `0 6 1 * *` (day 1 of each month, 06:00 UTC).
- `charges.created_by` made nullable — pg_cron has no auth user; system-generated charges have `NULL` created_by.
- Unschedule-then-reschedule pattern with exception handling makes the migration safe to re-run.
- Replaced Vercel Cron approach (which required a cron secret env var + service role key on both Vercel and Supabase). pg_cron runs entirely inside Supabase — no HTTP, no secrets.
- Confirmed active in Supabase dashboard (`cron.job` table: `generate-monthly-charges | 0 6 1 * * | select public.generate_monthly_charges() | active: true`).

### Version Bump
- `v0.2 → v0.3`

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
