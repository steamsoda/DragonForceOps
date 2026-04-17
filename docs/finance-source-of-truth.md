# Finance Source of Truth

Purpose: keep money surfaces aligned as the app grows, so one workflow change does not silently create new balance math somewhere else.

## Canonical Layers

### 1. Live balance by enrollment

Canonical source:

- `public.v_enrollment_balances`

Use this for:

- player profile live balance
- `Jugadores` debt state
- `Pendientes`
- archive / baja debt views
- any future “who owes money right now?” surface

Rule:

- no page or RPC should recompute live balance from raw `charges - payments` unless it is deliberately reproducing the exact same semantics as `v_enrollment_balances`, including refunds and future finance mutations

### 2. Finance event reporting

Canonical sources:

- `public.finance_payment_facts(...)`
- `public.finance_refund_facts(...)`
- `public.finance_charge_facts(...)`

Use these for:

- dashboard KPIs
- Corte Diario
- Corte Semanal
- Resumen Mensual
- future finance reporting

Rule:

- reports should be built from finance facts, not from ad hoc page-side aggregation

## Change Protocol

When a new finance behavior is added, answer these questions first:

1. Does it change live balance semantics?
2. Does it change finance event semantics?
3. Which canonical layer must change first?

Examples:

- refund
  - updates both live balance semantics and finance facts
- payment reassignment
  - updates allocation semantics, but should preserve payment event semantics
- future writeoff / credit / partial refund
  - must be designed at the canonical SQL layer first

Implementation rule:

- update the shared SQL layer first
- then update consumers
- do not patch individual pages first and hope they stay aligned later

## Reconciliation Tools

### Hidden sanity page

Route:

- `/admin/finance-sanity`

Access:

- superadmin only
- intentionally not in the main nav

Purpose:

- compare canonical live balance vs `Pendientes`
- compare canonical live balance vs dashboard pending KPI
- list enrollment-level mismatches if they exist

### Enrollment-level diagnostic panel

Surfaces:

- active account block on `/players/[id]`
- dedicated account page on `/enrollments/[id]/charges`

Access:

- superadmin only
- read-only

Purpose:

- explain one enrollment’s canonical balance and anomaly flags without changing anything
- identify likely root causes such as unapplied credit, duplicate monthly tuition rows, suspicious refund/allocation state, and other correction-relevant account issues before using future repair tools

### SQL verification functions

- `public.get_finance_reconciliation_summary(...)`
- `public.list_finance_reconciliation_drift(...)`

Purpose:

- make drift measurable in SQL instead of relying on visual intuition

## Development Rules

- no new finance page should invent its own balance math if a canonical source already exists
- if a new RPC exposes balance, it should either read from `v_enrollment_balances` or be tested against it
- if a new report exposes totals, it should either read from `finance_*_facts` or be tested against them
- normal live payment posting belongs in `Caja`, not in page-local player/account forms
- `Regularización Contry` is the explicit exception for historical payment capture
- competition signup state belongs to the sports layer, but its financial source of truth is still the linked competition charge becoming fully paid
- when drift is found, fix the shared source first, then the consumers

## Recurring Verification

Run this after meaningful finance changes:

1. Open `/admin/finance-sanity`
2. Check canonical vs `Pendientes`
3. Check canonical vs dashboard KPI
4. Confirm zero enrollment-level mismatches
5. Spot-check one refunded enrollment and one reassigned payment enrollment

This is the guardrail against “numbers looked fine until we noticed weeks later.”
