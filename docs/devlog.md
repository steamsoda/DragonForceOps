# Devlog

## 2026-03-18 (session 10)

### QZ Tray Thermal Printer Integration (v0.8 continued)

**ESC/POS receipt printing — silent, no browser dialog**
- `src/lib/printer.ts`: loads `/public/qz-tray.js` dynamically via script injection, `connectQZ()` sets up signed mode or unsigned fallback, `buildReceipt()` + `buildCorte()` generate ESC/POS byte sequences.
- Two-copy receipt: COPIA CLIENTE (partial cut `GS V 41 03`) + COPIA ACADEMIA (full cut `GS V 00`). Each copy prints header, line items, total, remaining balance (or "Cuenta al corriente ✓" / "Crédito: $X").
- Auto-print on payment success: `ReceiptPanel` `useEffect` fires `printReceipt()` on mount, errors caught silently. Manual "Imprimir Recibo" (`PrintReceiptButton`) surfaces errors with user-friendly messages.
- Corte Diario: `window.print()` replaced with `PrintButton` calling `printCorte()` via QZ Tray.
- Printer name configurable in Admin → Configuración (`app_settings.printer_name`, defaults to "EPSON TM-T20IV").

**Certificate signing — `/api/sign-qz` API route**
- POST endpoint: authenticates user, normalizes `QZ_PRIVATE_KEY` (`\\n` → actual newlines, adds `-----BEGIN PRIVATE KEY-----` headers if stripped by Vercel), signs with RSA-SHA512, returns base64 signature.
- `NEXT_PUBLIC_QZ_CERTIFICATE`: same `\\n` normalization applied client-side before passing to `setCertificatePromise`.
- QZ Tray Site Manager: demo cert (QZ Industries LLC) added as permanently allowed.

**Key bug fixed during debugging**
- `setSignaturePromise` must return `(resolve, reject) => void`, NOT a Promise. This version of `qz-tray.js` wraps the result in `new Promise(result)`, so returning a Promise caused `TypeError: Promise resolver #<Promise> is not a function` on every print job. Connection succeeded but each print request failed.
- Unsigned fallback fixed to use the same `(resolve) => resolve("")` pattern.

**Physical printer**: Epson TM-T20IV arrives in office. Ethernet setup pending (tomorrow). QZ Tray installed and verified on front desk machine — signing flow confirmed end-to-end. Physical print test scheduled for 2026-03-19.

## 2026-03-17 (session 9)

### Team Assignment UX — Full Build (v0.8 continued)

**Performance fixes (applied in this session)**
- `v_enrollment_balances` view: replaced CTE with correlated subqueries to eliminate the PostgreSQL optimization fence — filters now push through to `enrollment_id IN (...)`.
- `listPlayers`: parallelized guardian + balance + team queries into a single `Promise.all` (was sequential — 3 roundtrips).
- `getEnrollmentLedger`: parallelized enrollment + balance + charges + payments into one `Promise.all`.
- New partial indexes: `idx_team_assignments_primary_active` (`is_primary = true AND end_date IS NULL`) and `idx_team_assignments_new_arrivals` (`is_new_arrival = true AND end_date IS NULL`).

**Caja drill-down by category**
- New panel alongside the existing player search: Campus → Birth Year → Player tiles.
- Drill-down meta (campuses + birth years) preloaded on component mount via `getCajaDrilldownMetaAction()` — click is instant.
- `list_active_birth_years_by_campus()` + `list_caja_players_by_campus_year(p_campus_id, p_birth_year)` RPCs added.
- Optimistic player header: selecting a player from search shows name + balance immediately while ledger loads.
- Fixed: cancel button was a no-op in some states; "Seleccionar por categoría" button was misaligned with the divider.

**Player tags + admin settings panel**
- `app_settings` table (key/value + jsonb, director_admin write, authenticated read).
- Default tag settings: `tag_payment`, `tag_team_type`, `tag_goalkeeper` = true; `tag_uniform` = false.
- `/admin/configuracion`: toggle switches per tag, stored in DB, revalidates player list on save.
- Player list badges: Al corriente/Pendiente (no amount), Selectivo/Clases, Portero, Uniforme pedido/entregado.
- All badges conditional on their toggle; uniform badge skips its query entirely when disabled.

**Goalkeeper flag**
- `players.is_goalkeeper boolean not null default false`.
- Editable from player edit page (checkbox).
- Portero badge shown in player detail info grid.

**Uniform orders**
- `uniform_orders` table: `ordered → delivered` lifecycle, linked to enrollment, independent of charges.
- `UniformOrdersSection` client component on player detail page: create order form + table + "Marcar entregado".
- `getUniformOrdersAction`, `createUniformOrderAction`, `markUniformDeliveredAction` server actions.

**Teams — full feature build**
- Migrations: `20260317140000` — adds `is_new_arrival` + `role` ('regular'|'refuerzo') columns to `team_assignments`; `list_teams_with_counts()` RPC.
- `src/lib/queries/teams.ts`: `listTeams`, `getTeamDetail`, `listCoaches`, `findB2TeamForAutoAssign`, `generateTeamName`.
- Team name auto-generation: `{campusCode} {birthYear} {genderLabel} {level}` (e.g. "LV 2015 Varonil B1"). Class teams: `{campusCode} {birthYear} Clases`.
- `/teams` — list grouped by campus → birth year with summary stats (active teams, players assigned, new arrivals pending).
- `/teams/new` — director-only create form; auto-generates team name from attributes.
- `/teams/[teamId]` — team detail: meta grid, roster via `TeamRosterClient`, history of ended assignments.
- `/teams/[teamId]/edit` — director-only: edit coach, season label, active status.
- `TeamRosterClient`: interactive roster table with inline transfer form + refuerzo form; Confirmar (clears new arrival), Transferir (moves primary), + Refuerzo (secondary non-primary assignment), Quitar (removes refuerzo).
- Server actions: `createTeamAction`, `editTeamAction`, `assignPlayerToTeamAction`, `transferPlayerAction`, `addRefuerzoAction`, `removeRefuerzoAction`, `clearNewArrivalAction`.
- Auto-assign B2 on new enrollment: `createEnrollmentAction` now calls `findB2TeamForAutoAssign` after charges are created; if a matching active B2 team exists for the campus + birth year + gender, creates `team_assignment` with `is_new_arrival = true` and syncs `players.level = 'B2'`.
- Player detail page: shows active team name (linked) + coach; amber warning banner when active enrollment has no team assigned.
- "Equipos" nav link added to Diario section (visible to all staff).

## 2026-03-16 (session 8)

### Phase 1B Completion + Phase 2 Kickoff (v0.8)

**Corte Diario — inline cash session controls (Option A)**
- Directors can close a cash session directly from Corte Diario without leaving the report.
- `closeCashSessionAction` now accepts a `redirect_to` hidden field (defaults to `/caja/sesion`).
- Corte Diario passes back its own URL (preserving date + campus params) so the page reloads in place after close.
- Per-campus session cards show apertura timestamp, totals, and an inline `<details>` close form (zero JS).

**Caja — prominent no-session banner**
- Replaced subtle amber pill with a full-width bordered card when no cash session is open.
- Includes explanation text and direct "Abrir sesión →" CTA.
- Happy path (session open): subtle pills remain unchanged.

**Porto Mensual — Equipos + Clases sections wired**
- New `getPortoTeamsData()` query joins teams → campuses + coaches, counts active players via `team_assignments`.
- Sections 5 (Equipos de Competición) and 6 (Clases) replaced with real tables: campus, birth year, gender, level, coach, player count.
- Section headers show aggregate totals (N equipos · N jugadores).

**Activity log filters**
- Date range (from/to), action type dropdown, actor email partial match.
- All filters applied server-side via search params. Limpiar button clears all. Result count shown when active.

**Dropout reason expansion**
- Full 34-reason Porto taxonomy was already in validation + enrollment-edit-form.
- Porto Mensual `DROPOUT_LABELS` map was stale (7 codes) — synced to full taxonomy.

**Batch baja write-off (`/pending/bajas`)**
- New director-only page listing ended/cancelled enrollments with outstanding balances.
- Checkbox-select any combination, provide a reason, void all pending charges in one action.
- Server action validates director role, only targets ended/cancelled, writes one audit log entry per voided charge.
- "Castigo de bajas →" link added to pending payments page.
- New query: `listBajaEnrollmentsWithBalance()`.

**Printer strategy (Phase 2)**
- Epson TM-T20IV arriving 2026-03-17. Will connect via Ethernet for multi-machine sharing.
- QZ Tray chosen over ePOS SDK: handles HTTPS→HTTP bridge for Vercel-hosted app, works from any machine once installed.
- Phase 2a (tonight): polish `window.print()` receipt + build Corte Diario print layout.
- Phase 2b: QZ Tray one-click integration. Corte Diario physical printout replaces CSV/PDF export for that report.

## 2026-03-15 (session 7)

### Products Catalog + Caja POS Grid (v0.6)
- Replaced "Agregar Cargo Adicional" dropdown in Caja with a McDonald's-style product tile grid (`ProductGridPanel`).
- New tables: `products`. `product_id` + `size` + `is_goalkeeper` columns added to `charges` as nullable — fully non-breaking, all existing reports unaffected.
- Migrations: `20260314120000` (products catalog + initial seed), `20260314130000` (Kit→Uniforme rename), `20260314140000` (`charges.is_goalkeeper boolean null`), `20260315000000` (drop product_categories).
- Seeded 4 initial products: Uniforme Entrenamiento ($600, hasSizes), Uniforme Partido ($600, hasSizes), Superliga Regia ($350), Rosa Power Cup ($350).
- Sizes: XCH JR · CH JR · M JR · G JR · XL JR · CH · M · G · XL. Portero toggle (violet) on uniform charges. `is_goalkeeper = null` on non-uniform charges; `false` = campo; `true` = portero. Enables clean `GROUP BY size, is_goalkeeper` for future order reports.
- Products admin page (`/products`): catalog grouped by display group, per-product KPIs (units sold, revenue, this month), size×goalkeeper breakdown table, recent 25 sales, inline create/edit forms. Only ad-hoc charge types assignable to products.

### Refactor: Drop product_categories — use PRODUCT_GROUPS constant
- Removed `product_categories` DB table (migration `20260315000000`). Having both "product categories" and "charge types" was redundant and confusing.
- Replaced with `src/lib/product-groups.ts` — 10-line frontend constant mapping display group keys to charge type code arrays.
- Create-product form auto-filters charge type options per group; single-type groups skip the dropdown.
- Mensualidades pseudo-category removed — monthly tuition is auto-generated by pg_cron, never a product.

### Branding
- App internally named **INVICTA** (Os Invictas). Site title updated. Header uses Aoboshi One (Google Font).
- Version bumped `v0.5 → v0.6`.

## 2026-03-12 (session 6)

### Caja — POS Quick Action Panel (v0.5)
- New `/caja` route: dedicated payment collection tab for front desk staff.
- Real-time debounced player search (200ms, `ilike` on name) backed by a single `search_players_for_caja()` RPC — replaces 3 sequential Supabase queries with 1 roundtrip.
- Shows all pending charges oldest-first with auto-filled balance amount.
- Fast cashier mode: panel resets to search after each payment posted.
- Phase 1 receipt: `window.print()` styled for 80mm thermal paper (`@media print`).
- `postCajaPaymentAction`: same allocation + early-bird logic as enrollment ledger, returns result instead of redirecting.

### Role System — superadmin + front_desk
- Added `superadmin` and `front_desk` to `app_roles` (migration `20260311150000`).
- Updated `is_director_admin()` to include `superadmin` — all existing policies apply automatically.
- New `is_front_desk()` and `has_operational_access()` helper functions.
- `front_desk` RLS: SELECT on all operational tables, INSERT on payments/payment_allocations/cash_session_entries. No access to audit_logs or financial aggregates.
- Role-aware nav: `front_desk` sees Caja + Jugadores only; directors see full nav.
- `layout.tsx`: canAccess now includes `superadmin` and `front_desk`.
- `roles.ts`: added `SUPERADMIN`, `FRONT_DESK`, `DIRECTOR_OR_ABOVE` constants.
- Version bumped `v0.4 → v0.5`.

### Performance
- `search_players_for_caja` RPC (migration `20260311160000`): joins players → enrollments → campuses → v_enrollment_balances in one query. Eliminates 2 extra Supabase roundtrips per keystroke.

## 2026-03-11 (session 5)

### Real Data Seed — Schema Fixes + Load
- Moved `seed_real_data.sql` out of migrations into `scripts/` to avoid Supabase CI timeout on large seed files (session 4 partial).
- Hit three NOT NULL constraint violations when running seed against preview DB:
  - `guardians.first_name` / `last_name` / `phone_primary` — real data has contacts identified by phone-only or email-only, name unknown.
  - `payments.created_by` / `charges.created_by` — historical records predate the app, no auth user attached.
- Created two migrations to relax constraints:
  - `20260311120000_guardians_nullable_name.sql`: drops NOT NULL on `first_name`, `last_name`, `phone_primary`.
  - `20260311130000_nullable_created_by.sql`: drops NOT NULL on `charges.created_by` and `payments.created_by`.
- Seed landed clean: 672 players, 694 guardians, 672 enrollments, 2678 charges, 1298 payments.

### Players List — Fix Empty List with Real Data
- Root cause: `listPlayers` was fetching all 672 active-enrollment player IDs then passing them as `.in("id", [...672 ids])`. PostgREST encodes this as a URL query parameter — with 672 UUIDs (~25KB) it exceeds URL length limits and the query silently returned empty.
- Fix: restructured query to use `enrollments!inner` in the select string, letting PostgREST generate a SQL JOIN instead of a URL-parameter filter. No large `.in()` needed for the main query.
- Phone filter still pre-resolves player IDs but the result set is always small (few guardians match a phone search).
- `EnrollmentRow` type removed from `listPlayers` path; replaced with `PlayerWithEnrollmentRow` that embeds the enrollment data.

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
