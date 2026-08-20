-- Guarded production repair for two Front Desk credit/tournament incidents.
-- Preview safely skips these blocks because the production enrollment IDs do not exist.

do $$
declare
  v_actor_id uuid := '7af8a854-f9de-4c20-ad79-176571433331';
  v_enrollment_id uuid := '148ae4f3-6ee1-4416-83f4-c1f73239ff3a';
  v_j5_charge_id uuid := 'f2f30c55-2057-4d65-92a9-9a3aa51cdd70';
  v_new_payment_id uuid := 'd0b73da1-2177-445d-8a02-4872ea2c5ec9';
  v_new_allocation_id uuid;
  v_credit_id uuid := 'ff800d61-48f4-41af-af25-73c22ff96747';
  v_request_id text := 'repair.reynold-credit-j5.20260819';
  v_balance numeric(12,2);
begin
  if not exists (select 1 from public.enrollments where id = v_enrollment_id) then
    return;
  end if;
  if exists (select 1 from public.audit_logs where request_id = v_request_id) then
    return;
  end if;

  perform 1 from public.enrollments where id = v_enrollment_id for update;
  perform 1 from public.payments
  where id in ('004c16d4-3a2c-4f9e-bbba-dc0636d8153b', v_new_payment_id)
  order by id for update;
  perform 1 from public.charges where id = v_j5_charge_id for update;
  perform 1 from public.enrollment_credits where id = v_credit_id for update;

  if not exists (
    select 1 from public.payments
    where id = v_new_payment_id and enrollment_id = v_enrollment_id
      and status = 'posted' and amount = 700 and method = 'cash'
  ) then raise exception 'reynold_new_payment_state_changed'; end if;
  if not exists (
    select 1 from public.charges
    where id = v_j5_charge_id and enrollment_id = v_enrollment_id
      and status <> 'void' and amount = 1000
  ) then raise exception 'reynold_j5_charge_state_changed'; end if;
  if (select coalesce(sum(amount), 0) from public.payment_allocations where charge_id = v_j5_charge_id) <> 700 then
    raise exception 'reynold_j5_direct_funding_changed';
  end if;
  if (select coalesce(sum(amount), 0) from public.enrollment_credit_applications where charge_id = v_j5_charge_id) <> 300 then
    raise exception 'reynold_j5_credit_funding_changed';
  end if;
  if not exists (
    select 1 from public.enrollment_credits
    where id = v_credit_id and enrollment_id = v_enrollment_id
      and status = 'fully_used' and original_amount = 300
  ) then raise exception 'reynold_credit_state_changed'; end if;

  select id into strict v_new_allocation_id
  from public.payment_allocations
  where payment_id = v_new_payment_id and charge_id = v_j5_charge_id and amount = 400;

  delete from public.enrollment_credit_applications where credit_id = v_credit_id;
  update public.enrollment_credits
  set status = 'void', voided_by = v_actor_id, voided_at = now(),
      void_reason = 'Duplicate explicit credit: source payment had already funded J5 directly.'
  where id = v_credit_id;
  update public.payment_allocations set amount = 700 where id = v_new_allocation_id;

  if (select coalesce(sum(amount), 0) from public.payment_allocations where charge_id = v_j5_charge_id) <> 1000 then
    raise exception 'reynold_j5_repair_failed';
  end if;
  if exists (select 1 from public.enrollment_credit_applications where credit_id = v_credit_id) then
    raise exception 'reynold_credit_application_not_removed';
  end if;
  select balance into strict v_balance from public.v_enrollment_balances where enrollment_id = v_enrollment_id;
  if v_balance <> 0 then raise exception 'reynold_balance_not_zero:%', v_balance; end if;

  perform public.sync_paid_tournament_entries_for_charges(v_enrollment_id, array[v_j5_charge_id]);
  perform public.process_competition_roster_sync_queue(50, v_enrollment_id);

  insert into public.audit_logs (
    actor_user_id, actor_email, action, table_name, record_id, after_data, request_id
  ) values (
    v_actor_id, 'javierg@dragonforcemty.com', 'finance.credit_checkout_repaired',
    'enrollments', v_enrollment_id,
    jsonb_build_object(
      'player', 'Reynold Elias Villarreal',
      'j5_charge_id', v_j5_charge_id,
      'direct_payment_funding', 1000,
      'voided_duplicate_credit_id', v_credit_id,
      'canonical_balance', v_balance
    ),
    v_request_id
  );
end
$$;

do $$
declare
  v_actor_id uuid := '7af8a854-f9de-4c20-ad79-176571433331';
  v_enrollment_id uuid := '4f8e7f4e-a793-4a05-8a3d-e51b845fa132';
  v_j5_charge_id uuid := '2dffda3b-ecc5-495f-9839-545862c85015';
  v_uniform_charge_id uuid := 'e1031460-510d-4cf7-b83b-56703b08c958';
  v_old_payment_id uuid := '3f070dbe-cfb3-4e43-9192-a8efb0e25eed';
  v_360_payment_id uuid := '344bdeb3-b534-4675-ae21-eb8a5e64a512';
  v_new_payment_id uuid := '3de38226-b1d8-4701-84fa-3e18db4407c6';
  v_credit_id uuid := 'd4717b75-1cd1-40d2-a4e4-fdc7e72cb076';
  v_corrective_charge_id uuid := '0e2c82b0-1c95-4d51-a6b8-a0910ce1d350';
  v_corrective_type_id uuid;
  v_request_id text := 'repair.alejandro-credit-j5-uniform.20260819';
  v_balance numeric(12,2);
begin
  if not exists (select 1 from public.enrollments where id = v_enrollment_id) then
    return;
  end if;
  if exists (select 1 from public.audit_logs where request_id = v_request_id) then
    return;
  end if;

  perform 1 from public.enrollments where id = v_enrollment_id for update;
  perform 1 from public.payments
  where id in (v_old_payment_id, v_360_payment_id, v_new_payment_id)
  order by id for update;
  perform 1 from public.charges
  where id in (v_j5_charge_id, v_uniform_charge_id)
  order by id for update;
  perform 1 from public.enrollment_credits where id = v_credit_id for update;

  if not exists (
    select 1 from public.payments
    where id = v_old_payment_id and enrollment_id = v_enrollment_id
      and status = 'posted' and amount = 2000
  ) then raise exception 'alejandro_old_payment_state_changed'; end if;
  if not exists (
    select 1 from public.payments
    where id = v_360_payment_id and enrollment_id = v_enrollment_id
      and status = 'posted' and amount = 300
  ) then raise exception 'alejandro_360_payment_state_changed'; end if;
  if not exists (
    select 1 from public.payments
    where id = v_new_payment_id and enrollment_id = v_enrollment_id
      and status = 'posted' and amount = 1300 and method = 'card'
  ) then raise exception 'alejandro_new_payment_state_changed'; end if;
  if (select coalesce(sum(amount), 0) from public.payment_allocations where payment_id = v_new_payment_id) <> 0 then
    raise exception 'alejandro_new_payment_already_allocated';
  end if;
  if (select coalesce(sum(amount), 0) from public.payment_allocations where charge_id = v_j5_charge_id) <> 700 then
    raise exception 'alejandro_j5_direct_funding_changed';
  end if;
  if (select coalesce(sum(amount), 0) from public.enrollment_credit_applications where charge_id = v_j5_charge_id) <> 300 then
    raise exception 'alejandro_j5_credit_funding_changed';
  end if;
  if (select coalesce(sum(amount), 0) from public.payment_allocations where charge_id = v_uniform_charge_id) <> 600 then
    raise exception 'alejandro_uniform_funding_changed';
  end if;
  if not exists (
    select 1 from public.enrollment_credits
    where id = v_credit_id and enrollment_id = v_enrollment_id
      and status = 'fully_used' and original_amount = 300
  ) then raise exception 'alejandro_credit_state_changed'; end if;
  select balance into strict v_balance from public.v_enrollment_balances where enrollment_id = v_enrollment_id;
  if v_balance <> -1200 then raise exception 'alejandro_legacy_balance_changed:%', v_balance; end if;

  select id into strict v_corrective_type_id
  from public.charge_types where code = 'corrective_charge' and is_active = true;

  delete from public.payment_allocations
  where (payment_id = v_old_payment_id and charge_id in (v_j5_charge_id, v_uniform_charge_id))
     or (payment_id = v_360_payment_id and charge_id = v_j5_charge_id);

  insert into public.charges (
    id, enrollment_id, charge_type_id, description, amount, currency, status,
    due_date, created_by, created_at, updated_at
  ) values (
    v_corrective_charge_id, v_enrollment_id, v_corrective_type_id,
    'Correccion de credito legado confirmado', 1200, 'MXN', 'pending',
    current_date, v_actor_id, now(), now()
  );

  insert into public.payment_allocations (payment_id, charge_id, amount) values
    (v_new_payment_id, v_j5_charge_id, 700),
    (v_new_payment_id, v_uniform_charge_id, 600),
    (v_old_payment_id, v_corrective_charge_id, 900),
    (v_360_payment_id, v_corrective_charge_id, 300);

  if (select coalesce(sum(amount), 0) from public.payment_allocations where payment_id = v_new_payment_id) <> 1300 then
    raise exception 'alejandro_new_payment_repair_failed';
  end if;
  if (select coalesce(sum(amount), 0) from public.payment_allocations where charge_id = v_j5_charge_id) <> 700 then
    raise exception 'alejandro_j5_repair_failed';
  end if;
  if (select coalesce(sum(amount), 0) from public.enrollment_credit_applications where charge_id = v_j5_charge_id) <> 300 then
    raise exception 'alejandro_credit_application_changed';
  end if;
  if (select coalesce(sum(amount), 0) from public.payment_allocations where charge_id = v_uniform_charge_id) <> 600 then
    raise exception 'alejandro_uniform_repair_failed';
  end if;
  if (select coalesce(sum(amount), 0) from public.payment_allocations where charge_id = v_corrective_charge_id) <> 1200 then
    raise exception 'alejandro_corrective_charge_not_funded';
  end if;
  select balance into strict v_balance from public.v_enrollment_balances where enrollment_id = v_enrollment_id;
  if v_balance <> 0 then raise exception 'alejandro_balance_not_zero:%', v_balance; end if;

  perform public.sync_paid_tournament_entries_for_charges(v_enrollment_id, array[v_j5_charge_id]);
  perform public.process_competition_roster_sync_queue(50, v_enrollment_id);

  insert into public.audit_logs (
    actor_user_id, actor_email, action, table_name, record_id, after_data, request_id
  ) values (
    v_actor_id, 'javierg@dragonforcemty.com', 'finance.legacy_credit_normalized',
    'enrollments', v_enrollment_id,
    jsonb_build_object(
      'player', 'Alejandro Leon Pinales',
      'confirmed_intent', '1300 card payment covers J5 1000 and goalkeeper uniform 600 using 300 Superliga credit',
      'j5_direct_payment_funding', 700,
      'j5_credit_funding', 300,
      'uniform_direct_payment_funding', 600,
      'corrective_charge_id', v_corrective_charge_id,
      'removed_invalid_legacy_credit', 1200,
      'canonical_balance', v_balance
    ),
    v_request_id
  );
end
$$;
