# Product Roadmap (Execution)

This complements `docs/phase-1-sdd.md` with a practical delivery plan.

## Current State (as of 2026-03-13)
- Preview auth flow works end-to-end.
- Protected app routes are reachable after login.
- Core billing loop working in preview: create charge → post payment → ledger → pending list.
- Real data seeded: 672 players, 694 guardians, 672 enrollments, 2,678 charges, 1,298 payments.
- Caja (POS) panel live: debounced search, pending charges, payment posting, thermal receipt.
- Role system live: `superadmin`, `director_admin`, `front_desk`. Role-aware nav.
- Coaches seeded from Porto Clases CSV; `has_scholarship` and `teams.type` columns added.
- Porto monthly report planning complete. Eventos and Mapa de Área confirmed as continuous log tables.
- Admin demo held 2026-03-13; feature backlog captured in SDD Section 17.
- App version: v0.5

## Delivery Principles
- Build and validate in `preview` first.
- Every DB change must be a migration in `supabase/migrations`.
- Merge to `main` only after preview smoke tests pass.
- Keep production maintenance mode enabled only during controlled release windows.

## Phase 1A: Stabilization (Now - next 3 to 5 days)
Goal: make current features reliable for daily internal usage.

1. Auth + Access Hardening
- Confirm strict role-based access via `public.user_roles`.
- Remove temporary bootstrap access env (`BOOTSTRAP_ADMIN_EMAILS`) once roles are seeded.
- Improve login/callback error UX with short actionable messages.

2. Data Integrity Pass
- Validate enrollment invariants (one active enrollment per player).
- Validate payment/charge allocation edge cases.
- Add missing server-side validation where silent failures are possible.

3. Report Reliability
- Verify `corte diario` and `resumen mensual` totals against sample manual calculations.
- Add empty-state handling and error boundaries for report endpoints.

Exit criteria:
- No blocking auth errors in preview for admin users.
- End-to-end flow works: player -> enrollment -> charge -> payment -> pending follow-up -> reports.
- Smoke test checklist is consistently green.

## Milestone Snapshot (completed)
- Preview deployment/auth baseline stabilized.
- Dashboard v2 live with campus/month filters and MoM trends.
- Enrollment ledger operational with charge/payment detail.
- Charge creation and payment posting operational.
- Pending collections view operational with filters and call shortcuts.
- Security/performance baseline documented and adopted.

## Phase 1B: Operational MVP Completion
Goal: complete the minimum operational feature set for steady daily use.

1. **Caja — POS Quick Action Panel** (`/caja` route)
- Dedicated tab for front desk staff: player search + payment collection.
- Debounced real-time player search (Client Component, `ilike`).
- Shows all pending charges oldest-first; auto-fills outstanding balance.
- Fast cashier mode: panel resets after each payment.
- Phase 1 receipt: browser print styled for 80mm thermal paper.
- Phase 2 receipt: ESC/POS via QZ Tray + Star/Epson thermal printer.

2. **Role System — `front_desk` role** ✅ Done
- `front_desk` and `superadmin` added to `app_roles`.
- RLS policies enforced: front_desk can search players, post payments, use Caja. No financial stats, no voids.
- Role-aware nav: front_desk sees Caja + Jugadores only. Director+ sees full nav.

3. **Dashboard KPIs**
- Wire real metrics for active enrollments, pending balance, payments today, and monthly totals.

4. **Pending Workflow Improvements**
- Add better filtering and sorting for collections/follow-up.
- Add quick actions for calling guardians and opening enrollment ledger.

5. **Cash Session UX**
- Improve open/close session workflow and variance explanation notes.
- Add guardrails when posting cash payments without an open session.

6. **Porto Monthly Report** (`/reports/porto-mensual`)
- Datos Generales: auto-compute inscripciones, retiros, activos, varonil/femenil, retrasos, facturación USD.
- Eventos section: continuous `academy_events` log (add/view inline, filtered by month).
- Mapa de Área section: continuous `area_map_entries` quality log (add/view/close inline, filtered by month).
- Equipos and Clases tabs: auto-populate from teams + coaches once teams seeded.
- Month selector (URL param), defaults to previous month.

7. **Activity Log UI** (`/activity`)
- Human-readable feed from `audit_logs`. Director/superadmin only.
- Format: "User X posted payment of $600 for [Player] · 2 min ago"
- Filter by date, actor, action type, campus.

8. **Corte Diario — Summary by Charge Type**
- Add aggregate summary row to corte: Mensualidades: $X · Inscripciones: $X · Uniformes: $X
- UI-only change, no schema needed.

9. **Weekly Corte**
- Aggregate version of Corte Diario spanning Mon–Sun.

10. **Caja Enhancements**
- Ad-hoc item charges from Caja (staff charges a uniform, league fee, etc. without leaving the panel).
- More player/enrollment context visible (details TBD — Javi to specify).

Exit criteria:
- Front desk staff can run a full payment shift from `/caja` without touching any other page.
- Director can see financial summary from dashboard.
- Porto monthly report generates Datos Generales automatically; Eventos and Mapa de Área log continuously.
- No manual SQL needed for any daily operation.

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

## Prioritized Backlog (Top 10)
1. Build `/reports/porto-mensual` — Datos Generales auto-compute + Eventos + Mapa de Área inline CRUD.
2. Wire real dashboard KPIs (active enrollments, pending balance, payments today, monthly totals).
3. Activity log UI (`/activity`) — read from existing `audit_logs`, director/superadmin only.
4. Corte Diario summary by charge type (aggregate row, UI-only change).
5. Weekly Corte view.
6. Caja: ad-hoc item charges from the panel.
7. Cash session open/close guardrails.
8. Skip scholarship enrollments in monthly charge cron.
9. Dropout reason expansion to Porto's full taxonomy.
10. Role assignment admin utility (or scripted SQL templates).

## Working Rhythm (Recommended)
- Plan: 1 short planning session per week (30-45 min).
- Build: all feature work in `preview`.
- Validate: smoke test after each significant push.
- Release: merge to `main` only from a green preview state.
