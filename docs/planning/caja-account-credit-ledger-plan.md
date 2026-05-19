# Caja Account Credit Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` before implementing this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit, auditable account-credit model for Caja without rewriting historical payments, allocations, refunds, charges, or balance adjustments.

**Architecture:** Credits become their own additive finance layer. Existing `payments`, `payment_allocations`, `charges`, `payment_refunds`, and balance-adjustment behavior remain unchanged unless a future step explicitly writes a new credit entry or applies a credit. Legacy "credit" derived from underallocated payments remains visible as a warning-only state until reviewed.

**Tech Stack:** Supabase/Postgres migrations, RLS, SQL views/RPCs, Next.js server actions, Caja React UI, finance sanity scripts.

---

## Why This Exists

Caja now protects monthly tuition and inscription payments from refund/reassignment. That is correct, but it exposes the next finance problem: an eligible payment can be larger than the destination charge.

Example:

- A parent paid `$1,000.00` for a tournament.
- The tournament is cancelled or the parent changes their mind.
- They want `$700.00` applied to next month's tuition.
- The remaining `$300.00` should not disappear, reopen the original charge, or become invisible drift.

Today, the closest concept is implicit credit: a posted payment whose allocated amount is lower than the payment amount. Caja can sweep that leftover into future pending charges, and the finance diagnostics call it `unapplied-credit`. That has been useful, but it is too implicit for production workflows because staff cannot clearly see, confirm, use, or audit the credit.

## Current State

- `payments.amount` is the cash/payment event.
- `payment_allocations.amount` says how much of a payment was applied to each charge.
- `charges.amount` is the billed item.
- `v_enrollment_balances` is the canonical live balance source.
- `src/lib/queries/enrollment-finance-diagnostics.ts` derives `unappliedPostedAmount` from posted payments where `payment.amount > allocated_amount`.
- `src/server/actions/caja.ts` currently has a FIFO sweep that applies prior unallocated payment amounts to pending charges during payment posting.
- `src/server/actions/payment-allocation-normalization.ts` also allocates remaining posted credit into pending charges.
- Balance adjustments, early-bird discounts, voids, refunds, and correction tools are separate finance mutations and must not be treated as account credit.

## Non-Negotiable Safety Rules

- Do not backfill or mutate legacy payments automatically.
- Do not change historical payment amounts.
- Do not delete or rewrite historical payment allocations except through the existing audited correction/reassignment tools.
- Do not convert implicit legacy credit into explicit credit without a dedicated review/approval workflow.
- Keep monthly tuition and inscriptions non-refundable and non-reassignable.
- Keep explicit credit usage as a non-cash application, not a new payment event.
- Keep cash/card refunds separate from "refund to credit".
- Update canonical SQL sources before page-specific UI if a balance meaning changes.
- Every migration must be additive first: new tables/views/functions, then read-only UI, then write actions.
- Finance sanity checks must pass before production promotion.

## Proposed Data Model

Use a source table plus application table instead of storing only a signed running total. This keeps each credit traceable to the reason it exists and each use traceable to the charge it covered.

### `public.enrollment_credits`

One row per credit source.

Recommended columns:

- `id uuid primary key default gen_random_uuid()`
- `enrollment_id uuid not null references public.enrollments(id) on delete restrict`
- `campus_id uuid not null references public.campuses(id) on delete restrict`
- `source_payment_id uuid null references public.payments(id) on delete restrict`
- `source_charge_id uuid null references public.charges(id) on delete restrict`
- `source_workflow text not null`
- `original_amount numeric(12,2) not null check (original_amount > 0)`
- `currency text not null default 'MXN'`
- `status text not null default 'open'`
- `reason text not null`
- `notes text null`
- `created_by uuid not null references auth.users(id) on delete restrict`
- `created_at timestamptz not null default now()`
- `voided_by uuid null references auth.users(id) on delete restrict`
- `voided_at timestamptz null`
- `void_reason text null`

Allowed `source_workflow` values should start narrow:

- `eligible_payment_remainder`
- `reassignment_remainder`
- `refund_to_credit`
- `manual_admin_credit`
- `legacy_review_conversion`

Allowed `status` values should start narrow:

- `open`
- `fully_used`
- `void`

### `public.enrollment_credit_applications`

One row per time credit is applied.

Recommended columns:

- `id uuid primary key default gen_random_uuid()`
- `credit_id uuid not null references public.enrollment_credits(id) on delete restrict`
- `charge_id uuid not null references public.charges(id) on delete restrict`
- `amount numeric(12,2) not null check (amount > 0)`
- `applied_by uuid not null references auth.users(id) on delete restrict`
- `applied_at timestamptz not null default now()`
- `notes text null`

Hard constraints:

- A credit application must target a charge in the same enrollment.
- Total applied amount cannot exceed the original credit amount.
- Credit cannot be applied after credit is void.
- Credit cannot apply to a void charge.
- Applying credit should be idempotent at the action/RPC boundary; duplicate form submits must not double-apply.

### Views

Add read-only views before write UI:

- `public.v_enrollment_credit_balances`
  - `enrollment_id`
  - `original_credit_total`
  - `applied_credit_total`
  - `available_credit_total`
  - `open_credit_count`

- `public.v_enrollment_credit_events`
  - one timeline-friendly row for credit creation, application, void, and refund-to-credit events

All exposed views must use `WITH (security_invoker = true)` and have explicit RLS-compatible grants.

## Balance Semantics

We should expose three separate numbers instead of hiding them inside one balance:

- `gross_pending_amount`: unpaid charge exposure before credit.
- `available_credit_amount`: explicit credit available to apply.
- `net_amount_due`: `gross_pending_amount - available_credit_amount`, floored at zero.

This avoids staff confusion:

- A player can still have a real pending charge.
- The account can also have credit available.
- Caja can show both and ask staff whether to use the credit.

Do not silently subtract credit everywhere in the first implementation. Start with Caja and finance sanity surfaces, then decide whether `v_enrollment_balances` should expose credit fields directly or whether a companion view is safer.

## Finance Event Semantics

- Creating credit from a payment remainder does not create new revenue.
- Applying credit does not create a new payment row.
- Applying credit should create a credit application row and, if needed for existing balance views, a carefully named non-cash allocation/event path.
- Cash/card refunds remain in `payment_refunds`.
- "Refund to credit" is not a cash/card refund and must be visible separately in reports.
- Corte Diario should not count credit application as cash collected.
- Receipts should show credit application as account-credit usage, not as a new payment method.

## Legacy Cleanup Model

Legacy implicit credits are risky because they already exist as underallocated posted payments. Do not normalize them automatically.

The cleanup path should be:

1. Build a read-only inventory of enrollments with implicit credit.
2. Label them as `Credito legado detectado` in admin/finance sanity surfaces.
3. Add a superadmin-only review screen later.
4. Let a superadmin convert one legacy payment remainder into explicit credit only after reviewing:
   - enrollment
   - payment
   - source amount
   - existing allocations
   - current pending charges
   - finance sanity warnings
5. Record a `legacy_review_conversion` credit entry with notes.
6. Keep the original payment and existing allocations intact.

This keeps old accounts from changing under staff while still giving us a route to clean them up deliberately.

## Product UX

### Caja Account Screen

Add a compact credit panel after read-only views exist:

- `Credito disponible: $X`
- `Usar credito` button when available credit is above zero.
- `Credito legado detectado` warning when implicit credit exists but has not been converted.

### Use Credit Flow

The first write flow should be conservative:

- staff selects one or more pending charges
- system shows available credit, selected pending amount, amount to apply, and remaining credit
- confirmation modal requires a checkbox: `Confirmo aplicar credito a estos cargos`
- submit applies credit server-side with a fresh pending/credit revalidation
- success returns to Caja with updated pending charges and credit balance

### Reassignment Remainder

After the basic use-credit flow is stable, update reassignment:

- allow selected eligible source amount to be assigned to target charges up to their pending capacity
- if source amount exceeds target capacity, create explicit credit for the remainder
- show staff the split before submit:
  - `Aplicado a cargos: $700.00`
  - `Credito disponible creado: $300.00`

## Implementation Phases

### Phase 1: Planning and Inventory

**Files:**

- Create: `docs/planning/caja-account-credit-ledger-plan.md`
- Modify: `docs/roadmap-post-alpha.md`
- Modify: `docs/devlog.md`
- Inspect: `src/lib/queries/enrollment-finance-diagnostics.ts`
- Inspect: `src/server/actions/caja.ts`
- Inspect: `src/server/actions/payment-allocation-normalization.ts`

- [x] **Step 1: Document current implicit-credit behavior**

Record that implicit credit currently means posted payment amount minus allocated amount, and that Caja may sweep it into pending charges.

- [x] **Step 2: Define the additive explicit-credit model**

Document `enrollment_credits`, `enrollment_credit_applications`, companion views, and safety rules.

- [x] **Step 3: Keep legacy cleanup separate**

Document a review-first conversion system, not an automatic backfill.

### Phase 2: Additive Schema and Read-Only Views

**Files:**

- Create: `supabase/migrations/<timestamp>_account_credit_ledger_v1.sql`
- Modify: `src/lib/queries/enrollment-finance-diagnostics.ts`
- Test: add SQL verification notes to the migration or a finance sanity script pass

- [x] **Step 1: Create migration with additive tables**

Use `supabase migration new account_credit_ledger_v1`, then create `enrollment_credits` and `enrollment_credit_applications` with RLS enabled.

- [x] **Step 2: Add RLS policies**

Authenticated users can read credits only when they can access the enrollment/campus through existing finance permissions. Writes should go through RPCs/server actions, not broad table insert/update from the client.

- [x] **Step 3: Add read-only views**

Create `v_enrollment_credit_balances` and `v_enrollment_credit_events` with `security_invoker = true`.

- [x] **Step 4: Verify old balances are unchanged**

Before any write UI exists, confirm that `v_enrollment_balances` results match before/after for a representative sample.

Completed in preview `v1.16.154`: additive tables/views, read-only grants, RLS, trigger validations, and preview rollback smoke test. No app write path or legacy conversion was added.

### Phase 3: Read-Only Caja Display

**Files:**

- Modify: `src/lib/queries/billing.ts`
- Modify: `src/app/caja/page.tsx` or the active Caja account component
- Modify: `src/lib/queries/enrollment-finance-diagnostics.ts`

- [ ] **Step 1: Fetch explicit credit balances**

Load `v_enrollment_credit_balances` alongside existing Caja ledger data.

- [ ] **Step 2: Display explicit credit and legacy warning**

Show explicit available credit separately from legacy implicit credit. Do not add write buttons yet.

- [ ] **Step 3: Verify no Caja mutation path changed**

Run typecheck/build and smoke-test Caja payment posting to confirm behavior is unchanged.

### Phase 4: Apply Explicit Credit

**Files:**

- Create: `supabase/migrations/<timestamp>_apply_account_credit_rpc.sql`
- Modify: `src/server/actions/billing.ts` or a focused credit action module
- Modify: Caja account UI
- Modify: receipts/audit display if needed

- [ ] **Step 1: Add `apply_enrollment_credit_to_charges` RPC**

The RPC must revalidate enrollment access, credit availability, target charge ownership, target pending amount, and idempotency.

- [ ] **Step 2: Add server action**

The server action should call the RPC, then revalidate Caja/account paths.

- [ ] **Step 3: Add the confirmation UI**

Staff must select charges and check a confirmation box before submit.

- [ ] **Step 4: Verify credit application is non-cash**

Confirm Corte Diario and cash reports do not count credit application as collected money.

### Phase 5: Create Credit From Reassignment Remainders

**Files:**

- Modify: `supabase/migrations/<timestamp>_partial_reassignment_credit_remainder.sql`
- Modify: reassignment server action and UI
- Modify: Caja recent payments panel copy

- [ ] **Step 1: Extend allocation-level reassignment**

Allow target capacity below selected source amount only when the remainder is explicitly converted to credit.

- [ ] **Step 2: Add preview math**

Before submit, show applied amount, created credit amount, and original source charge behavior.

- [ ] **Step 3: Verify protected charges remain protected**

Monthly tuition and inscription source allocations must still reject reassignment.

### Phase 6: Legacy Review Tool

**Files:**

- Create: admin route for legacy credit review
- Modify: finance sanity queries
- Create: conversion RPC only after read-only review is trusted

- [ ] **Step 1: List legacy implicit credit accounts**

Use diagnostics to show posted payment remainders without changing them.

- [ ] **Step 2: Add one-account conversion**

Superadmin can convert one reviewed remainder into explicit credit with notes.

- [ ] **Step 3: Keep conversion audit-friendly**

Record source payment, amount, actor, timestamp, and reason.

## Required Verification Before Production

- `npm run typecheck`
- `npm run build`
- `npm run diagnose:finance`
- SQL check: old `v_enrollment_balances` values unchanged after additive schema migration.
- SQL check: explicit credit cannot exceed source amount.
- SQL check: applying credit cannot exceed pending charge amount.
- SQL check: monthly tuition and inscription source payments remain non-refundable and non-reassignable.
- Caja smoke test: normal payment posting unchanged.
- Caja smoke test: explicit credit shows separately from pending charges.
- Caja smoke test: using credit updates pending charges and leaves cash reports unchanged.
- Finance sanity review: legacy implicit credit remains warning-only until manually converted.
