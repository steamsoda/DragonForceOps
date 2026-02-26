# Devlog

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
