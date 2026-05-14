-- Allow Caja to move one eligible non-monthly source allocation from a mixed payment.
-- Monthly tuition allocations remain protected; the payment amount itself is unchanged.

create or replace function public.reassign_payment_source_charge_to_charges(
  p_payment_id uuid,
  p_source_charge_id uuid,
  p_target_charge_ids uuid[]
)
returns table (
  ok boolean,
  error_code text,
  payment_id uuid,
  enrollment_id uuid,
  moved_amount numeric,
  source_charge_id uuid,
  destination_charge_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_source_charge public.charges%rowtype;
  v_source_type_code text;
  v_source_amount numeric(12,2);
  v_payment_allocated_total numeric(12,2);
  v_source_allocated_total numeric(12,2);
  v_target_ids uuid[];
  v_target_capacity numeric(12,2);
begin
  if auth.uid() is null then
    return query select false, 'unauthenticated', null::uuid, null::uuid, null::numeric, null::uuid, null::uuid[];
    return;
  end if;

  select *
  into v_payment
  from public.payments p
  where p.id = p_payment_id;

  if not found then
    return query select false, 'payment_not_found', null::uuid, null::uuid, null::numeric, null::uuid, null::uuid[];
    return;
  end if;

  if not public.current_user_can_access_payment(p_payment_id) then
    return query select false, 'unauthorized', null::uuid, null::uuid, null::numeric, null::uuid, null::uuid[];
    return;
  end if;

  if v_payment.status <> 'posted' then
    return query select false, 'payment_not_posted', null::uuid, null::uuid, null::numeric, null::uuid, null::uuid[];
    return;
  end if;

  if exists (select 1 from public.payment_refunds pr where pr.payment_id = p_payment_id) then
    return query select false, 'payment_already_refunded', null::uuid, null::uuid, null::numeric, null::uuid, null::uuid[];
    return;
  end if;

  if p_source_charge_id is null then
    return query select false, 'source_charge_required', null::uuid, null::uuid, null::numeric, null::uuid, null::uuid[];
    return;
  end if;

  select *
  into v_source_charge
  from public.charges c
  where c.id = p_source_charge_id
    and c.enrollment_id = v_payment.enrollment_id;

  if not found then
    return query select false, 'source_charge_invalid', null::uuid, null::uuid, null::numeric, p_source_charge_id, null::uuid[];
    return;
  end if;

  select ct.code
  into v_source_type_code
  from public.charge_types ct
  where ct.id = v_source_charge.charge_type_id;

  if v_source_type_code = 'monthly_tuition' then
    return query select false, 'source_charge_monthly_tuition', null::uuid, null::uuid, null::numeric, p_source_charge_id, null::uuid[];
    return;
  end if;

  if v_source_charge.status = 'void' then
    return query select false, 'source_charge_not_exclusive', null::uuid, null::uuid, null::numeric, p_source_charge_id, null::uuid[];
    return;
  end if;

  select coalesce(sum(pa.amount), 0)::numeric(12,2)
  into v_payment_allocated_total
  from public.payment_allocations pa
  where pa.payment_id = p_payment_id;

  if abs(v_payment_allocated_total - v_payment.amount) > 0.01 then
    return query select false, 'payment_not_fully_allocated', null::uuid, null::uuid, null::numeric, p_source_charge_id, null::uuid[];
    return;
  end if;

  select coalesce(sum(pa.amount), 0)::numeric(12,2)
  into v_source_amount
  from public.payment_allocations pa
  where pa.payment_id = p_payment_id
    and pa.charge_id = p_source_charge_id;

  if v_source_amount <= 0 then
    return query select false, 'source_charge_invalid', null::uuid, null::uuid, null::numeric, p_source_charge_id, null::uuid[];
    return;
  end if;

  if exists (
    select 1
    from public.payment_allocations pa
    where pa.charge_id = p_source_charge_id
      and pa.payment_id <> p_payment_id
  ) then
    return query select false, 'source_charge_shared', null::uuid, null::uuid, null::numeric, p_source_charge_id, null::uuid[];
    return;
  end if;

  select coalesce(sum(pa.amount), 0)::numeric(12,2)
  into v_source_allocated_total
  from public.payment_allocations pa
  where pa.charge_id = p_source_charge_id;

  if abs(v_source_charge.amount - v_source_allocated_total) > 0.01 then
    return query select false, 'source_charge_not_exclusive', null::uuid, null::uuid, null::numeric, p_source_charge_id, null::uuid[];
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
    return query select false, 'target_charge_required', null::uuid, null::uuid, null::numeric, p_source_charge_id, null::uuid[];
    return;
  end if;

  if exists (select 1 from unnest(v_target_ids) as target_id where target_id = p_source_charge_id) then
    return query select false, 'target_charge_conflict', null::uuid, null::uuid, null::numeric, p_source_charge_id, v_target_ids;
    return;
  end if;

  if exists (
    select 1
    from unnest(v_target_ids) as target_id
    where not public.current_user_can_access_charge(target_id)
  ) then
    return query select false, 'target_charge_invalid', null::uuid, null::uuid, null::numeric, p_source_charge_id, v_target_ids;
    return;
  end if;

  if exists (
    select 1
    from public.charges c
    where c.id = any(v_target_ids)
      and (c.enrollment_id <> v_payment.enrollment_id or c.status = 'void')
  ) then
    return query select false, 'target_charge_invalid', null::uuid, null::uuid, null::numeric, p_source_charge_id, v_target_ids;
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

  if v_target_capacity + 0.009 < v_source_amount then
    return query select false, 'target_capacity_too_small', null::uuid, null::uuid, null::numeric, p_source_charge_id, v_target_ids;
    return;
  end if;

  delete from public.payment_allocations pa
  where pa.payment_id = p_payment_id
    and pa.charge_id = p_source_charge_id;

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
          v_source_amount - coalesce(sum(pending_amount) over (
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

  update public.charges c
  set status = 'void',
      updated_at = now()
  where c.id = p_source_charge_id;

  return query
  select
    true,
    null::text,
    v_payment.id,
    v_payment.enrollment_id,
    v_source_amount,
    p_source_charge_id,
    v_target_ids;
end;
$$;

revoke execute on function public.reassign_payment_source_charge_to_charges(uuid, uuid, uuid[]) from public;
revoke execute on function public.reassign_payment_source_charge_to_charges(uuid, uuid, uuid[]) from anon;
grant execute on function public.reassign_payment_source_charge_to_charges(uuid, uuid, uuid[]) to authenticated;
