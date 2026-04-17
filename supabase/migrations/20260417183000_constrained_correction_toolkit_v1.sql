insert into public.charge_types (code, name, is_active)
values
  ('corrective_charge', 'Cargo correctivo', true),
  ('balance_adjustment', 'Ajuste de saldo', true)
on conflict (code) do update
set
  name = excluded.name,
  is_active = true;

create or replace function public.repair_payment_allocations(
  p_enrollment_id uuid,
  p_payment_ids uuid[],
  p_charge_ids uuid[],
  p_allocations jsonb
)
returns table (
  ok boolean,
  error_code text,
  before_allocations jsonb,
  after_allocations jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before_allocations jsonb := '[]'::jsonb;
  v_after_allocations jsonb := '[]'::jsonb;
  v_selected_payment_count integer := 0;
  v_valid_payment_count integer := 0;
  v_selected_charge_count integer := 0;
  v_valid_charge_count integer := 0;
begin
  if not exists (
    select 1
    from public.user_roles ur
    join public.app_roles ar on ar.id = ur.role_id
    where ur.user_id = auth.uid()
      and ar.code = 'superadmin'
  ) then
    return query select false, 'unauthorized', null::jsonb, null::jsonb;
    return;
  end if;

  if not public.current_user_can_access_enrollment(p_enrollment_id) then
    return query select false, 'unauthorized', null::jsonb, null::jsonb;
    return;
  end if;

  if coalesce(array_length(p_payment_ids, 1), 0) = 0 then
    return query select false, 'payment_selection_required', null::jsonb, null::jsonb;
    return;
  end if;

  if coalesce(array_length(p_charge_ids, 1), 0) = 0 then
    return query select false, 'charge_selection_required', null::jsonb, null::jsonb;
    return;
  end if;

  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array' then
    return query select false, 'invalid_allocation_payload', null::jsonb, null::jsonb;
    return;
  end if;

  create temporary table tmp_selected_payments (
    id uuid primary key
  ) on commit drop;

  insert into tmp_selected_payments (id)
  select distinct payment_id
  from unnest(p_payment_ids) as payment_id;

  select count(*) into v_selected_payment_count from tmp_selected_payments;
  if v_selected_payment_count = 0 then
    return query select false, 'payment_selection_required', null::jsonb, null::jsonb;
    return;
  end if;

  create temporary table tmp_selected_charges (
    id uuid primary key
  ) on commit drop;

  insert into tmp_selected_charges (id)
  select distinct charge_id
  from unnest(p_charge_ids) as charge_id;

  select count(*) into v_selected_charge_count from tmp_selected_charges;
  if v_selected_charge_count = 0 then
    return query select false, 'charge_selection_required', null::jsonb, null::jsonb;
    return;
  end if;

  select count(*)
  into v_valid_payment_count
  from public.payments p
  join tmp_selected_payments sp on sp.id = p.id
  left join public.payment_refunds pr on pr.payment_id = p.id
  where p.enrollment_id = p_enrollment_id
    and p.status = 'posted'
    and pr.payment_id is null;

  if v_valid_payment_count <> v_selected_payment_count then
    return query select false, 'invalid_payment_selection', null::jsonb, null::jsonb;
    return;
  end if;

  select count(*)
  into v_valid_charge_count
  from public.charges c
  join tmp_selected_charges sc on sc.id = c.id
  where c.enrollment_id = p_enrollment_id
    and c.status <> 'void'
    and c.amount > 0;

  if v_valid_charge_count <> v_selected_charge_count then
    return query select false, 'invalid_charge_selection', null::jsonb, null::jsonb;
    return;
  end if;

  create temporary table tmp_new_allocations (
    payment_id uuid not null,
    charge_id uuid not null,
    amount numeric(12,2) not null
  ) on commit drop;

  begin
    insert into tmp_new_allocations (payment_id, charge_id, amount)
    select
      (entry ->> 'paymentId')::uuid,
      (entry ->> 'chargeId')::uuid,
      round((entry ->> 'amount')::numeric, 2)
    from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) as entry;
  exception
    when others then
      return query select false, 'invalid_allocation_payload', null::jsonb, null::jsonb;
      return;
  end;

  if exists (select 1 from tmp_new_allocations where amount <= 0) then
    return query select false, 'invalid_allocation_amount', null::jsonb, null::jsonb;
    return;
  end if;

  if exists (
    select 1
    from tmp_new_allocations na
    left join tmp_selected_payments sp on sp.id = na.payment_id
    where sp.id is null
  ) then
    return query select false, 'invalid_allocation_payload', null::jsonb, null::jsonb;
    return;
  end if;

  if exists (
    select 1
    from tmp_new_allocations na
    left join tmp_selected_charges sc on sc.id = na.charge_id
    where sc.id is null
  ) then
    return query select false, 'invalid_allocation_payload', null::jsonb, null::jsonb;
    return;
  end if;

  if exists (
    select 1
    from public.payments p
    join tmp_selected_payments sp on sp.id = p.id
    left join (
      select payment_id, round(sum(amount), 2) as total_amount
      from tmp_new_allocations
      group by payment_id
    ) totals on totals.payment_id = p.id
    where abs(coalesce(totals.total_amount, 0) - p.amount) > 0.01
  ) then
    return query select false, 'payment_total_mismatch', null::jsonb, null::jsonb;
    return;
  end if;

  if exists (
    with current_totals as (
      select pa.charge_id, round(sum(pa.amount), 2) as total_amount
      from public.payment_allocations pa
      group by pa.charge_id
    ),
    selected_current_totals as (
      select pa.charge_id, round(sum(pa.amount), 2) as total_amount
      from public.payment_allocations pa
      join tmp_selected_payments sp on sp.id = pa.payment_id
      group by pa.charge_id
    ),
    new_totals as (
      select na.charge_id, round(sum(na.amount), 2) as total_amount
      from tmp_new_allocations na
      group by na.charge_id
    )
    select 1
    from public.charges c
    join tmp_selected_charges sc on sc.id = c.id
    left join current_totals current on current.charge_id = c.id
    left join selected_current_totals selected on selected.charge_id = c.id
    left join new_totals incoming on incoming.charge_id = c.id
    where round(coalesce(current.total_amount, 0) - coalesce(selected.total_amount, 0) + coalesce(incoming.total_amount, 0), 2) - c.amount > 0.01
  ) then
    return query select false, 'charge_overapplied', null::jsonb, null::jsonb;
    return;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'payment_id', pa.payment_id,
        'charge_id', pa.charge_id,
        'amount', pa.amount
      )
      order by pa.payment_id, pa.charge_id
    ),
    '[]'::jsonb
  )
  into v_before_allocations
  from public.payment_allocations pa
  join tmp_selected_payments sp on sp.id = pa.payment_id;

  delete from public.payment_allocations pa
  using tmp_selected_payments sp
  where pa.payment_id = sp.id;

  insert into public.payment_allocations (payment_id, charge_id, amount)
  select payment_id, charge_id, amount
  from tmp_new_allocations;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'payment_id', pa.payment_id,
        'charge_id', pa.charge_id,
        'amount', pa.amount
      )
      order by pa.payment_id, pa.charge_id
    ),
    '[]'::jsonb
  )
  into v_after_allocations
  from public.payment_allocations pa
  join tmp_selected_payments sp on sp.id = pa.payment_id;

  return query select true, null::text, v_before_allocations, v_after_allocations;
end;
$$;

grant execute on function public.repair_payment_allocations(uuid, uuid[], uuid[], jsonb) to authenticated;
