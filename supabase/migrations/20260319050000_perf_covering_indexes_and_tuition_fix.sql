-- ── 1. Covering indexes for v_enrollment_balances ────────────────────────────
--
-- The balance view runs two correlated subqueries per enrollment:
--   SUM(charges.amount) WHERE enrollment_id = X AND status != 'void'
--   SUM(payments.amount) WHERE enrollment_id = X AND status = 'posted'
--
-- The existing indexes cover the WHERE clause but not the SUM column, forcing
-- a heap fetch for every matching row. Adding INCLUDE (amount) enables
-- index-only scans — the DB never touches the table heap for balance queries.
--
-- These also help the pending enrollments RPC CTE which does the same aggregation
-- across all active enrollments.

CREATE INDEX IF NOT EXISTS idx_charges_enrollment_balance
  ON public.charges (enrollment_id, status)
  INCLUDE (amount)
  WHERE status <> 'void';

CREATE INDEX IF NOT EXISTS idx_payments_enrollment_balance
  ON public.payments (enrollment_id, status)
  INCLUDE (amount)
  WHERE status = 'posted';

-- ── 2. Partial index: active enrollments only ────────────────────────────────
-- Speeds up the players list count query and any WHERE status = 'active' filter.

CREATE INDEX IF NOT EXISTS idx_enrollments_active
  ON public.enrollments (campus_id, player_id)
  WHERE status = 'active';

-- ── 3. One-time data fix: correct seeded tuition charges from $600 → $750 ────
--
-- The production seed script hardcoded TUITION_AMOUNT = 600.00 for all monthly
-- tuition charges. The correct system rule is: monthly_tuition charges are
-- created at the REGULAR rate ($750). The early-bird discount (-$150) is a
-- separate credit line applied only at payment time on days 1–10.
--
-- Paid charges balanced out ($600 charge / $600 payment = $0) so we leave those
-- alone. We only correct PENDING (unpaid) charges — but NOT the first month of
-- each enrollment, which is legitimately $600 flat (enrollment creation rule).
--
-- "First month" = the minimum period_month per enrollment.

WITH first_months AS (
  SELECT
    c.enrollment_id,
    MIN(c.period_month) AS first_period
  FROM public.charges c
  JOIN public.charge_types ct ON ct.id = c.charge_type_id AND ct.code = 'monthly_tuition'
  WHERE c.status <> 'void'
  GROUP BY c.enrollment_id
)
UPDATE public.charges c
SET    amount = 750.00
FROM   public.charge_types ct,
       first_months fm
WHERE  c.charge_type_id  = ct.id
  AND  ct.code           = 'monthly_tuition'
  AND  c.enrollment_id   = fm.enrollment_id
  AND  c.status          = 'pending'
  AND  c.amount          = 600.00
  AND  c.period_month   <> fm.first_period;
