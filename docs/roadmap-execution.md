# Product Roadmap (Execution)

This complements `docs/phase-1-sdd.md` with a practical delivery plan.

## Current State (as of 2026-02-26)
- Preview auth flow works end-to-end.
- Protected app routes are reachable after login.
- Core pages exist for players, enrollments, charges, pending, and reports.
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
- End-to-end flow works: player -> enrollment -> charge -> payment -> reports.
- Smoke test checklist is consistently green.

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
1. Replace placeholder dashboard with real KPIs.
2. Add a formal smoke test checklist doc and run it per preview deploy.
3. Harden auth callback error handling and user-facing messages.
4. Add integration tests for payment posting + allocations transaction.
5. Improve pending page filters and performance.
6. Add report-level assertions for totals.
7. Add role assignment admin utility (or scripted SQL templates).
8. Add cash-session guardrails and clearer variance flow.
9. Add audit log visibility for critical financial mutations.
10. Add release checklist for preview -> main -> production.

## Working Rhythm (Recommended)
- Plan: 1 short planning session per week (30-45 min).
- Build: all feature work in `preview`.
- Validate: smoke test after each significant push.
- Release: merge to `main` only from a green preview state.

