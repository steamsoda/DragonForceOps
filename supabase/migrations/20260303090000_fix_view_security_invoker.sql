-- Fix v_enrollment_balances: add security_invoker = true so the view
-- respects RLS policies of the querying user instead of running as the
-- view owner (which bypasses RLS on the underlying charges/payments tables).
--
-- Requires Postgres 15+, which Supabase supports.

create or replace view public.v_enrollment_balances
  with (security_invoker = true)
as
with charge_totals as (
  select
    c.enrollment_id,
    coalesce(sum(c.amount) filter (where c.status <> 'void'), 0)::numeric(12,2) as total_charges
  from public.charges c
  group by c.enrollment_id
),
payment_totals as (
  select
    p.enrollment_id,
    coalesce(sum(p.amount) filter (where p.status = 'posted'), 0)::numeric(12,2) as total_payments
  from public.payments p
  group by p.enrollment_id
)
select
  e.id as enrollment_id,
  coalesce(ct.total_charges, 0)::numeric(12,2) as total_charges,
  coalesce(pt.total_payments, 0)::numeric(12,2) as total_payments,
  (coalesce(ct.total_charges, 0) - coalesce(pt.total_payments, 0))::numeric(12,2) as balance
from public.enrollments e
left join charge_totals ct on ct.enrollment_id = e.id
left join payment_totals pt on pt.enrollment_id = e.id;
