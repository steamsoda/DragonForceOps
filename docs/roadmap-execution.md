# Product Roadmap (Execution)

This complements `docs/phase-1-sdd.md` with a practical delivery plan.

## Current State (as of 2026-03-17)
- App version: v0.8. Internal testing in progress (one campus, directors only).
- Core billing loop: enrollment → charges → payments → ledger → pending list → reports. All wired.
- Real data: 672 players, 694 guardians, 672 enrollments, 2,678 charges, 1,298 payments.
- Caja POS: player search + category drill-down (campus → birth year → player), pending charges, payment posting, thermal receipt.
- Cash session management: open/close per campus, linked cash payments, variance notes, Corte Diario integration.
- Dashboard: 8 KPIs, MoM trends, payment/charge charts. Campus + month filters. Real data end-to-end.
- Reports live: Corte Diario, Corte Semanal, Resumen Mensual, Porto Mensual (all sections wired).
- Activity log: human-readable audit feed, date range + actor + action type filters.
- Products catalog: categories + sizes + charge type linking, POS grid in Caja.
- Role system: `superadmin`, `director_admin`, `front_desk`. RLS enforced. Role-aware nav.
- Void charges: director-only, any pending charge, with required reason. Audit logged.
- Batch baja write-off: `/pending/bajas` — bulk void for ended/cancelled enrollments.
- Player tags: configurable badges (Al corriente/Pendiente, Selectivo/Clases, Portero, Uniforme) toggled from `/admin/configuracion`.
- Goalkeeper flag: `players.is_goalkeeper`, editable, shown as badge on player detail.
- Uniform orders: `ordered → delivered` lifecycle per player, UI on player detail page.
- **Teams system (NEW)**: full team CRUD + roster management — list, create, edit, transfer, refuerzo pattern, new-arrival flag. Auto-assign B2 on enrollment. Team shown on player detail. "Equipos" nav link visible to all staff.
- Printer: `window.print()` receipt at 80mm in place. QZ Tray one-click printing is next (Phase 2).

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

### Phase 1B — ✅ ALL COMPLETE
- ✅ Porto Mensual Equipos + Clases wired from teams + coaches data.
- ✅ Activity log filters: date range, actor, action type.
- ✅ Batch baja write-off: `/pending/bajas` — bulk void pending charges for dropped players.
- ✅ Dropout reason expansion: 34-reason Porto taxonomy, Porto report labels synced.

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

## Prioritized Backlog (as of 2026-03-17, pre-testing)

### Immediate — Testing Prep (before/during testing week)
1. ✅ **Print: window.print() receipt + Corte Diario layout** — two-copy receipt with line items, Corte Diario thermal layout with print button.
2. **Nav/panel audit** — several menu items overlap or show incorrect numbers. Full inspection needed: what stays, what merges, what gets cut, what needs rewiring to real data. Do after first testing session when staff feedback is collected.
3. **Caja cancel UX** — when "Registrar Pago" panel is open and user clicks cancel, page resets to top. Should return to the enrollment panel for that player. Quick fix.
4. **Caja drill-down detail panel** — not started. When viewing a player's pending charges in Caja, staff need to see charge detail (what period, what type) before deciding what to pay. Design TBD — possibly inline expandable rows.

### Phase 2 (active)
1. **Thermal printer — QZ Tray (ESC/POS)**: Epson TM-T20IV on-site. Ethernet connection for multi-machine sharing. QZ Tray on each front desk machine. One-click receipt + Corte Diario, no browser dialog.
   - ✅ Phase 2a: `window.print()` receipt (two copies, line items) + Corte Diario print layout.
   - Phase 2b: QZ Tray integration (after printer is set up and Ethernet IP confirmed).
2. ✅ **Player profile expansion** — active team + coach shown on player detail; uniform orders section; goalkeeper badge; no-team warning for active enrollments.
3. ✅ **Player list tags** — configurable badges: Al corriente/Pendiente, Selectivo/Clases, Portero, Uniforme. Toggle from `/admin/configuracion`.
4. ✅ **Teams system** — full build: list, create, edit, roster, transfer, refuerzo, new-arrival flag. Auto-assign B2 on enrollment. Team linked from player detail.
5. **Tournament UI** — `tournaments` table + team entries + player entries. Mandatory vs optional. Auto charge generation. Schema exists, no UI yet.
6. **Campus-scoped access**: deferred until testing stabilizes across both campuses.
7. **Uniform delivery tracking**: `uniform_orders` table + UI live. Inventory/stock control is Phase 3.
8. **CSV/PDF exports**: Corte Diario goes through thermal printer. Other reports TBD post-testing.
9. **External payment reconciliation**: ingestion path for 360Player/Stripe events.

### Phase 3+ (deferred)
- Coach role + attendance module (coach logs in, takes attendance per session)
- Attendance-based baja detection (3 consecutive missed months)
- Uniform stock control (count-based inventory, dashboard widget)
- Player documents / file uploads (Supabase Storage)
- Jersey number assignment (business rules TBD)
- Tournament entity full build (auto charge generation)
- WhatsApp/SMS automated reminders

## Working Rhythm (Recommended)
- Plan: 1 short planning session per week (30-45 min).
- Build: all feature work in `preview`.
- Validate: smoke test after each significant push.
- Release: merge to `main` only from a green preview state.
