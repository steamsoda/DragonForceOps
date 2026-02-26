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

## Phase 1B: Operational MVP Completion (next 1 to 2 weeks)
Goal: complete the minimum operational feature set for steady use.

1. Dashboard KPIs
- Wire real metrics for active enrollments, pending balance, payments today, and monthly totals.

2. Pending Workflow Improvements
- Add better filtering and sorting for collections/follow-up.
- Add quick actions for calling guardians and opening enrollment ledger.

3. Cash Session UX
- Improve open/close session workflow and variance explanation notes.
- Add guardrails when posting cash payments without an open session.

Exit criteria:
- Staff can run a full day operation without manual SQL/database intervention.

## Phase 2: Roles and Integrations
Goal: broader operational support and integrations.

1. Role Expansion
- Implement `admin_restricted` permissions matrix.
- Add campus-scoped access rules where applicable.

2. External Payments
- Define ingestion path for 360Player/Stripe events.
- Add reconciliation queue for unmatched events.

3. Export and Ops Tooling
- CSV/PDF exports for daily and monthly reports.
- Basic admin diagnostics page for auth/env/role checks.

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
