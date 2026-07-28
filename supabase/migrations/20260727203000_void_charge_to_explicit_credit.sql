-- Void eligible charges without leaving implicit payment credit behind.
--
-- Payment allocations released from an eligible charge become explicit account
-- credit. Existing explicit credit applications are reopened instead of copied.
-- Paid monthly tuition and inscription charges remain protected.

alter table public.enrollment_credits
  drop constraint if exists enrollment_credits_source_workflow_check;

alter table public.enrollment_credits
  add constraint enrollment_credits_source_workflow_check check (
    source_workflow in (
      'eligible_payment_remainder',
      'reassignment_remainder',
      'refund_to_credit',
      'manual_admin_credit',
      'legacy_review_conversion',
      'charge_void'
    )
  );

create or replace function public.void_charge_to_explicit_credit(
  p_enrollment_id uuid,
  p_charge_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns table(
  released_payment_amount numeric,
  reopened_credit_amount numeric,
  created_credit_count integer
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

  select e.campus_id
  into v_campus_id
  from public.enrollments e
  where e.id = p_enrollment_id
  for update;

  if not found then
    raise exception 'enrollment_not_found';
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
       exists (
         select 1
         from public.payment_allocations pa
         where pa.charge_id = p_charge_id
       )
       or exists (
         select 1
         from public.enrollment_credit_applications eca
         where eca.charge_id = p_charge_id
       )
     )
  then
    raise exception 'protected_paid_charge';
  end if;

  for v_payment_allocation in
    select pa.id, pa.payment_id, pa.amount, p.status as payment_status
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

  released_payment_amount := v_payment_total;
  reopened_credit_amount := v_reopened_total;
  created_credit_count := v_credit_count;
  return next;
end;
$$;

revoke execute on function public.void_charge_to_explicit_credit(uuid, uuid, uuid, text) from public;
revoke execute on function public.void_charge_to_explicit_credit(uuid, uuid, uuid, text) from anon;
revoke execute on function public.void_charge_to_explicit_credit(uuid, uuid, uuid, text) from authenticated;
grant execute on function public.void_charge_to_explicit_credit(uuid, uuid, uuid, text) to service_role;
