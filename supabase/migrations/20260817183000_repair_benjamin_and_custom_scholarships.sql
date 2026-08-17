-- Guarded production repairs approved on 2026-08-17.
--
-- 1. Normalize Benjamin's J5 payment coverage by removing a duplicated
--    charge-void credit application and using the remaining amount of the
--    payment that actually purchased J5.
-- 2. Assign fixed $500 monthly scholarships to Jesus and Yazbeck without
--    rewriting their already-issued August tuition charges.

do $$
declare
  v_benjamin_player_id constant uuid := '3f1e5612-b518-4463-a1d8-e4c4c091dc60';
  v_benjamin_enrollment_id constant uuid := '8793d926-3a68-49c2-a62a-aa8c116c6355';
  v_benjamin_j5_charge_id constant uuid := '72e2c7e4-3cd9-45b9-9060-c6cbfeba4e30';
  v_benjamin_void_payment_id constant uuid := '165e9b8f-3fb3-43a6-a2cb-8f70c51ad455';
  v_benjamin_j5_payment_id constant uuid := '1299d5c0-c88d-43f4-a07a-8fdf41993f37';
  v_benjamin_credit_id constant uuid := '8f03871d-313c-4a36-9418-53509e3b8d80';
  v_benjamin_credit_application_id constant uuid := '92774ca0-f2d3-4253-8563-6e0bc58f82f9';
  v_actor_id constant uuid := '7af8a854-f9de-4c20-ad79-176571433331';
  v_jesus_player_id constant uuid := 'a747b692-67f1-431c-91e1-3fb06d63017d';
  v_jesus_enrollment_id constant uuid := '33ed7117-9ac5-420a-89f3-0844255680ea';
  v_jesus_august_charge_id constant uuid := '5e174cdc-60d2-42fb-922e-0e94a02ccb2c';
  v_yazbeck_player_id constant uuid := '7d2b6477-c333-4397-8a12-abcdeb62bc44';
  v_yazbeck_enrollment_id constant uuid := '78931921-90a1-4441-9dfc-3df3a9d75fb0';
  v_yazbeck_august_charge_id constant uuid := 'a2060e56-7f0e-497a-ab12-3cfdf580759a';
  v_rows integer;
  v_balance numeric(12,2);
begin
  -- Preview and unrelated databases intentionally skip production-only rows.
  if exists (
    select 1
    from public.enrollments e
    where e.id = v_benjamin_enrollment_id
      and e.player_id = v_benjamin_player_id
  ) then
    perform 1
    from public.enrollments e
    where e.id = v_benjamin_enrollment_id
      and e.player_id = v_benjamin_player_id
    for update;

    perform 1
    from public.charges c
    join public.products p on p.id = c.product_id
    where c.id = v_benjamin_j5_charge_id
      and c.enrollment_id = v_benjamin_enrollment_id
      and c.amount = 1000
      and c.status = 'pending'
      and p.name = 'J5 San Pedro Agosto 2026'
    for update of c;
    if not found then raise exception 'repair_benjamin_j5_charge_mismatch'; end if;

    perform 1
    from public.payments p
    where p.id = v_benjamin_void_payment_id
      and p.enrollment_id = v_benjamin_enrollment_id
      and p.status = 'posted'
      and p.amount = 300
    for update;
    if not found then raise exception 'repair_benjamin_void_payment_mismatch'; end if;

    perform 1
    from public.payments p
    where p.id = v_benjamin_j5_payment_id
      and p.enrollment_id = v_benjamin_enrollment_id
      and p.status = 'posted'
      and p.amount = 700
    for update;
    if not found then raise exception 'repair_benjamin_j5_payment_mismatch'; end if;

    perform 1
    from public.payment_allocations pa
    where pa.payment_id = v_benjamin_void_payment_id
      and pa.charge_id = v_benjamin_j5_charge_id
      and pa.amount = 300
    for update;
    if not found then raise exception 'repair_benjamin_first_allocation_mismatch'; end if;

    perform 1
    from public.payment_allocations pa
    where pa.payment_id = v_benjamin_j5_payment_id
      and pa.charge_id = v_benjamin_j5_charge_id
      and pa.amount = 400
    for update;
    if not found then raise exception 'repair_benjamin_second_allocation_mismatch'; end if;

    perform 1
    from public.enrollment_credits ec
    where ec.id = v_benjamin_credit_id
      and ec.enrollment_id = v_benjamin_enrollment_id
      and ec.source_payment_id = v_benjamin_void_payment_id
      and ec.source_workflow = 'charge_void'
      and ec.original_amount = 300
      and ec.status = 'fully_used'
    for update;
    if not found then raise exception 'repair_benjamin_credit_mismatch'; end if;

    perform 1
    from public.enrollment_credit_applications eca
    where eca.id = v_benjamin_credit_application_id
      and eca.credit_id = v_benjamin_credit_id
      and eca.charge_id = v_benjamin_j5_charge_id
      and eca.amount = 300
    for update;
    if not found then raise exception 'repair_benjamin_credit_application_mismatch'; end if;

    delete from public.enrollment_credit_applications
    where id = v_benjamin_credit_application_id;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'repair_benjamin_credit_application_delete_failed'; end if;

    update public.enrollment_credits
    set status = 'void',
        voided_by = v_actor_id,
        voided_at = now(),
        void_reason = 'Correccion: el pago fuente ya cubre directamente J5; el credito duplicaba esos mismos $300.'
    where id = v_benjamin_credit_id
      and status = 'fully_used';
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'repair_benjamin_credit_void_failed'; end if;

    update public.payment_allocations
    set amount = 700
    where payment_id = v_benjamin_j5_payment_id
      and charge_id = v_benjamin_j5_charge_id
      and amount = 400;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'repair_benjamin_allocation_update_failed'; end if;

    if (
      select coalesce(sum(pa.amount), 0)
      from public.payment_allocations pa
      where pa.charge_id = v_benjamin_j5_charge_id
    ) <> 1000 then
      raise exception 'repair_benjamin_j5_not_fully_allocated';
    end if;
    if exists (
      select 1
      from public.enrollment_credits ec
      where ec.enrollment_id = v_benjamin_enrollment_id
        and ec.status <> 'void'
    ) then
      raise exception 'repair_benjamin_nonvoid_credit_remains';
    end if;

    select balance into v_balance
    from public.v_enrollment_balances
    where enrollment_id = v_benjamin_enrollment_id;
    if v_balance <> 0 then
      raise exception 'repair_benjamin_balance_mismatch balance=%', v_balance;
    end if;

    insert into public.audit_logs (
      event_at, actor_user_id, action, table_name, record_id,
      before_data, after_data, request_id
    ) values (
      now(), v_actor_id, 'account.repair.j5_credit_normalized', 'enrollments', v_benjamin_enrollment_id,
      jsonb_build_object(
        'j5PaymentAllocation', 400,
        'voidPaymentAllocation', 300,
        'creditApplication', 300,
        'creditId', v_benjamin_credit_id
      ),
      jsonb_build_object(
        'j5PaymentAllocation', 700,
        'voidPaymentAllocation', 300,
        'creditStatus', 'void',
        'j5DirectPaymentCoverage', 1000,
        'balance', v_balance
      ),
      'repair-benjamin-j5-credit-20260817'
    );
  end if;

  if exists (
    select 1 from public.enrollments
    where id = v_jesus_enrollment_id and player_id = v_jesus_player_id
  ) then
    perform 1
    from public.charges c
    join public.charge_types ct on ct.id = c.charge_type_id
    where c.id = v_jesus_august_charge_id
      and c.enrollment_id = v_jesus_enrollment_id
      and ct.code = 'monthly_tuition'
      and c.period_month = date '2026-08-01'
      and c.amount = 500
      and c.manual_price_override = true
      and (select coalesce(sum(pa.amount), 0) from public.payment_allocations pa where pa.charge_id = c.id) = 500
    for update of c;
    if not found then raise exception 'repair_jesus_august_charge_mismatch'; end if;

    update public.enrollments
    set scholarship_status = 'custom',
        custom_scholarship_amount = 500,
        has_scholarship = false,
        updated_at = now()
    where id = v_jesus_enrollment_id
      and player_id = v_jesus_player_id
      and scholarship_status = 'none'
      and custom_scholarship_amount is null;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'repair_jesus_scholarship_update_failed'; end if;

    insert into public.audit_logs (
      event_at, actor_user_id, action, table_name, record_id,
      before_data, after_data, request_id
    ) values (
      now(), v_actor_id, 'enrollment.scholarship_repaired', 'enrollments', v_jesus_enrollment_id,
      jsonb_build_object('scholarship_status', 'none', 'custom_scholarship_amount', null),
      jsonb_build_object(
        'scholarship_status', 'custom',
        'custom_scholarship_amount', 500,
        'augustChargePreserved', 500,
        'augustChargeFullyAllocated', true
      ),
      'repair-jesus-custom-scholarship-20260817'
    );
  end if;

  if exists (
    select 1 from public.enrollments
    where id = v_yazbeck_enrollment_id and player_id = v_yazbeck_player_id
  ) then
    perform 1
    from public.charges c
    join public.charge_types ct on ct.id = c.charge_type_id
    where c.id = v_yazbeck_august_charge_id
      and c.enrollment_id = v_yazbeck_enrollment_id
      and ct.code = 'monthly_tuition'
      and c.period_month = date '2026-08-01'
      and c.amount = 350
      and c.manual_price_override = false
      and not exists (select 1 from public.payment_allocations pa where pa.charge_id = c.id)
      and not exists (select 1 from public.enrollment_credit_applications eca where eca.charge_id = c.id)
    for update of c;
    if not found then raise exception 'repair_yazbeck_august_charge_mismatch'; end if;

    update public.enrollments
    set scholarship_status = 'custom',
        custom_scholarship_amount = 500,
        has_scholarship = false,
        updated_at = now()
    where id = v_yazbeck_enrollment_id
      and player_id = v_yazbeck_player_id
      and scholarship_status = 'none'
      and custom_scholarship_amount is null;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'repair_yazbeck_scholarship_update_failed'; end if;

    if (select amount from public.charges where id = v_yazbeck_august_charge_id) <> 350 then
      raise exception 'repair_yazbeck_august_charge_changed';
    end if;

    insert into public.audit_logs (
      event_at, actor_user_id, action, table_name, record_id,
      before_data, after_data, request_id
    ) values (
      now(), v_actor_id, 'enrollment.scholarship_repaired', 'enrollments', v_yazbeck_enrollment_id,
      jsonb_build_object('scholarship_status', 'none', 'custom_scholarship_amount', null),
      jsonb_build_object(
        'scholarship_status', 'custom',
        'custom_scholarship_amount', 500,
        'augustChargePreserved', 350,
        'effectiveForGeneratedChargesFrom', '2026-09-01'
      ),
      'repair-yazbeck-custom-scholarship-20260817'
    );
  end if;
end
$$;
