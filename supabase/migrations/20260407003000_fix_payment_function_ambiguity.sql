-- Fix PL/pgSQL output-variable ambiguity inside payment refund/reassignment functions.

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
  v_operator_campus_id uuid;
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

  if exists (select 1 from public.payment_refunds pr where pr.payment_id = p_payment_id) then
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

  v_operator_campus_id := v_payment.operator_campus_id;
  if v_operator_campus_id is null then
    select e.campus_id
    into v_operator_campus_id
    from public.enrollments e
    where e.id = v_payment.enrollment_id;
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
    v_operator_campus_id,
    trim(p_reason),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_charge_breakdown,
    auth.uid()
  )
  returning id into v_refund_id;

  delete from public.payment_allocations pa
  where pa.payment_id = p_payment_id;

  return query
  select
    true,
    null::text,
    v_refund_id,
    v_payment.id,
    v_payment.enrollment_id,
    v_payment.amount,
    v_operator_campus_id;
exception
  when not_null_violation or foreign_key_violation or check_violation then
    return query
    select
      false,
      'refund_insert_failed',
      null::uuid,
      v_payment.id,
      v_payment.enrollment_id,
      v_payment.amount,
      coalesce(v_operator_campus_id, v_payment.operator_campus_id);
  when others then
    return query
    select
      false,
      'refund_failed',
      null::uuid,
      v_payment.id,
      v_payment.enrollment_id,
      v_payment.amount,
      coalesce(v_operator_campus_id, v_payment.operator_campus_id);
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

  if exists (select 1 from public.payment_refunds pr where pr.payment_id = p_payment_id) then
    return query select false, 'payment_already_refunded', null::uuid, null::uuid, null::numeric, null::uuid[], null::uuid[];
    return;
  end if;

  select
    coalesce(array_agg(distinct pa.charge_id), '{}'::uuid[]),
    count(distinct pa.charge_id),
    coalesce(sum(pa.amount), 0)::numeric(12,2)
  into v_source_ids, v_source_count, v_source_total
  from public.payment_allocations pa
  where pa.payment_id = p_payment_id;

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

  delete from public.payment_allocations pa
  where pa.payment_id = p_payment_id;

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
