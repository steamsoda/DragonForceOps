# Product Roadmap (Execution)

This complements `docs/phase-1-sdd.md` with a practical delivery plan.

## Current State (as of 2026-02-26)
- Preview auth flow works end-to-end.
- Protected app routes are reachable after login.
- Core billing loop is working in preview:
  - create charge
  - post payment with allocations
  - live ledger totals and pending balances
- Pending payments list is functional with follow-up filters and call links.
- Main risk is operational hardening and feature completeness, not scaffolding.

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

2. **Role System — `front_desk` role**
- Add `front_desk` to `app_roles` table (migration).
- RLS policies: `front_desk` can read all player/enrollment data, post payments, access `/caja`. Cannot access dashboard financial stats or void payments.
- Remove bootstrap env var (`BOOTSTRAP_ADMIN_EMAILS`) after seeding `user_roles` for all active staff.
- Seed roles for Javi (`superadmin`), Scarlett + directors (`director_admin`), front desk staff (`front_desk`).

3. **Dashboard KPIs**
- Wire real metrics for active enrollments, pending balance, payments today, and monthly totals.

4. **Pending Workflow Improvements**
- Add better filtering and sorting for collections/follow-up.
- Add quick actions for calling guardians and opening enrollment ledger.

5. **Cash Session UX**
- Improve open/close session workflow and variance explanation notes.
- Add guardrails when posting cash payments without an open session.

Exit criteria:
- Front desk staff can run a full payment shift from `/caja` without touching any other page.
- Director can see financial summary from dashboard.
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

## Prioritized Backlog (Top 10)
1. Replace report placeholders (`corte diario`, `resumen mensual`) with real queries and totals.
2. Add cash-session guardrails for cash payments (open session required).
3. Add integration tests for payment posting + allocation edge cases.
4. Add report-level assertions and reconciliation checks.
5. Add role assignment admin utility (or scripted SQL templates).
6. Add audit log writes for critical billing mutations.
7. Add performance pass with index review for pending/ledger queries.
8. Add formal smoke test checklist execution per preview deploy.
9. Add release checklist for preview -> main -> production.
10. Start `admin_restricted` role scope definition and enforcement.

## Working Rhythm (Recommended)
- Plan: 1 short planning session per week (30-45 min).
- Build: all feature work in `preview`.
- Validate: smoke test after each significant push.
- Release: merge to `main` only from a green preview state.
