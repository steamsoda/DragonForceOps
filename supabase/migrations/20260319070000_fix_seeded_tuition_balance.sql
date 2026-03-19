-- Fix: revert monthly_tuition charges back to $600 where a historical import
-- payment of $600 was already allocated against them.
--
-- The 20260319050000 migration bumped all non-first-month monthly_tuition charges
-- from $600 → $750 (correct for unpaid charges). But charges in the DB stay
-- status = 'pending' regardless of whether a payment is allocated — balance is
-- computed dynamically. So the bump also hit charges that already had seeded
-- $600 payments, creating a false $150 balance ($750 charge − $600 payment) on
-- every historically-paid month.
--
-- This migration reverts only those specific charges:
--   • type  = monthly_tuition
--   • amount = 750.00  (was bumped by the previous migration)
--   • status = 'pending'
--   • has a payment_allocation from an 'import' payment of ≥ $600
--
-- Genuinely unpaid $750 charges (no import payment allocated) are left alone.

UPDATE public.charges c
SET    amount = 600.00
FROM   public.charge_types ct
WHERE  c.charge_type_id = ct.id
  AND  ct.code   = 'monthly_tuition'
  AND  c.status  = 'pending'
  AND  c.amount  = 750.00
  AND  EXISTS (
         SELECT 1
         FROM   public.payment_allocations pa
         JOIN   public.payments p ON p.id = pa.payment_id
         WHERE  pa.charge_id      = c.id
           AND  p.external_source = 'import'
           AND  pa.amount         >= 600.00
       );
