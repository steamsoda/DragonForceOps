-- Charge-level cash refunds for eligible paid products.
--
-- The original payment and receipt remain immutable. Only allocations for the
-- selected charge are released, and their payment-funded portion is recorded
-- as a cash refund so it can never reappear as implicit account credit.

create table if not exists public.charge_cash_refunds (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null unique references public.charges(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  primary_payment_id uuid not null references public.payments(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  reopened_credit_amount numeric(12,2) not null default 0 check (reopened_credit_amount >= 0),
  currency text not null default 'MXN',
  refund_method public.payment_method not null default 'cash' check (refund_method = 'cash'),
  refunded_at timestamptz not null,
  operator_campus_id uuid not null references public.campuses(id) on delete restrict,
  cash_session_id uuid not null references public.cash_sessions(id) on delete restrict,
  reason text not null,
  notes text null,
  charge_breakdown jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.charge_cash_refund_sources (
  refund_id uuid not null references public.charge_cash_refunds(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  primary key (refund_id, payment_id)
);

create index if not exists idx_charge_cash_refunds_enrollment
  on public.charge_cash_refunds (enrollment_id, refunded_at desc);
create index if not exists idx_charge_cash_refunds_operator_date
  on public.charge_cash_refunds (operator_campus_id, refunded_at desc);
create index if not exists idx_charge_cash_refund_sources_payment
  on public.charge_cash_refund_sources (payment_id);

alter table public.cash_session_entries
  add column if not exists charge_cash_refund_id uuid null
    references public.charge_cash_refunds(id) on delete set null;

create unique index if not exists idx_cash_session_entries_charge_cash_refund
  on public.cash_session_entries (charge_cash_refund_id)
  where charge_cash_refund_id is not null;

alter table public.charge_cash_refunds enable row level security;
alter table public.charge_cash_refund_sources enable row level security;

drop policy if exists charge_cash_refunds_read on public.charge_cash_refunds;
create policy charge_cash_refunds_read on public.charge_cash_refunds
for select to authenticated
using (
  public.current_user_can_access_enrollment(enrollment_id)
  and public.can_access_campus(operator_campus_id)
);

drop policy if exists charge_cash_refund_sources_read on public.charge_cash_refund_sources;
create policy charge_cash_refund_sources_read on public.charge_cash_refund_sources
for select to authenticated
using (
  exists (
    select 1
    from public.charge_cash_refunds ccr
    where ccr.id = charge_cash_refund_sources.refund_id
      and public.current_user_can_access_enrollment(ccr.enrollment_id)
      and public.can_access_campus(ccr.operator_campus_id)
  )
);

revoke all on table public.charge_cash_refunds from public, anon, authenticated;
revoke all on table public.charge_cash_refund_sources from public, anon, authenticated;
grant select on table public.charge_cash_refunds to authenticated;
grant select on table public.charge_cash_refund_sources to authenticated;
grant all on table public.charge_cash_refunds to service_role;
grant all on table public.charge_cash_refund_sources to service_role;

create or replace function public.record_charge_cash_refund(
  p_enrollment_id uuid,
  p_charge_id uuid,
  p_operator_campus_id uuid,
  p_actor_id uuid,
  p_refunded_at timestamptz,
  p_reason text,
  p_notes text default null
)
returns table(
  refund_id uuid,
  cash_refund_amount numeric,
  reopened_credit_amount numeric,
  auto_applied_credit_amount numeric,
  remaining_credit_amount numeric,
  cash_session_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge record;
  v_enrollment public.enrollments%rowtype;
  v_session_id uuid;
  v_refund_id uuid;
  v_primary_payment_id uuid;
  v_payment_total numeric(12,2) := 0;
  v_credit_total numeric(12,2) := 0;
  v_reopened_credit_ids uuid[] := array[]::uuid[];
  v_credit_application record;
  v_auto_result record;
  v_breakdown jsonb;
begin
  if p_enrollment_id is null or p_charge_id is null or p_operator_campus_id is null
     or p_actor_id is null or p_refunded_at is null then
    raise exception 'invalid_form';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'refund_reason_required';
  end if;

  select *
  into v_enrollment
  from public.enrollments e
  where e.id = p_enrollment_id
  for update;
  if not found then raise exception 'enrollment_not_found'; end if;

  select c.*, ct.code as charge_type_code, ct.name as charge_type_name
  into v_charge
  from public.charges c
  join public.charge_types ct on ct.id = c.charge_type_id
  where c.id = p_charge_id
    and c.enrollment_id = p_enrollment_id
  for update of c;
  if not found then raise exception 'charge_not_found'; end if;
  if v_charge.status <> 'pending' then raise exception 'charge_not_pending'; end if;
  if v_charge.charge_type_code in ('monthly_tuition', 'inscription') then
    raise exception 'protected_paid_charge';
  end if;
  if exists (select 1 from public.charge_cash_refunds where charge_id = p_charge_id) then
    raise exception 'charge_already_cash_refunded';
  end if;

  select cs.id
  into v_session_id
  from public.cash_sessions cs
  where cs.campus_id = p_operator_campus_id
    and cs.status = 'open'
  order by cs.opened_at desc
  limit 1
  for update;
  if v_session_id is null then raise exception 'cash_session_required'; end if;

  perform 1
  from public.payment_allocations pa
  join public.payments p on p.id = pa.payment_id
  where pa.charge_id = p_charge_id
  order by pa.created_at, pa.id
  for update of pa, p;

  if exists (
    select 1
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.charge_id = p_charge_id
      and p.status <> 'posted'
  ) then
    raise exception 'payment_not_posted';
  end if;
  if exists (
    select 1
    from public.payment_allocations pa
    join public.payment_refunds pr on pr.payment_id = pa.payment_id
    where pa.charge_id = p_charge_id
  ) then
    raise exception 'source_payment_already_refunded';
  end if;

  perform 1
  from public.enrollment_credit_applications eca
  join public.enrollment_credits ec on ec.id = eca.credit_id
  where eca.charge_id = p_charge_id
  order by eca.applied_at, eca.id
  for update of eca, ec;

  select
    coalesce(sum(pa.amount), 0)::numeric(12,2),
    (array_agg(pa.payment_id order by pa.created_at, pa.id))[1]
  into v_payment_total, v_primary_payment_id
  from public.payment_allocations pa
  where pa.charge_id = p_charge_id;

  select coalesce(sum(eca.amount), 0)::numeric(12,2)
  into v_credit_total
  from public.enrollment_credit_applications eca
  where eca.charge_id = p_charge_id;

  if v_payment_total <= 0.009 then raise exception 'cash_refund_requires_payment'; end if;
  if abs((v_payment_total + v_credit_total) - v_charge.amount) > 0.01 then
    raise exception 'charge_not_fully_paid';
  end if;

  v_breakdown := jsonb_build_array(jsonb_build_object(
    'chargeId', v_charge.id,
    'description', v_charge.description,
    'chargeTypeCode', v_charge.charge_type_code,
    'chargeTypeName', v_charge.charge_type_name,
    'productId', v_charge.product_id,
    'amount', v_payment_total,
    'originalChargeAmount', v_charge.amount
  ));

  insert into public.charge_cash_refunds (
    charge_id, enrollment_id, primary_payment_id, amount,
    reopened_credit_amount, currency, refunded_at, operator_campus_id,
    cash_session_id, reason, notes, charge_breakdown, created_by
  ) values (
    p_charge_id, p_enrollment_id, v_primary_payment_id, v_payment_total,
    v_credit_total, v_charge.currency, p_refunded_at, p_operator_campus_id,
    v_session_id, btrim(p_reason), nullif(btrim(coalesce(p_notes, '')), ''),
    v_breakdown, p_actor_id
  )
  returning id into v_refund_id;

  insert into public.charge_cash_refund_sources (refund_id, payment_id, amount)
  select v_refund_id, pa.payment_id, sum(pa.amount)::numeric(12,2)
  from public.payment_allocations pa
  where pa.charge_id = p_charge_id
  group by pa.payment_id;

  for v_credit_application in
    select eca.credit_id, sum(eca.amount)::numeric(12,2) as amount
    from public.enrollment_credit_applications eca
    where eca.charge_id = p_charge_id
    group by eca.credit_id
  loop
    v_reopened_credit_ids := array_append(v_reopened_credit_ids, v_credit_application.credit_id);
  end loop;

  delete from public.enrollment_credit_applications where charge_id = p_charge_id;

  update public.enrollment_credits ec
  set status = case
    when ec.status = 'void' then 'void'
    when coalesce((select sum(eca.amount) from public.enrollment_credit_applications eca where eca.credit_id = ec.id), 0)
         + 0.009 >= ec.original_amount then 'fully_used'
    else 'open'
  end
  where ec.id = any(coalesce(v_reopened_credit_ids, array[]::uuid[]));

  delete from public.payment_allocations where charge_id = p_charge_id;
  update public.charges set status = 'void', updated_at = now() where id = p_charge_id;

  insert into public.cash_session_entries (
    cash_session_id, payment_id, charge_cash_refund_id, entry_type,
    amount, notes, created_by
  ) values (
    v_session_id, v_primary_payment_id, v_refund_id, 'manual_out',
    -v_payment_total,
    'Reembolso en efectivo: ' || v_charge.description || '. ' || btrim(p_reason),
    p_actor_id
  );

  select * into v_auto_result
  from public.auto_apply_enrollment_credit_fifo(
    p_enrollment_id,
    p_actor_id,
    gen_random_uuid(),
    'Credito reabierto al reembolsar un cargo y aplicado automaticamente por antiguedad.'
  );

  refund_id := v_refund_id;
  cash_refund_amount := v_payment_total;
  reopened_credit_amount := v_credit_total;
  auto_applied_credit_amount := coalesce(v_auto_result.applied_amount, 0);
  remaining_credit_amount := coalesce(v_auto_result.remaining_credit_amount, 0);
  cash_session_id := v_session_id;
  return next;
end;
$$;

revoke execute on function public.record_charge_cash_refund(uuid, uuid, uuid, uuid, timestamptz, text, text) from public;
revoke execute on function public.record_charge_cash_refund(uuid, uuid, uuid, uuid, timestamptz, text, text) from anon;
revoke execute on function public.record_charge_cash_refund(uuid, uuid, uuid, uuid, timestamptz, text, text) from authenticated;
grant execute on function public.record_charge_cash_refund(uuid, uuid, uuid, uuid, timestamptz, text, text) to service_role;

create or replace view public.v_enrollment_balances
  with (security_invoker = true)
as
with charge_totals as (
  select c.enrollment_id,
    coalesce(sum(c.amount) filter (where c.status <> 'void'), 0)::numeric(12,2) as total_charges
  from public.charges c
  group by c.enrollment_id
),
payment_totals as (
  select p.enrollment_id,
    (
      coalesce(sum(p.amount) filter (where p.status = 'posted'), 0)
      - coalesce(sum(pr.amount), 0)
      - coalesce(sum(ccrs.refunded_amount), 0)
    )::numeric(12,2) as total_payments
  from public.payments p
  left join public.payment_refunds pr on pr.payment_id = p.id
  left join lateral (
    select sum(s.amount)::numeric(12,2) as refunded_amount
    from public.charge_cash_refund_sources s
    where s.payment_id = p.id
  ) ccrs on true
  group by p.enrollment_id
)
select e.id as enrollment_id,
  coalesce(ct.total_charges, 0)::numeric(12,2) as total_charges,
  coalesce(pt.total_payments, 0)::numeric(12,2) as total_payments,
  (coalesce(ct.total_charges, 0) - coalesce(pt.total_payments, 0))::numeric(12,2) as balance
from public.enrollments e
left join charge_totals ct on ct.enrollment_id = e.id
left join payment_totals pt on pt.enrollment_id = e.id;

drop function if exists public.list_pending_enrollments_full(uuid);
create function public.list_pending_enrollments_full(p_campus_id uuid default null)
returns table(
  enrollment_id uuid, player_id uuid, campus_id uuid, player_first_name text,
  player_last_name text, birth_date date, campus_name text, campus_code text,
  phone_primary text, balance numeric, team_id uuid, team_name text,
  earliest_due_date date, follow_up_status text, follow_up_at timestamptz,
  follow_up_note text, promise_date date
)
language sql stable security definer set search_path = public
as $$
  with earliest_due as (
    select ch.enrollment_id,
      min(ch.due_date) filter (where ch.status <> 'void' and ch.due_date is not null) as earliest_due_date
    from public.charges ch group by ch.enrollment_id
  )
  select e.id, e.player_id, e.campus_id, p.first_name, p.last_name, p.birth_date,
    c.name, c.code, g.phone_primary, b.balance, t.id, t.name, ed.earliest_due_date,
    e.follow_up_status, e.follow_up_at, e.follow_up_note, e.promise_date
  from public.enrollments e
  join public.players p on p.id = e.player_id
  join public.campuses c on c.id = e.campus_id
  join public.v_enrollment_balances b on b.enrollment_id = e.id
  left join earliest_due ed on ed.enrollment_id = e.id
  left join lateral (
    select g2.phone_primary from public.player_guardians pg
    join public.guardians g2 on g2.id = pg.guardian_id
    where pg.player_id = e.player_id and pg.is_primary = true limit 1
  ) g on true
  left join lateral (
    select ta.team_id from public.team_assignments ta
    where ta.enrollment_id = e.id and ta.end_date is null and ta.is_primary = true limit 1
  ) ta on true
  left join public.teams t on t.id = ta.team_id
  where e.status = 'active'
    and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
    and (p_campus_id is null or e.campus_id = p_campus_id)
    and b.balance > 0
  order by p.birth_date, p.first_name, p.last_name;
$$;
revoke execute on function public.list_pending_enrollments_full(uuid) from public, anon;
grant execute on function public.list_pending_enrollments_full(uuid) to authenticated;

create or replace function public.finance_refund_facts(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_campus_id uuid default null
)
returns table(
  refund_id uuid, payment_id uuid, enrollment_id uuid, operator_campus_id uuid,
  refunded_at timestamptz, refunded_date_local date, refunded_month text,
  refund_method text, amount numeric, charge_breakdown jsonb
)
language sql stable security definer set search_path = public
as $$
  select pr.id, pr.payment_id, pr.enrollment_id, pr.operator_campus_id, pr.refunded_at,
    timezone('America/Monterrey', pr.refunded_at)::date,
    to_char(timezone('America/Monterrey', pr.refunded_at), 'YYYY-MM'),
    pr.refund_method::text, pr.amount, pr.charge_breakdown
  from public.payment_refunds pr
  where pr.operator_campus_id in (select campus_id from public.current_user_allowed_campuses())
    and (p_campus_id is null or pr.operator_campus_id = p_campus_id)
    and (p_from is null or pr.refunded_at >= p_from)
    and (p_to is null or pr.refunded_at < p_to)
  union all
  select ccr.id, ccr.primary_payment_id, ccr.enrollment_id, ccr.operator_campus_id, ccr.refunded_at,
    timezone('America/Monterrey', ccr.refunded_at)::date,
    to_char(timezone('America/Monterrey', ccr.refunded_at), 'YYYY-MM'),
    'cash', ccr.amount, ccr.charge_breakdown
  from public.charge_cash_refunds ccr
  where ccr.operator_campus_id in (select campus_id from public.current_user_allowed_campuses())
    and (p_campus_id is null or ccr.operator_campus_id = p_campus_id)
    and (p_from is null or ccr.refunded_at >= p_from)
    and (p_to is null or ccr.refunded_at < p_to);
$$;
revoke execute on function public.finance_refund_facts(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.finance_refund_facts(timestamptz, timestamptz, uuid) to authenticated;
