create or replace function public.finance_payment_facts(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_campus_id uuid default null
)
returns table (
  payment_id uuid,
  enrollment_id uuid,
  operator_campus_id uuid,
  paid_at timestamptz,
  paid_date_local date,
  paid_month text,
  method text,
  amount numeric,
  is_360player boolean,
  is_historical_catchup_contry boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as payment_id,
    p.enrollment_id,
    p.operator_campus_id,
    p.paid_at,
    timezone('America/Monterrey', p.paid_at)::date as paid_date_local,
    to_char(timezone('America/Monterrey', p.paid_at), 'YYYY-MM') as paid_month,
    p.method,
    p.amount,
    (p.method = 'stripe_360player') as is_360player,
    (p.external_source in ('historical_catchup_contry', 'historical_catchup_admin')) as is_historical_catchup_contry
  from public.payments p
  where p.status = 'posted'
    and p.operator_campus_id in (select campus_id from public.current_user_allowed_campuses())
    and (p_campus_id is null or p.operator_campus_id = p_campus_id)
    and (p_from is null or p.paid_at >= p_from)
    and (p_to is null or p.paid_at < p_to)
    and (p_campus_id is null or public.can_access_campus(p_campus_id));
$$;

grant execute on function public.finance_payment_facts(timestamptz, timestamptz, uuid) to authenticated;
