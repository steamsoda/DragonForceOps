-- Issue 56: refunds + payment reassignment workflow v1..

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'MXN',
  refund_method public.payment_method not null,
  refunded_at timestamptz not null,
  operator_campus_id uuid not null references public.campuses(id) on delete restrict,
  reason text not null,
  notes text null,
  charge_breakdown jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (payment_id)
);

create index if not exists idx_payment_refunds_refunded_at on public.payment_refunds (refunded_at desc);
create index if not exists idx_payment_refunds_operator_campus_refunded_at on public.payment_refunds (operator_campus_id, refunded_at desc);
create index if not exists idx_payment_refunds_enrollment on public.payment_refunds (enrollment_id);

alter table public.payment_refunds enable row level security;

drop policy if exists director_admin_all_payment_refunds on public.payment_refunds;
create policy director_admin_all_payment_refunds on public.payment_refunds
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists front_desk_read_payment_refunds on public.payment_refunds;
create policy front_desk_read_payment_refunds on public.payment_refunds
  for select to authenticated
  using (
    public.is_front_desk()
    and public.current_user_can_access_payment(payment_id)
  );

drop policy if exists front_desk_insert_payment_refunds on public.payment_refunds;
create policy front_desk_insert_payment_refunds on public.payment_refunds
  for insert to authenticated
  with check (
    public.is_front_desk()
    and public.current_user_can_access_payment(payment_id)
    and public.current_user_can_access_enrollment(enrollment_id)
    and public.can_access_campus(operator_campus_id)
  );

create or replace view public.v_enrollment_balances as
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
    (
      coalesce(sum(p.amount) filter (where p.status = 'posted'), 0)
      - coalesce(sum(pr.amount), 0)
    )::numeric(12,2) as total_payments
  from public.payments p
  left join public.payment_refunds pr on pr.payment_id = p.id
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

create or replace function public.finance_refund_facts(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_campus_id uuid default null
)
returns table (
  refund_id uuid,
  payment_id uuid,
  enrollment_id uuid,
  operator_campus_id uuid,
  refunded_at timestamptz,
  refunded_date_local date,
  refunded_month text,
  refund_method text,
  amount numeric,
  charge_breakdown jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pr.id as refund_id,
    pr.payment_id,
    pr.enrollment_id,
    pr.operator_campus_id,
    pr.refunded_at,
    timezone('America/Monterrey', pr.refunded_at)::date as refunded_date_local,
    to_char(timezone('America/Monterrey', pr.refunded_at), 'YYYY-MM') as refunded_month,
    pr.refund_method::text as refund_method,
    pr.amount,
    pr.charge_breakdown
  from public.payment_refunds pr
  where pr.operator_campus_id in (select campus_id from public.current_user_allowed_campuses())
    and (p_campus_id is null or pr.operator_campus_id = p_campus_id)
    and (p_from is null or pr.refunded_at >= p_from)
    and (p_to is null or pr.refunded_at < p_to)
    and (p_campus_id is null or public.can_access_campus(p_campus_id));
$$;

grant execute on function public.finance_refund_facts(timestamptz, timestamptz, uuid) to authenticated;

create or replace function public.record_payment_refund(
  p_payment_id uuid,
  p_refund_method public.payment_method,
  p_refunded_at timestamptz,
  p_reason text,
  p_notes text default null
)
returns table (
  ok boolean,
  error_code text,
  refund_id uuid,
  payment_id uuid,
  enrollment_id uuid,
  amount numeric,
  operator_campus_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_refund_id uuid;
  v_charge_breakdown jsonb := '[]'::jsonb;
  v_allocated_total numeric(12,2);
begin
  if auth.uid() is null then
    return query select false, 'unauthenticated', null::uuid, null::uuid, null::uuid, null::numeric, null::uuid;
    return;
  end if;

  select *
  into v_payment
  from public.payments
  where id = p_payment_id;

  if not found then
    return query select false, 'payment_not_found', null::uuid, null::uuid, null::uuid, null::numeric, null::uuid;
    return;
  end if;

  if not public.current_user_can_access_payment(p_payment_id) then
    return query select false, 'unauthorized', null::uuid, null::uuid, null::uuid, null::numeric, null::uuid;
    return;
  end if;

  if v_payment.status <> 'posted' then
    return query select false, 'payment_not_posted', null::uuid, null::uuid, null::uuid, null::numeric, null::uuid;
    return;
  end if;

  if exists (select 1 from public.payment_refunds where payment_id = p_payment_id) then
    return query select false, 'payment_already_refunded', null::uuid, null::uuid, null::uuid, null::numeric, null::uuid;
    return;
  end if;

  if coalesce(trim(p_reason), '') = '' then
    return query select false, 'refund_reason_required', null::uuid, null::uuid, null::uuid, null::numeric, null::uuid;
    return;
  end if;

  if p_refunded_at is null then
    return query select false, 'refunded_at_required', null::uuid, null::uuid, null::uuid, null::numeric, null::uuid;
    return;
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'chargeId', c.id,
          'description', c.description,
          'chargeTypeCode', ct.code,
          'chargeTypeName', ct.name,
          'productId', c.product_id,
          'amount', pa.amount
        )
        order by c.created_at, c.id
      ),
      '[]'::jsonb
    ),
    coalesce(sum(pa.amount), 0)::numeric(12,2)
  into v_charge_breakdown, v_allocated_total
  from public.payment_allocations pa
  join public.charges c on c.id = pa.charge_id
  left join public.charge_types ct on ct.id = c.charge_type_id
  where pa.payment_id = p_payment_id;

  if v_allocated_total <= 0 then
    return query select false, 'payment_has_no_allocations', null::uuid, null::uuid, null::uuid, null::numeric, null::uuid;
    return;
  end if;

  insert into public.payment_refunds (
    payment_id,
    enrollment_id,
    amount,
    currency,
    refund_method,
    refunded_at,
    operator_campus_id,
    reason,
    notes,
    charge_breakdown,
    created_by
  )
  values (
    v_payment.id,
    v_payment.enrollment_id,
    v_payment.amount,
    v_payment.currency,
    p_refund_method,
    p_refunded_at,
    v_payment.operator_campus_id,
    trim(p_reason),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_charge_breakdown,
    auth.uid()
  )
  returning id into v_refund_id;

  delete from public.payment_allocations
  where payment_id = p_payment_id;

  return query
  select
    true,
    null::text,
    v_refund_id,
    v_payment.id,
    v_payment.enrollment_id,
    v_payment.amount,
    v_payment.operator_campus_id;
end;
$$;

grant execute on function public.record_payment_refund(uuid, public.payment_method, timestamptz, text, text) to authenticated;

create or replace function public.reassign_payment_to_charges(
  p_payment_id uuid,
  p_target_charge_ids uuid[]
)
returns table (
  ok boolean,
  error_code text,
  payment_id uuid,
  enrollment_id uuid,
  moved_amount numeric,
  source_charge_ids uuid[],
  destination_charge_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_payment_amount numeric(12,2);
  v_target_ids uuid[];
  v_source_ids uuid[];
  v_source_count int;
  v_source_total numeric(12,2);
  v_target_capacity numeric(12,2);
begin
  if auth.uid() is null then
    return query select false, 'unauthenticated', null::uuid, null::uuid, null::numeric, null::uuid[], null::uuid[];
    return;
  end if;

  select *
  into v_payment
  from public.payments
  where id = p_payment_id;

  if not found then
    return query select false, 'payment_not_found', null::uuid, null::uuid, null::numeric, null::uuid[], null::uuid[];
    return;
  end if;

  if not public.current_user_can_access_payment(p_payment_id) then
    return query select false, 'unauthorized', null::uuid, null::uuid, null::numeric, null::uuid[], null::uuid[];
    return;
  end if;

  if v_payment.status <> 'posted' then
    return query select false, 'payment_not_posted', null::uuid, null::uuid, null::numeric, null::uuid[], null::uuid[];
    return;
  end if;

  if exists (select 1 from public.payment_refunds where payment_id = p_payment_id) then
    return query select false, 'payment_already_refunded', null::uuid, null::uuid, null::numeric, null::uuid[], null::uuid[];
    return;
  end if;

  select coalesce(array_agg(distinct charge_id), '{}'::uuid[]), count(distinct charge_id), coalesce(sum(amount), 0)::numeric(12,2)
  into v_source_ids, v_source_count, v_source_total
  from public.payment_allocations
  where payment_id = p_payment_id;

  if v_source_count = 0 then
    return query select false, 'payment_has_no_allocations', null::uuid, null::uuid, null::numeric, null::uuid[], null::uuid[];
    return;
  end if;

  v_payment_amount := v_payment.amount;
  if abs(v_source_total - v_payment_amount) > 0.01 then
    return query select false, 'payment_not_fully_allocated', null::uuid, null::uuid, null::numeric, null::uuid[], null::uuid[];
    return;
  end if;

  if exists (
    select 1
    from public.payment_allocations pa
    where pa.charge_id = any(v_source_ids)
      and pa.payment_id <> p_payment_id
  ) then
    return query select false, 'source_charge_shared', null::uuid, null::uuid, null::numeric, v_source_ids, null::uuid[];
    return;
  end if;

  if exists (
    select 1
    from (
      select
        c.id,
        c.amount,
        coalesce(sum(pa.amount), 0)::numeric(12,2) as allocated_amount
      from public.charges c
      left join public.payment_allocations pa on pa.charge_id = c.id
      where c.id = any(v_source_ids)
      group by c.id, c.amount
    ) source_state
    where abs(source_state.amount - source_state.allocated_amount) > 0.01
  ) then
    return query select false, 'source_charge_not_exclusive', null::uuid, null::uuid, null::numeric, v_source_ids, null::uuid[];
    return;
  end if;

  with target_input as (
    select distinct charge_id
    from unnest(coalesce(p_target_charge_ids, '{}'::uuid[])) as charge_id
    where charge_id is not null
  )
  select coalesce(array_agg(charge_id), '{}'::uuid[])
  into v_target_ids
  from target_input;

  if coalesce(array_length(v_target_ids, 1), 0) = 0 then
    return query select false, 'target_charge_required', null::uuid, null::uuid, null::numeric, v_source_ids, null::uuid[];
    return;
  end if;

  if exists (select 1 from unnest(v_target_ids) as target_id where target_id = any(v_source_ids)) then
    return query select false, 'target_charge_conflict', null::uuid, null::uuid, null::numeric, v_source_ids, v_target_ids;
    return;
  end if;

  if exists (
    select 1
    from unnest(v_target_ids) as target_id
    where not public.current_user_can_access_charge(target_id)
  ) then
    return query select false, 'target_charge_invalid', null::uuid, null::uuid, null::numeric, v_source_ids, v_target_ids;
    return;
  end if;

  if exists (
    select 1
    from public.charges c
    where c.id = any(v_target_ids)
      and (c.enrollment_id <> v_payment.enrollment_id or c.status = 'void')
  ) then
    return query select false, 'target_charge_invalid', null::uuid, null::uuid, null::numeric, v_source_ids, v_target_ids;
    return;
  end if;

  select coalesce(sum(targets.pending_amount), 0)::numeric(12,2)
  into v_target_capacity
  from (
    select
      c.id,
      greatest(c.amount - coalesce(sum(pa.amount), 0), 0)::numeric(12,2) as pending_amount
    from public.charges c
    left join public.payment_allocations pa on pa.charge_id = c.id
    where c.id = any(v_target_ids)
    group by c.id, c.amount
  ) targets;

  if v_target_capacity + 0.009 < v_payment_amount then
    return query select false, 'target_capacity_too_small', null::uuid, null::uuid, null::numeric, v_source_ids, v_target_ids;
    return;
  end if;

  delete from public.payment_allocations
  where payment_id = p_payment_id;

  with ordered_targets as (
    select
      input.target_id as charge_id,
      input.ord,
      greatest(c.amount - coalesce(sum(pa.amount), 0), 0)::numeric(12,2) as pending_amount
    from unnest(v_target_ids) with ordinality as input(target_id, ord)
    join public.charges c on c.id = input.target_id
    left join public.payment_allocations pa on pa.charge_id = c.id
    group by input.target_id, input.ord, c.amount
  ),
  running as (
    select
      charge_id,
      pending_amount,
      greatest(
        least(
          pending_amount,
          v_payment_amount - coalesce(sum(pending_amount) over (
            order by ord
            rows between unbounded preceding and 1 preceding
          ), 0)
        ),
        0
      )::numeric(12,2) as allocation_amount
    from ordered_targets
  )
  insert into public.payment_allocations (payment_id, charge_id, amount)
  select p_payment_id, charge_id, allocation_amount
  from running
  where allocation_amount > 0;

  update public.charges
  set status = 'void',
      updated_at = now()
  where id = any(v_source_ids);

  return query
  select
    true,
    null::text,
    v_payment.id,
    v_payment.enrollment_id,
    v_payment.amount,
    v_source_ids,
    v_target_ids;
end;
$$;

grant execute on function public.reassign_payment_to_charges(uuid, uuid[]) to authenticated;

drop function if exists public.search_receipts(text, uuid, uuid, int, int);

create or replace function public.search_receipts(
  p_query text default null,
  p_campus_id uuid default null,
  p_payment_id uuid default null,
  p_limit int default 30,
  p_offset int default 0
)
returns table (
  payment_id uuid,
  folio text,
  paid_at timestamptz,
  player_name text,
  campus_id uuid,
  campus_name text,
  amount numeric,
  method public.payment_method,
  enrollment_id uuid,
  external_source text,
  refunded_at timestamptz,
  refund_method public.payment_method,
  refund_reason text,
  total_count bigint
)
language sql
security invoker
stable
set search_path = public
as $$
  with params as (
    select
      nullif(trim(p_query), '') as q,
      greatest(coalesce(p_limit, 30), 1) as page_limit,
      greatest(coalesce(p_offset, 0), 0) as page_offset
  ),
  base as (
    select
      p.id as payment_id,
      p.folio,
      p.paid_at,
      trim(coalesce(pl.first_name, '') || ' ' || coalesce(pl.last_name, '')) as player_name,
      c.id as campus_id,
      c.name as campus_name,
      p.amount,
      p.method,
      e.id as enrollment_id,
      p.external_source,
      pr.refunded_at,
      pr.refund_method,
      pr.reason as refund_reason
    from public.payments p
    join public.enrollments e on e.id = p.enrollment_id
    join public.players pl on pl.id = e.player_id
    join public.campuses c on c.id = e.campus_id
    left join public.payment_refunds pr on pr.payment_id = p.id
    cross join params prm
    where p.status = 'posted'
      and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
      and (p_payment_id is null or p.id = p_payment_id)
      and (p_campus_id is null or e.campus_id = p_campus_id)
      and (
        prm.q is null
        or coalesce(p.folio, '') ilike '%' || prm.q || '%'
        or trim(coalesce(pl.first_name, '') || ' ' || coalesce(pl.last_name, '')) ilike '%' || prm.q || '%'
      )
  ),
  counted as (
    select base.*, count(*) over() as total_count
    from base
  )
  select
    payment_id,
    folio,
    paid_at,
    player_name,
    campus_id,
    campus_name,
    amount,
    method,
    enrollment_id,
    external_source,
    refunded_at,
    refund_method,
    refund_reason,
    total_count
  from counted
  order by paid_at desc
  limit (select page_limit from params)
  offset (select page_offset from params);
$$;

grant execute on function public.search_receipts(text, uuid, uuid, int, int) to authenticated;

create or replace function public.get_dashboard_finance_summary(
  p_month text default null,
  p_campus_id uuid default null
)
returns table (
  selected_month text,
  active_enrollments bigint,
  enrollments_with_balance bigint,
  pending_balance numeric,
  payments_today numeric,
  payments_this_month numeric,
  monthly_payments_previous numeric,
  monthly_charges_this_month numeric,
  monthly_charges_previous numeric,
  new_enrollments_this_month bigint,
  bajas_this_month bigint,
  payment_count_this_month bigint,
  payments_by_method jsonb,
  player_360_amount numeric,
  player_360_count bigint,
  historical_catchup_amount numeric,
  historical_catchup_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select * from public.finance_month_window(p_month)
  ),
  today_window as (
    select
      make_timestamptz(
        extract(year from timezone('America/Monterrey', now())::date)::int,
        extract(month from timezone('America/Monterrey', now())::date)::int,
        extract(day from timezone('America/Monterrey', now())::date)::int,
        0,
        0,
        0,
        'America/Monterrey'
      ) as today_start_ts,
      make_timestamptz(
        extract(year from (timezone('America/Monterrey', now())::date + 1))::int,
        extract(month from (timezone('America/Monterrey', now())::date + 1))::int,
        extract(day from (timezone('America/Monterrey', now())::date + 1))::int,
        0,
        0,
        0,
        'America/Monterrey'
      ) as tomorrow_start_ts
  ),
  active as (
    select count(*)::bigint as total
    from public.enrollments e
    where e.status = 'active'
      and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
      and (p_campus_id is null or e.campus_id = p_campus_id)
      and (p_campus_id is null or public.can_access_campus(p_campus_id))
  ),
  balance as (
    select * from public.get_balance_kpis(p_campus_id)
  ),
  payments_today as (
    select
      (
        coalesce((select sum(pf.amount) from public.finance_payment_facts(tw.today_start_ts, tw.tomorrow_start_ts, p_campus_id) pf), 0)
        - coalesce((select sum(rf.amount) from public.finance_refund_facts(tw.today_start_ts, tw.tomorrow_start_ts, p_campus_id) rf), 0)
      )::numeric as total
    from today_window tw
  ),
  current_payments as (
    select *
    from bounds w
    cross join lateral public.finance_payment_facts(w.month_start_ts, w.next_month_start_ts, p_campus_id) pf
  ),
  previous_payments as (
    select *
    from bounds w
    cross join lateral public.finance_payment_facts(w.previous_month_start_ts, w.month_start_ts, p_campus_id) pf
  ),
  current_refunds as (
    select *
    from bounds w
    cross join lateral public.finance_refund_facts(w.month_start_ts, w.next_month_start_ts, p_campus_id) rf
  ),
  previous_refunds as (
    select *
    from bounds w
    cross join lateral public.finance_refund_facts(w.previous_month_start_ts, w.month_start_ts, p_campus_id) rf
  ),
  current_charges as (
    select *
    from bounds w
    cross join lateral public.finance_charge_facts(w.month_key, p_campus_id) cf
  ),
  previous_charges as (
    select *
    from bounds w
    cross join lateral public.finance_charge_facts(w.previous_month_key, p_campus_id) cf
  ),
  payments_by_method as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'method', pm.method,
          'methodLabel', case pm.method
            when 'cash' then 'Efectivo'
            when 'transfer' then 'Transferencia'
            when 'card' then 'Tarjeta'
            when 'stripe_360player' then '360Player'
            when 'other' then 'Otro'
            else pm.method
          end,
          'total', pm.total
        )
        order by pm.total desc, pm.method
      ),
      '[]'::jsonb
    ) as payload
    from (
      select method, coalesce(sum(amount), 0)::numeric as total
      from (
        select method, amount from current_payments
        union all
        select refund_method as method, amount * -1 from current_refunds
      ) method_rows
      group by method
    ) pm
  ),
  new_enrollments as (
    select count(*)::bigint as total
    from public.enrollments e
    cross join bounds w
    where e.created_at >= w.month_start_ts
      and e.created_at < w.next_month_start_ts
      and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
      and (p_campus_id is null or e.campus_id = p_campus_id)
      and (p_campus_id is null or public.can_access_campus(p_campus_id))
  ),
  bajas as (
    select count(*)::bigint as total
    from public.enrollments e
    cross join bounds w
    where e.status in ('ended', 'cancelled')
      and e.end_date >= w.month_start_date
      and e.end_date < w.next_month_start_date
      and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
      and (p_campus_id is null or e.campus_id = p_campus_id)
      and (p_campus_id is null or public.can_access_campus(p_campus_id))
  )
  select
    w.month_key as selected_month,
    a.total as active_enrollments,
    coalesce(b.enrollments_with_balance, 0)::bigint as enrollments_with_balance,
    coalesce(b.pending_balance, 0)::numeric as pending_balance,
    pt.total as payments_today,
    (
      coalesce((select sum(amount) from current_payments), 0)
      - coalesce((select sum(amount) from current_refunds), 0)
    )::numeric as payments_this_month,
    (
      coalesce((select sum(amount) from previous_payments), 0)
      - coalesce((select sum(amount) from previous_refunds), 0)
    )::numeric as monthly_payments_previous,
    coalesce((select sum(amount) from current_charges), 0)::numeric as monthly_charges_this_month,
    coalesce((select sum(amount) from previous_charges), 0)::numeric as monthly_charges_previous,
    ne.total as new_enrollments_this_month,
    ba.total as bajas_this_month,
    coalesce((select count(*) from current_payments), 0)::bigint as payment_count_this_month,
    pbm.payload as payments_by_method,
    coalesce((select sum(amount) from current_payments where is_360player), 0)::numeric as player_360_amount,
    coalesce((select count(*) from current_payments where is_360player), 0)::bigint as player_360_count,
    coalesce((select sum(amount) from current_payments where is_historical_catchup_contry), 0)::numeric as historical_catchup_amount,
    coalesce((select count(*) from current_payments where is_historical_catchup_contry), 0)::bigint as historical_catchup_count
  from bounds w
  cross join active a
  cross join balance b
  cross join payments_today pt
  cross join payments_by_method pbm
  cross join new_enrollments ne
  cross join bajas ba;
$$;

grant execute on function public.get_dashboard_finance_summary(text, uuid) to authenticated;

create or replace function public.get_resumen_mensual_summary(
  p_month text default null,
  p_campus_id uuid default null
)
returns table (
  month text,
  active_enrollments bigint,
  total_cargos_emitidos numeric,
  total_cobrado numeric,
  pending_balance numeric,
  payment_count bigint,
  charges_by_type jsonb,
  payments_by_method jsonb,
  player_360_amount numeric,
  player_360_count bigint,
  historical_catchup_amount numeric,
  historical_catchup_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select * from public.finance_month_window(p_month)
  ),
  active as (
    select count(*)::bigint as total
    from public.enrollments e
    where e.status = 'active'
      and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
      and (p_campus_id is null or e.campus_id = p_campus_id)
      and (p_campus_id is null or public.can_access_campus(p_campus_id))
  ),
  balance as (
    select * from public.get_balance_kpis(p_campus_id)
  ),
  charge_rows as (
    select *
    from bounds w
    cross join lateral public.finance_charge_facts(w.month_key, p_campus_id) cf
  ),
  payment_rows as (
    select *
    from bounds w
    cross join lateral public.finance_payment_facts(w.month_start_ts, w.next_month_start_ts, p_campus_id) pf
  ),
  refund_rows as (
    select *
    from bounds w
    cross join lateral public.finance_refund_facts(w.month_start_ts, w.next_month_start_ts, p_campus_id) rf
  ),
  charges_by_type as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'typeCode', cbt.charge_type_code,
          'typeName', cbt.charge_type_name,
          'count', cbt.item_count,
          'total', cbt.total
        )
        order by cbt.total desc, cbt.charge_type_name
      ),
      '[]'::jsonb
    ) as payload
    from (
      select
        charge_type_code,
        charge_type_name,
        count(*)::int as item_count,
        coalesce(sum(amount), 0)::numeric as total
      from charge_rows
      group by charge_type_code, charge_type_name
    ) cbt
  ),
  payments_by_method as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'method', pm.method,
          'methodLabel', case pm.method
            when 'cash' then 'Efectivo'
            when 'transfer' then 'Transferencia'
            when 'card' then 'Tarjeta'
            when 'stripe_360player' then '360Player'
            when 'other' then 'Otro'
            else pm.method
          end,
          'count', pm.payment_count,
          'total', pm.total
        )
        order by pm.total desc, pm.method
      ),
      '[]'::jsonb
    ) as payload
    from (
      select
        method,
        count(*)::int as payment_count,
        coalesce(sum(amount), 0)::numeric as total
      from (
        select method, amount from payment_rows
        union all
        select refund_method as method, amount * -1 from refund_rows
      ) method_rows
      group by method
    ) pm
  )
  select
    w.month_key as month,
    a.total as active_enrollments,
    coalesce((select sum(amount) from charge_rows), 0)::numeric as total_cargos_emitidos,
    (
      coalesce((select sum(amount) from payment_rows), 0)
      - coalesce((select sum(amount) from refund_rows), 0)
    )::numeric as total_cobrado,
    coalesce(b.pending_balance, 0)::numeric as pending_balance,
    coalesce((select count(*) from payment_rows), 0)::bigint as payment_count,
    cbt.payload as charges_by_type,
    pbm.payload as payments_by_method,
    coalesce((select sum(amount) from payment_rows where is_360player), 0)::numeric as player_360_amount,
    coalesce((select count(*) from payment_rows where is_360player), 0)::bigint as player_360_count,
    coalesce((select sum(amount) from payment_rows where is_historical_catchup_contry), 0)::numeric as historical_catchup_amount,
    coalesce((select count(*) from payment_rows where is_historical_catchup_contry), 0)::bigint as historical_catchup_count
  from bounds w
  cross join active a
  cross join balance b
  cross join charges_by_type cbt
  cross join payments_by_method pbm;
$$;

grant execute on function public.get_resumen_mensual_summary(text, uuid) to authenticated;

create or replace function public.get_corte_semanal_summary(
  p_month text default null,
  p_campus_id uuid default null
)
returns table (
  month text,
  month_label text,
  total_cobrado numeric,
  payment_count bigint,
  player_360_amount numeric,
  player_360_count bigint,
  historical_catchup_amount numeric,
  historical_catchup_count bigint,
  weeks jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select * from public.finance_month_window(p_month)
  ),
  payment_rows as (
    select
      pf.*,
      extract(day from pf.paid_date_local)::int as paid_day,
      ceil(extract(day from pf.paid_date_local) / 7.0)::int as week_num
    from bounds w
    cross join lateral public.finance_payment_facts(w.month_start_ts, w.next_month_start_ts, p_campus_id) pf
  ),
  refund_rows as (
    select
      rf.*,
      extract(day from rf.refunded_date_local)::int as refunded_day,
      ceil(extract(day from rf.refunded_date_local) / 7.0)::int as week_num
    from bounds w
    cross join lateral public.finance_refund_facts(w.month_start_ts, w.next_month_start_ts, p_campus_id) rf
  ),
  week_series as (
    select
      gs as week_num,
      ((gs - 1) * 7 + 1) as start_day,
      least(
        gs * 7,
        extract(day from ((select next_month_start_date from bounds) - interval '1 day'))::int
      ) as end_day
    from generate_series(
      1,
      ceil(extract(day from ((select next_month_start_date from bounds) - interval '1 day')) / 7.0)::int
    ) gs
  ),
  week_rollups as (
    select
      ws.week_num,
      ws.start_day,
      ws.end_day,
      (
        coalesce((select sum(amount) from payment_rows pr where pr.week_num = ws.week_num), 0)
        - coalesce((select sum(amount) from refund_rows rr where rr.week_num = ws.week_num), 0)
      )::numeric as total_cobrado,
      coalesce((select count(*) from payment_rows pr where pr.week_num = ws.week_num), 0)::bigint as payment_count
    from week_series ws
  ),
  weeks_payload as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'weekNum', wr.week_num,
          'label', format('%s-%s %s', wr.start_day, wr.end_day, (array['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'])[extract(month from (select month_date from bounds))::int]),
          'startDay', wr.start_day,
          'endDay', wr.end_day,
          'totalCobrado', wr.total_cobrado,
          'paymentCount', wr.payment_count,
          'byMethod', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'method', wm.method,
                'methodLabel', case wm.method
                  when 'cash' then 'Efectivo'
                  when 'transfer' then 'Transferencia'
                  when 'card' then 'Tarjeta'
                  when 'stripe_360player' then '360Player'
                  when 'other' then 'Otro'
                  else wm.method
                end,
                'total', wm.total
              )
              order by wm.total desc, wm.method
            )
            from (
              select method, coalesce(sum(amount), 0)::numeric as total
              from (
                select method, amount
                from payment_rows
                where week_num = wr.week_num
                union all
                select refund_method as method, amount * -1
                from refund_rows
                where week_num = wr.week_num
              ) week_method_rows
              group by method
            ) wm
          ), '[]'::jsonb)
        )
        order by wr.week_num
      ),
      '[]'::jsonb
    ) as payload
    from week_rollups wr
  )
  select
    w.month_key as month,
    w.month_label,
    (
      coalesce((select sum(amount) from payment_rows), 0)
      - coalesce((select sum(amount) from refund_rows), 0)
    )::numeric as total_cobrado,
    coalesce((select count(*) from payment_rows), 0)::bigint as payment_count,
    coalesce((select sum(amount) from payment_rows where is_360player), 0)::numeric as player_360_amount,
    coalesce((select count(*) from payment_rows where is_360player), 0)::bigint as player_360_count,
    coalesce((select sum(amount) from payment_rows where is_historical_catchup_contry), 0)::numeric as historical_catchup_amount,
    coalesce((select count(*) from payment_rows where is_historical_catchup_contry), 0)::bigint as historical_catchup_count,
    wp.payload as weeks
  from bounds w
  cross join weeks_payload wp;
$$;

grant execute on function public.get_corte_semanal_summary(text, uuid) to authenticated;
