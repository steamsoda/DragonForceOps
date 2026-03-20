-- Fix: bump January 2026 tuition charges from $600 → $750 for enrollments
-- that started before January 2026.
--
-- Migration 20260319050000 detected "first month" as MIN(period_month) per
-- enrollment in the charges table. But the seed only created charges from
-- January 2026 onward — it did not backfill months before that. So for a
-- student enrolled in Oct 2025, the earliest charge is January 2026, and
-- the migration incorrectly treated January as their "first month" ($600 flat).
--
-- Correct rule: first month = the calendar month of enrollment start_date.
-- For any enrollment that started before 2026-01-01, January 2026 is a
-- continuation month and must be $750 (regular rate).
--
-- We exclude charges that already have an import payment allocated — those
-- months are settled at $0 balance and do not need touching.

UPDATE public.charges c
SET    amount = 750.00
FROM   public.charge_types ct
JOIN   public.enrollments e ON e.id = c.enrollment_id
WHERE  c.charge_type_id  = ct.id
  AND  ct.code           = 'monthly_tuition'
  AND  c.status          = 'pending'
  AND  c.amount          = 600.00
  AND  c.period_month    = '2026-01-01'
  AND  DATE_TRUNC('month', e.start_date) < DATE '2026-01-01'
  AND  NOT EXISTS (
         SELECT 1
         FROM   public.payment_allocations pa
         JOIN   public.payments p ON p.id = pa.payment_id
         WHERE  pa.charge_id      = c.id
           AND  p.external_source = 'import'
       );
