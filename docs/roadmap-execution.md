# Product Roadmap (Execution)

This complements `docs/phase-1-sdd.md` with a practical delivery plan.

## Current State (as of 2026-03-16)
- App version: v0.7. Phase 1B operational MVP is complete and in daily use.
- Core billing loop: enrollment → charges → payments → ledger → pending list → reports. All wired.
- Real data: 672 players, 694 guardians, 672 enrollments, 2,678 charges, 1,298 payments.
- Caja POS: player search (name + birth year, pg_trgm), pending charges, payment posting, thermal receipt.
- Cash session management: open/close per campus, linked cash payments, variance notes, Corte Diario integration.
- No-session warning in Caja: prominent amber banner with direct open-session link.
- Dashboard: 8 KPIs, MoM trends, payment/charge charts. Campus + month filters. Real data end-to-end.
- Reports live: Corte Diario (daily, with charge-type breakdown + session panel), Corte Semanal (weekly), Resumen Mensual, Porto Mensual.
- Porto Mensual: Datos Generales auto-compute (enrollments, dropouts, activos, gender, scholarship), Eventos log, Mapa de Área log. Equipos/Clases sections show empty state (data exists, not yet wired).
- Activity log: human-readable audit feed, last 200 entries, no filters yet.
- Products catalog: categories + sizes + charge type linking, POS grid in Caja. Delete guard.
- Role system: `superadmin`, `director_admin`, `front_desk`. RLS enforced. Role-aware nav.
- Void charges: director-only, any pending charge, with required reason. Audit logged.
- Scholarship skip: both DB cron and TypeScript manual trigger filter `has_scholarship = true`.
- Dropout reason: 7 codes in current implementation (full Porto taxonomy ~30 not yet expanded).
- Dark mode: localStorage + anti-flash + global CSS for native form controls. v0.7.

## Delivery Principles
- Build and validate in `preview` first.
- Every DB change must be a migration in `supabase/migrations`.
- Merge to `main` only after preview smoke tests pass.
- Keep production maintenance mode enabled only during controlled release windows.

## Phase 1A: Stabilization ✅ COMPLETE
Goal: make current features reliable for daily internal usage.

1. ✅ Auth + Access Hardening — roles seeded, RLS enforced, bootstrap env removed.
2. ✅ Data Integrity Pass — allocation edge cases handled, server-side validation in place.
3. ✅ Report Reliability — corte diario and resumen mensual verified against real data.

## Milestone Snapshot (completed)
- Preview deployment/auth baseline stabilized.
- Dashboard v2 live with campus/month filters and MoM trends.
- Enrollment ledger operational with charge/payment detail.
- Charge creation and payment posting operational.
- Pending collections view operational with filters and call shortcuts.
- Security/performance baseline documented and adopted.

## Phase 1B: Operational MVP Completion ✅ LARGELY COMPLETE
Goal: complete the minimum operational feature set for steady daily use.

1. ✅ **Caja — POS Panel** — player search, pending charges, payment posting, receipt, session guardrail.
2. ✅ **Role System** — `front_desk`, `director_admin`, `superadmin`. RLS enforced. Role-aware nav.
3. ✅ **Dashboard KPIs** — 8 KPIs wired to real data, MoM trends, payment/charge charts.
4. ✅ **Pending Workflow** — campus/balance/overdue filters, pagination. Enrollment ledger links present.
5. ✅ **Cash Session UX** — open/close per campus, linked payments, variance notes, Corte Diario integration, prominent Caja banner.
6. ✅ **Porto Monthly Report** — Datos Generales auto-compute, Eventos log, Mapa de Área log, Equipos/Clases wired.
7. ✅ **Activity Log UI** — human-readable audit feed, last 200 entries. ⚠ No filters yet.
8. ✅ **Corte Diario charge-type summary** — charge-type breakdown grid live.
9. ✅ **Weekly Corte** — week-by-week view with bar chart and drill-down links.
10. ✅ **Caja ad-hoc charges** — fully built. "+ Cargo" button → product grid (uniforms, tournaments, etc.) with size + goalkeeper options, amount input, creates charge and returns to enrollment panel.

### Remaining Phase 1B work
- ✅ Porto Mensual: Equipos and Clases sections wired from teams + coaches data.
- Activity log: add date / actor / action-type / campus filters.
- Batch baja write-off: bulk void pending charges for a list of dropped-out players.
- Dropout reason expansion: grow from 7 codes to Porto's full ~30-reason taxonomy.

## Phase 2: Roles, Integrations, and Ops Expansion
Goal: broader operational support and integrations.

1. **Role Expansion**
- Implement `coach` role: read-only access to own team rosters. No financials.
- Campus-scoped access rules (front desk sees only their campus).

2. **Caja Phase 2 — Thermal Printer**
- ESC/POS integration via QZ Tray (local bridge on front desk PC).
- Compatible printers: Star TSP100 or Epson TM-T20 (~$2,500 MXN).
- One-click receipt printing, no browser dialog.

3. **External Payments**
- Define ingestion path for 360Player/Stripe events.
- Add reconciliation queue for unmatched events.

4. **Export and Ops Tooling**
- CSV/PDF exports for daily and monthly reports.
- Basic admin diagnostics page for auth/env/role checks.

5. **Coach Module**
- Coaches log into app to take attendance per training session.
- Attendance records link to team/session/date.
- Attendance-based baja detection (3 consecutive missed months).

6. **Uniform Delivery Tracking**
- `player_uniform_deliveries` table: tracks who has/hasn't received training kit, game kit, goalkeeper kit.
- Player card shows uniform status badges.
- Goalkeeper kit flagged as distinct product type.

7. **Uniform Stock Control (Light Inventory)**
- Count-based inventory: units on hand per type/size.
- Dashboard widget: "Training kits on hand: 12 · Order 8 more this week"
- No barcode/SKU in Phase 2.

8. **Player Documents / File Uploads**
- Supabase Storage for photo ID, passport, birth certificate, medical forms.
- `player_documents` table + Storage bucket with RLS (director_admin+ only).

9. **Jersey Number Assignment**
- Business rules TBD (confirmed: even birth year → even number; odd → odd; more rules pending).
- Do not design schema until full ruleset confirmed.

10. **Tournament Entity**
- `tournaments` table, team entries, mandatory vs optional, auto charge generation.

## Prioritized Backlog (as of 2026-03-16)

### Phase 1B completion (short-term)
1. ✅ **Porto Mensual — Equipos + Clases sections**: wired. Team/class tables with campus, birth year, gender, level, coach, player count.
2. ✅ **Activity log filters**: date range, actor, action type filters added to `/activity`.
3. ✅ **Dropout reason expansion**: 34-reason Porto taxonomy already implemented. Porto report DROPOUT_LABELS synced.
4. **Batch baja write-off UI**: select multiple dropped-out enrollments → void all pending charges in one action. Director only.

### Phase 2 (medium-term)
6. **Campus-scoped access**: `user_campus_assignments` table — front desk sees only their campus's data in Caja, sessions, and reports.
7. **Thermal printer (ESC/POS)**: QZ Tray integration for Star TSP100 / Epson TM-T20. One-click receipt, no browser dialog.
8. **CSV/PDF exports**: export daily and monthly reports. No schema change needed.
9. **Uniform delivery tracking**: `player_uniform_deliveries` — who has/hasn't received training kit, game kit, goalkeeper kit. Status badges on player cards.
10. **External payment reconciliation**: ingestion path for 360Player/Stripe events, reconciliation queue.

### Phase 3+ (deferred)
- Coach role + attendance module
- Uniform stock control (inventory)
- Player documents / file uploads (Supabase Storage)
- Jersey number assignment (business rules TBD)
- Tournament entity (auto charge generation for team entries)
- WhatsApp/SMS automated reminders

## Working Rhythm (Recommended)
- Plan: 1 short planning session per week (30-45 min).
- Build: all feature work in `preview`.
- Validate: smoke test after each significant push.
- Release: merge to `main` only from a green preview state.
