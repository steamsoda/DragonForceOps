-- Drop the legacy charges_amount_check constraint (amount > 0).
-- The replacement (charges_amount_nonzero, amount <> 0) was added in 20260302120000.
-- The DO block in that migration failed to drop the old constraint because Postgres
-- stores the definition as "(amount > (0)::numeric)", not "amount > 0".
-- Now that we know the exact constraint name, we drop it explicitly.

alter table public.charges
  drop constraint if exists charges_amount_check;
