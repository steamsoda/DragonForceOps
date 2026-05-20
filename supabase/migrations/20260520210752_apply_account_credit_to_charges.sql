-- Apply explicit account credit to selected charges.
--
-- This remains non-cash: it writes enrollment_credit_applications only.
-- It does not create payments, payment allocations, refunds, or cash-session rows.

alter table public.enrollment_credit_applications
  add column if not exists application_key uuid null;

create index if not exists idx_enrollment_credit_applications_key
  on public.enrollment_credit_applications (application_key)
  where application_key is not null;

create unique index if not exists idx_enrollment_credit_applications_key_credit_charge
  on public.enrollment_credit_applications (application_key, credit_id, charge_id)
  where application_key is not null;

create or replace function public.apply_enrollment_credit_to_charges(
  p_enrollment_id uuid,
  p_charge_ids uuid[],
  p_requested_amount numeric,
  p_actor_id uuid,
  p_application_key uuid,
  p_notes text default null
)
returns table(applied_amount numeric, application_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.enrollments%rowtype;
  v_remaining_request numeric(12,2);
  v_existing_amount numeric(12,2);
  v_existing_count int;
  v_charge record;
  v_credit record;
  v_apply numeric(12,2);
  v_charge_remaining numeric(12,2);
  v_credit_remaining numeric(12,2);
  v_distinct_charge_count int;
  v_valid_charge_count int;
  v_total_applied numeric(12,2) := 0;
  v_application_count int := 0;
begin
  if p_enrollment_id is null or p_actor_id is null then
    raise exception 'invalid_form';
  end if;

  if p_application_key is null then
    raise exception 'missing_application_key';
  end if;

  v_remaining_request := round(coalesce(p_requested_amount, 0), 2);
  if v_remaining_request <= 0 then
    raise exception 'invalid_amount';
  end if;

  select count(distinct charge_id)
  into v_existing_count
  from public.enrollment_credit_applications eca
  join public.enrollment_credits ec on ec.id = eca.credit_id
  where eca.application_key = p_application_key
    and ec.enrollment_id = p_enrollment_id;

  if v_existing_count > 0 then
    select
      coalesce(sum(eca.amount), 0)::numeric(12,2),
      count(*)::int
    into v_existing_amount, v_existing_count
    from public.enrollment_credit_applications eca
    join public.enrollment_credits ec on ec.id = eca.credit_id
    where eca.application_key = p_application_key
      and ec.enrollment_id = p_enrollment_id;

    applied_amount := coalesce(v_existing_amount, 0);
    application_count := coalesce(v_existing_count, 0);
    return next;
    return;
  end if;

  select *
  into v_enrollment
  from public.enrollments e
  where e.id = p_enrollment_id
  for update;

  if not found then
    raise exception 'enrollment_not_found';
  end if;

  if v_enrollment.status in ('ended', 'cancelled') then
    raise exception 'enrollment_inactive';
  end if;

  select count(distinct id)
  into v_distinct_charge_count
  from unnest(coalesce(p_charge_ids, array[]::uuid[])) as ids(id);

  if v_distinct_charge_count = 0 then
    raise exception 'no_target_charges';
  end if;

  select count(distinct c.id)
  into v_valid_charge_count
  from public.charges c
  where c.enrollment_id = p_enrollment_id
    and c.status <> 'void'
    and c.id = any(p_charge_ids);

  if v_valid_charge_count <> v_distinct_charge_count then
    raise exception 'invalid_target_charge';
  end if;

  perform 1
  from public.enrollment_credits ec
  where ec.enrollment_id = p_enrollment_id
    and ec.status = 'open'
  order by ec.created_at, ec.id
  for update;

  for v_charge in
    with payment_applied as (
      select pa.charge_id, coalesce(sum(pa.amount), 0)::numeric(12,2) as amount
      from public.payment_allocations pa
      where pa.charge_id = any(p_charge_ids)
      group by pa.charge_id
    ),
    credit_applied as (
      select eca.charge_id, coalesce(sum(eca.amount), 0)::numeric(12,2) as amount
      from public.enrollment_credit_applications eca
      where eca.charge_id = any(p_charge_ids)
      group by eca.charge_id
    )
    select
      c.id,
      greatest(c.amount - coalesce(pa.amount, 0) - coalesce(ca.amount, 0), 0)::numeric(12,2) as pending_amount
    from public.charges c
    left join payment_applied pa on pa.charge_id = c.id
    left join credit_applied ca on ca.charge_id = c.id
    where c.enrollment_id = p_enrollment_id
      and c.status <> 'void'
      and c.id = any(p_charge_ids)
    order by coalesce(c.due_date, c.created_at::date), c.created_at, c.id
  loop
    v_charge_remaining := least(v_charge.pending_amount, v_remaining_request);

    while v_charge_remaining > 0.009 and v_remaining_request > 0.009 loop
      select
        ec.id,
        greatest(ec.original_amount - coalesce(sum(eca.amount), 0), 0)::numeric(12,2) as available_amount
      into v_credit
      from public.enrollment_credits ec
      left join public.enrollment_credit_applications eca on eca.credit_id = ec.id
      where ec.enrollment_id = p_enrollment_id
        and ec.status = 'open'
      group by ec.id, ec.original_amount, ec.created_at
      having greatest(ec.original_amount - coalesce(sum(eca.amount), 0), 0) > 0.009
      order by ec.created_at, ec.id
      limit 1;

      if not found then
        exit;
      end if;

      v_credit_remaining := v_credit.available_amount;
      v_apply := round(least(v_credit_remaining, v_charge_remaining, v_remaining_request), 2);
      if v_apply <= 0 then
        exit;
      end if;

      insert into public.enrollment_credit_applications (
        credit_id,
        charge_id,
        amount,
        applied_by,
        notes,
        application_key
      )
      values (
        v_credit.id,
        v_charge.id,
        v_apply,
        p_actor_id,
        p_notes,
        p_application_key
      );

      v_total_applied := round(v_total_applied + v_apply, 2);
      v_application_count := v_application_count + 1;
      v_charge_remaining := round(v_charge_remaining - v_apply, 2);
      v_remaining_request := round(v_remaining_request - v_apply, 2);

      if v_apply + 0.009 >= v_credit_remaining then
        update public.enrollment_credits
        set status = 'fully_used'
        where id = v_credit.id;
      end if;
    end loop;

    if v_remaining_request <= 0.009 then
      exit;
    end if;
  end loop;

  if v_application_count = 0 then
    raise exception 'no_applicable_credit';
  end if;

  applied_amount := v_total_applied;
  application_count := v_application_count;
  return next;
end;
$$;

revoke execute on function public.apply_enrollment_credit_to_charges(uuid, uuid[], numeric, uuid, uuid, text) from public;
revoke execute on function public.apply_enrollment_credit_to_charges(uuid, uuid[], numeric, uuid, uuid, text) from anon;
revoke execute on function public.apply_enrollment_credit_to_charges(uuid, uuid[], numeric, uuid, uuid, text) from authenticated;
grant execute on function public.apply_enrollment_credit_to_charges(uuid, uuid[], numeric, uuid, uuid, text) to service_role;
