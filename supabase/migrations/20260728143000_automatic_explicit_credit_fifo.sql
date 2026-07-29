-- Automatically consume explicit enrollment credit against live charges.
--
-- This is intentionally limited to the explicit credit ledger. Historical
-- underallocated payments are not converted or reinterpreted by this migration.
-- Credit application is non-cash: it never creates or changes payments,
-- receipts, cash-session rows, or finance report facts.

create or replace function public.auto_apply_enrollment_credit_fifo(
  p_enrollment_id uuid,
  p_actor_id uuid default null,
  p_application_key uuid default null,
  p_notes text default null
)
returns table(
  applied_amount numeric,
  application_count integer,
  remaining_credit_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.enrollments%rowtype;
  v_charge record;
  v_credit record;
  v_apply numeric(12,2);
  v_charge_remaining numeric(12,2);
  v_credit_remaining numeric(12,2);
  v_total_applied numeric(12,2) := 0;
  v_application_count integer := 0;
  v_application_key uuid := coalesce(p_application_key, gen_random_uuid());
  v_existing_amount numeric(12,2);
  v_existing_count integer;
begin
  if p_enrollment_id is null then
    raise exception 'invalid_form';
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
    applied_amount := 0;
    application_count := 0;
    remaining_credit_amount := coalesce((
      select sum(greatest(ec.original_amount - coalesce(applied.amount, 0), 0))
      from public.enrollment_credits ec
      left join lateral (
        select sum(eca.amount)::numeric(12,2) as amount
        from public.enrollment_credit_applications eca
        where eca.credit_id = ec.id
      ) applied on true
      where ec.enrollment_id = p_enrollment_id
        and ec.status = 'open'
    ), 0)::numeric(12,2);
    return next;
    return;
  end if;

  if p_application_key is not null then
    select
      coalesce(sum(eca.amount), 0)::numeric(12,2),
      count(*)::integer
    into v_existing_amount, v_existing_count
    from public.enrollment_credit_applications eca
    join public.enrollment_credits ec on ec.id = eca.credit_id
    where eca.application_key = p_application_key
      and ec.enrollment_id = p_enrollment_id;

    if v_existing_count > 0 then
      applied_amount := v_existing_amount;
      application_count := v_existing_count;
      remaining_credit_amount := coalesce((
        select sum(greatest(ec.original_amount - coalesce(applied.amount, 0), 0))
        from public.enrollment_credits ec
        left join lateral (
          select sum(eca.amount)::numeric(12,2) as amount
          from public.enrollment_credit_applications eca
          where eca.credit_id = ec.id
        ) applied on true
        where ec.enrollment_id = p_enrollment_id
          and ec.status = 'open'
      ), 0)::numeric(12,2);
      return next;
      return;
    end if;
  end if;

  -- Enrollment locking serializes every automatic pass for this account.
  perform 1
  from public.enrollment_credits ec
  where ec.enrollment_id = p_enrollment_id
    and ec.status = 'open'
  order by ec.created_at, ec.id
  for update;

  perform 1
  from public.charges c
  where c.enrollment_id = p_enrollment_id
    and c.status <> 'void'
  order by coalesce(c.due_date, c.created_at::date), c.created_at, c.id
  for update;

  for v_charge in
    with payment_applied as (
      select pa.charge_id, coalesce(sum(pa.amount), 0)::numeric(12,2) as amount
      from public.payment_allocations pa
      join public.charges c on c.id = pa.charge_id
      where c.enrollment_id = p_enrollment_id
      group by pa.charge_id
    ),
    credit_applied as (
      select eca.charge_id, coalesce(sum(eca.amount), 0)::numeric(12,2) as amount
      from public.enrollment_credit_applications eca
      join public.charges c on c.id = eca.charge_id
      where c.enrollment_id = p_enrollment_id
      group by eca.charge_id
    )
    select
      c.id,
      greatest(c.amount - coalesce(pa.amount, 0) - coalesce(ca.amount, 0), 0)::numeric(12,2)
        as pending_amount
    from public.charges c
    left join payment_applied pa on pa.charge_id = c.id
    left join credit_applied ca on ca.charge_id = c.id
    where c.enrollment_id = p_enrollment_id
      and c.status <> 'void'
      and greatest(c.amount - coalesce(pa.amount, 0) - coalesce(ca.amount, 0), 0) > 0.009
    order by coalesce(c.due_date, c.created_at::date), c.created_at, c.id
  loop
    v_charge_remaining := v_charge.pending_amount;

    while v_charge_remaining > 0.009 loop
      select
        ec.id,
        ec.created_by,
        greatest(ec.original_amount - coalesce(sum(eca.amount), 0), 0)::numeric(12,2)
          as available_amount
      into v_credit
      from public.enrollment_credits ec
      left join public.enrollment_credit_applications eca on eca.credit_id = ec.id
      where ec.enrollment_id = p_enrollment_id
        and ec.status = 'open'
      group by ec.id, ec.original_amount, ec.created_at, ec.created_by
      having greatest(ec.original_amount - coalesce(sum(eca.amount), 0), 0) > 0.009
      order by ec.created_at, ec.id
      limit 1;

      if not found then
        exit;
      end if;

      v_credit_remaining := v_credit.available_amount;
      v_apply := round(least(v_credit_remaining, v_charge_remaining), 2);
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
        coalesce(p_actor_id, v_credit.created_by),
        coalesce(nullif(btrim(p_notes), ''), 'Credito aplicado automaticamente por antiguedad.'),
        v_application_key
      );

      v_total_applied := round(v_total_applied + v_apply, 2);
      v_application_count := v_application_count + 1;
      v_charge_remaining := round(v_charge_remaining - v_apply, 2);

      if v_apply + 0.009 >= v_credit_remaining then
        update public.enrollment_credits
        set status = 'fully_used'
        where id = v_credit.id;
      end if;
    end loop;

    if not exists (
      select 1
      from public.enrollment_credits ec
      left join public.enrollment_credit_applications eca on eca.credit_id = ec.id
      where ec.enrollment_id = p_enrollment_id
        and ec.status = 'open'
      group by ec.id, ec.original_amount
      having greatest(ec.original_amount - coalesce(sum(eca.amount), 0), 0) > 0.009
    ) then
      exit;
    end if;
  end loop;

  applied_amount := v_total_applied;
  application_count := v_application_count;
  remaining_credit_amount := coalesce((
    select sum(greatest(ec.original_amount - coalesce(applied.amount, 0), 0))
    from public.enrollment_credits ec
    left join lateral (
      select sum(eca.amount)::numeric(12,2) as amount
      from public.enrollment_credit_applications eca
      where eca.credit_id = ec.id
    ) applied on true
    where ec.enrollment_id = p_enrollment_id
      and ec.status = 'open'
  ), 0)::numeric(12,2);
  return next;
end;
$$;

revoke execute on function public.auto_apply_enrollment_credit_fifo(uuid, uuid, uuid, text) from public;
revoke execute on function public.auto_apply_enrollment_credit_fifo(uuid, uuid, uuid, text) from anon;
revoke execute on function public.auto_apply_enrollment_credit_fifo(uuid, uuid, uuid, text) from authenticated;
grant execute on function public.auto_apply_enrollment_credit_fifo(uuid, uuid, uuid, text) to service_role;

create or replace function public.apply_explicit_credit_after_charge_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'void' then
    perform *
    from public.auto_apply_enrollment_credit_fifo(
      new.enrollment_id,
      new.created_by,
      gen_random_uuid(),
      'Credito aplicado automaticamente al crear un cargo.'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_apply_explicit_credit_after_charge_insert on public.charges;
create trigger trg_apply_explicit_credit_after_charge_insert
after insert on public.charges
for each row execute function public.apply_explicit_credit_after_charge_insert();

revoke execute on function public.apply_explicit_credit_after_charge_insert() from public;
revoke execute on function public.apply_explicit_credit_after_charge_insert() from anon;
revoke execute on function public.apply_explicit_credit_after_charge_insert() from authenticated;

-- Checkout creates product/tuition charges before posting the payment. If a
-- later cart item or payment fails, remove only those newly-created unpaid
-- charges and reopen any explicit credit the insert trigger consumed.
create or replace function public.rollback_unpaid_caja_checkout_charges(
  p_enrollment_id uuid,
  p_charge_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge_ids uuid[] := coalesce(p_charge_ids, array[]::uuid[]);
  v_credit_ids uuid[];
  v_deleted integer := 0;
begin
  if p_enrollment_id is null or cardinality(v_charge_ids) = 0 then
    return 0;
  end if;

  perform 1
  from public.enrollments e
  where e.id = p_enrollment_id
  for update;

  if not found then
    raise exception 'enrollment_not_found';
  end if;

  perform 1
  from public.charges c
  where c.enrollment_id = p_enrollment_id
    and c.id = any(v_charge_ids)
  for update;

  if exists (
    select 1
    from public.payment_allocations pa
    join public.charges c on c.id = pa.charge_id
    where c.enrollment_id = p_enrollment_id
      and c.id = any(v_charge_ids)
  ) then
    raise exception 'checkout_charge_has_payment';
  end if;

  select array_agg(distinct eca.credit_id)
  into v_credit_ids
  from public.enrollment_credit_applications eca
  join public.charges c on c.id = eca.charge_id
  where c.enrollment_id = p_enrollment_id
    and c.id = any(v_charge_ids);

  delete from public.enrollment_credit_applications eca
  using public.charges c
  where c.id = eca.charge_id
    and c.enrollment_id = p_enrollment_id
    and c.id = any(v_charge_ids);

  update public.enrollment_credits ec
  set status = case
    when ec.status = 'void' then 'void'
    when coalesce((
      select sum(eca.amount)
      from public.enrollment_credit_applications eca
      where eca.credit_id = ec.id
    ), 0) + 0.009 >= ec.original_amount then 'fully_used'
    else 'open'
  end
  where ec.id = any(coalesce(v_credit_ids, array[]::uuid[]));

  delete from public.charges c
  where c.enrollment_id = p_enrollment_id
    and c.id = any(v_charge_ids)
    and c.status = 'pending';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.rollback_unpaid_caja_checkout_charges(uuid, uuid[]) from public;
revoke execute on function public.rollback_unpaid_caja_checkout_charges(uuid, uuid[]) from anon;
revoke execute on function public.rollback_unpaid_caja_checkout_charges(uuid, uuid[]) from authenticated;
grant execute on function public.rollback_unpaid_caja_checkout_charges(uuid, uuid[]) to service_role;

-- Extend paid-charge annulment so released/reopened credit is immediately
-- applied to the account's remaining live charges in the same transaction.
-- PostgreSQL cannot change TABLE/OUT return columns with CREATE OR REPLACE.
drop function if exists public.void_charge_to_explicit_credit(uuid, uuid, uuid, text);

create function public.void_charge_to_explicit_credit(
  p_enrollment_id uuid,
  p_charge_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns table(
  released_payment_amount numeric,
  reopened_credit_amount numeric,
  created_credit_count integer,
  auto_applied_credit_amount numeric,
  remaining_credit_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge record;
  v_campus_id uuid;
  v_payment_allocation record;
  v_credit_application record;
  v_auto_result record;
  v_reopened_credit_ids uuid[] := array[]::uuid[];
  v_payment_total numeric(12,2) := 0;
  v_reopened_total numeric(12,2) := 0;
  v_credit_count integer := 0;
begin
  if p_enrollment_id is null or p_charge_id is null or p_actor_id is null then
    raise exception 'invalid_form';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'void_reason_required';
  end if;

  -- Keep the same lock order as automatic FIFO: enrollment, then charges.
  select e.campus_id
  into v_campus_id
  from public.enrollments e
  where e.id = p_enrollment_id
  for update;

  if not found then
    raise exception 'enrollment_not_found';
  end if;

  select c.*, ct.code as charge_type_code
  into v_charge
  from public.charges c
  join public.charge_types ct on ct.id = c.charge_type_id
  where c.id = p_charge_id
    and c.enrollment_id = p_enrollment_id
  for update of c;

  if not found then
    raise exception 'charge_not_found';
  end if;

  if v_charge.status <> 'pending' then
    raise exception 'charge_not_pending';
  end if;

  perform 1
  from public.payment_allocations pa
  join public.payments p on p.id = pa.payment_id
  where pa.charge_id = p_charge_id
  order by pa.id
  for update of pa, p;

  perform 1
  from public.enrollment_credit_applications eca
  join public.enrollment_credits ec on ec.id = eca.credit_id
  where eca.charge_id = p_charge_id
  order by eca.id
  for update of eca, ec;

  if v_charge.charge_type_code in ('monthly_tuition', 'inscription')
     and (
       exists (select 1 from public.payment_allocations pa where pa.charge_id = p_charge_id)
       or exists (
         select 1 from public.enrollment_credit_applications eca where eca.charge_id = p_charge_id
       )
     )
  then
    raise exception 'protected_paid_charge';
  end if;

  for v_payment_allocation in
    select pa.payment_id, pa.amount, p.status as payment_status
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.charge_id = p_charge_id
    order by pa.created_at, pa.id
  loop
    if v_payment_allocation.payment_status <> 'posted' then
      raise exception 'payment_not_posted';
    end if;

    insert into public.enrollment_credits (
      enrollment_id,
      campus_id,
      source_payment_id,
      source_charge_id,
      source_workflow,
      original_amount,
      currency,
      status,
      reason,
      notes,
      created_by
    )
    values (
      p_enrollment_id,
      v_campus_id,
      v_payment_allocation.payment_id,
      p_charge_id,
      'charge_void',
      v_payment_allocation.amount,
      v_charge.currency,
      'open',
      btrim(p_reason),
      'Credito creado al anular un cargo con pago aplicado.',
      p_actor_id
    );

    v_payment_total := round(v_payment_total + v_payment_allocation.amount, 2);
    v_credit_count := v_credit_count + 1;
  end loop;

  for v_credit_application in
    select eca.credit_id, coalesce(sum(eca.amount), 0)::numeric(12,2) as amount
    from public.enrollment_credit_applications eca
    where eca.charge_id = p_charge_id
    group by eca.credit_id
  loop
    v_reopened_total := round(v_reopened_total + v_credit_application.amount, 2);
    v_reopened_credit_ids := array_append(v_reopened_credit_ids, v_credit_application.credit_id);
  end loop;

  delete from public.enrollment_credit_applications
  where charge_id = p_charge_id;

  update public.enrollment_credits ec
  set status = case
    when ec.status = 'void' then 'void'
    when coalesce((
      select sum(eca.amount)
      from public.enrollment_credit_applications eca
      where eca.credit_id = ec.id
    ), 0) + 0.009 >= ec.original_amount then 'fully_used'
    else 'open'
  end
  where ec.id = any(v_reopened_credit_ids);

  delete from public.payment_allocations
  where charge_id = p_charge_id;

  update public.charges
  set status = 'void',
      updated_at = now()
  where id = p_charge_id;

  select *
  into v_auto_result
  from public.auto_apply_enrollment_credit_fifo(
    p_enrollment_id,
    p_actor_id,
    gen_random_uuid(),
    'Credito liberado por anulacion y aplicado automaticamente por antiguedad.'
  );

  released_payment_amount := v_payment_total;
  reopened_credit_amount := v_reopened_total;
  created_credit_count := v_credit_count;
  auto_applied_credit_amount := coalesce(v_auto_result.applied_amount, 0);
  remaining_credit_amount := coalesce(v_auto_result.remaining_credit_amount, 0);
  return next;
end;
$$;

revoke execute on function public.void_charge_to_explicit_credit(uuid, uuid, uuid, text) from public;
revoke execute on function public.void_charge_to_explicit_credit(uuid, uuid, uuid, text) from anon;
revoke execute on function public.void_charge_to_explicit_credit(uuid, uuid, uuid, text) from authenticated;
grant execute on function public.void_charge_to_explicit_credit(uuid, uuid, uuid, text) to service_role;

comment on function public.auto_apply_enrollment_credit_fifo(uuid, uuid, uuid, text) is
  'Consumes explicit enrollment credit against non-void charges in deterministic FIFO order. Non-cash and service-role only.';
