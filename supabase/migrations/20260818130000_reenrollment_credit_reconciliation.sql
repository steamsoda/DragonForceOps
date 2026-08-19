-- Reconcile historical account credit before a player is re-enrolled.
--
-- This function only normalizes existing value inside an ended/cancelled
-- enrollment. It never creates payments, cash movements, receipts, charges,
-- balance adjustments, or enrollment rows.

create or replace function public.reconcile_returning_enrollment_credit_fifo(
  p_enrollment_id uuid,
  p_actor_id uuid
)
returns table(
  legacy_applied_amount numeric,
  legacy_allocation_count integer,
  explicit_applied_amount numeric,
  explicit_application_count integer,
  remaining_legacy_credit_amount numeric,
  remaining_explicit_credit_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.enrollments%rowtype;
  v_payment record;
  v_charge record;
  v_credit record;
  v_apply numeric(12,2);
  v_payment_remaining numeric(12,2);
  v_charge_remaining numeric(12,2);
  v_credit_remaining numeric(12,2);
  v_legacy_applied numeric(12,2) := 0;
  v_legacy_count integer := 0;
  v_explicit_applied numeric(12,2) := 0;
  v_explicit_count integer := 0;
  v_application_key uuid := gen_random_uuid();
begin
  if p_enrollment_id is null or p_actor_id is null then
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

  if v_enrollment.status not in ('ended', 'cancelled') then
    raise exception 'historical_enrollment_required';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_actor_id) then
    raise exception 'actor_not_found';
  end if;

  -- Serialize payment, charge, and credit changes for this historical account.
  perform 1
  from public.payments p
  where p.enrollment_id = p_enrollment_id
  order by p.paid_at, p.created_at, p.id
  for update;

  perform 1
  from public.charges c
  where c.enrollment_id = p_enrollment_id
  order by coalesce(c.due_date, c.created_at::date), c.created_at, c.id
  for update;

  perform 1
  from public.enrollment_credits ec
  where ec.enrollment_id = p_enrollment_id
  order by ec.created_at, ec.id
  for update;

  -- Legacy implicit credit is a posted, non-refunded payment remainder that is
  -- not already represented by payment allocations, explicit credit, or a
  -- charge-level cash refund. Allocate that remainder FIFO to old live charges.
  for v_payment in
    select
      p.id,
      greatest(
        p.amount
          - coalesce((select sum(pa.amount) from public.payment_allocations pa where pa.payment_id = p.id), 0)
          - coalesce((select sum(ec.original_amount) from public.enrollment_credits ec where ec.source_payment_id = p.id and ec.status <> 'void'), 0)
          - coalesce((select sum(crs.amount) from public.charge_cash_refund_sources crs where crs.payment_id = p.id), 0),
        0
      )::numeric(12,2) as available_amount
    from public.payments p
    where p.enrollment_id = p_enrollment_id
      and p.status = 'posted'
      and not exists (
        select 1 from public.payment_refunds pr where pr.payment_id = p.id
      )
    order by p.paid_at, p.created_at, p.id
  loop
    v_payment_remaining := v_payment.available_amount;

    while v_payment_remaining > 0.009 loop
      select
        c.id,
        greatest(
          c.amount
            - coalesce((select sum(pa.amount) from public.payment_allocations pa where pa.charge_id = c.id), 0)
            - coalesce((select sum(eca.amount) from public.enrollment_credit_applications eca where eca.charge_id = c.id), 0),
          0
        )::numeric(12,2) as pending_amount
      into v_charge
      from public.charges c
      where c.enrollment_id = p_enrollment_id
        and c.status <> 'void'
        and greatest(
          c.amount
            - coalesce((select sum(pa.amount) from public.payment_allocations pa where pa.charge_id = c.id), 0)
            - coalesce((select sum(eca.amount) from public.enrollment_credit_applications eca where eca.charge_id = c.id), 0),
          0
        ) > 0.009
      order by coalesce(c.due_date, c.created_at::date), c.created_at, c.id
      limit 1;

      if not found then
        exit;
      end if;

      v_apply := round(least(v_payment_remaining, v_charge.pending_amount), 2);
      if v_apply <= 0 then
        exit;
      end if;

      insert into public.payment_allocations (payment_id, charge_id, amount)
      values (v_payment.id, v_charge.id, v_apply)
      on conflict (payment_id, charge_id)
      do update set amount = public.payment_allocations.amount + excluded.amount;

      v_legacy_applied := round(v_legacy_applied + v_apply, 2);
      v_legacy_count := v_legacy_count + 1;
      v_payment_remaining := round(v_payment_remaining - v_apply, 2);
    end loop;
  end loop;

  -- Apply explicit ledger credit after legacy payment remainders, again using
  -- oldest charge and oldest credit first. Unused credit remains traceable.
  loop
    select
      c.id,
      greatest(
        c.amount
          - coalesce((select sum(pa.amount) from public.payment_allocations pa where pa.charge_id = c.id), 0)
          - coalesce((select sum(eca.amount) from public.enrollment_credit_applications eca where eca.charge_id = c.id), 0),
        0
      )::numeric(12,2) as pending_amount
    into v_charge
    from public.charges c
    where c.enrollment_id = p_enrollment_id
      and c.status <> 'void'
      and greatest(
        c.amount
          - coalesce((select sum(pa.amount) from public.payment_allocations pa where pa.charge_id = c.id), 0)
          - coalesce((select sum(eca.amount) from public.enrollment_credit_applications eca where eca.charge_id = c.id), 0),
        0
      ) > 0.009
    order by coalesce(c.due_date, c.created_at::date), c.created_at, c.id
    limit 1;

    exit when not found;
    v_charge_remaining := v_charge.pending_amount;

    while v_charge_remaining > 0.009 loop
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

      exit when not found;
      v_credit_remaining := v_credit.available_amount;
      v_apply := round(least(v_credit_remaining, v_charge_remaining), 2);
      exit when v_apply <= 0;

      insert into public.enrollment_credit_applications (
        credit_id,
        charge_id,
        amount,
        applied_by,
        notes,
        application_key
      ) values (
        v_credit.id,
        v_charge.id,
        v_apply,
        p_actor_id,
        'Credito historico aplicado automaticamente antes del reingreso.',
        v_application_key
      );

      v_explicit_applied := round(v_explicit_applied + v_apply, 2);
      v_explicit_count := v_explicit_count + 1;
      v_charge_remaining := round(v_charge_remaining - v_apply, 2);

      if v_apply + 0.009 >= v_credit_remaining then
        update public.enrollment_credits
        set status = 'fully_used'
        where id = v_credit.id;
      end if;
    end loop;

    exit when v_charge_remaining > 0.009;
  end loop;

  legacy_applied_amount := v_legacy_applied;
  legacy_allocation_count := v_legacy_count;
  explicit_applied_amount := v_explicit_applied;
  explicit_application_count := v_explicit_count;
  remaining_legacy_credit_amount := coalesce((
    select sum(greatest(
      p.amount
        - coalesce((select sum(pa.amount) from public.payment_allocations pa where pa.payment_id = p.id), 0)
        - coalesce((select sum(ec.original_amount) from public.enrollment_credits ec where ec.source_payment_id = p.id and ec.status <> 'void'), 0)
        - coalesce((select sum(crs.amount) from public.charge_cash_refund_sources crs where crs.payment_id = p.id), 0),
      0
    ))
    from public.payments p
    where p.enrollment_id = p_enrollment_id
      and p.status = 'posted'
      and not exists (select 1 from public.payment_refunds pr where pr.payment_id = p.id)
  ), 0)::numeric(12,2);
  remaining_explicit_credit_amount := coalesce((
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

revoke execute on function public.reconcile_returning_enrollment_credit_fifo(uuid, uuid) from public;
revoke execute on function public.reconcile_returning_enrollment_credit_fifo(uuid, uuid) from anon;
revoke execute on function public.reconcile_returning_enrollment_credit_fifo(uuid, uuid) from authenticated;
grant execute on function public.reconcile_returning_enrollment_credit_fifo(uuid, uuid) to service_role;

comment on function public.reconcile_returning_enrollment_credit_fifo(uuid, uuid) is
  'Normalizes legacy and explicit credit FIFO inside an ended/cancelled enrollment before re-enrollment; creates no cash, payment, charge, or enrollment rows.';
