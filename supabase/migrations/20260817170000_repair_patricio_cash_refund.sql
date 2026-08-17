-- Repair Patricio Alejandro Garza Vazquez's August 10 cash refund.
--
-- The original tournament charge was annulled instead of cash-refunded, which
-- created explicit credit. A later -300 balance adjustment duplicated the
-- correction. This guarded repair preserves both original records, replaces
-- the incorrect credit/adjustment with an auditable charge-level cash refund,
-- and attributes the outflow to a labeled historical Contry correction session.

do $$
declare
  v_player_id constant uuid := 'bc9b07fc-67d0-4d25-9b2a-47b1a2ab9ad3';
  v_enrollment_id constant uuid := '411e2f66-6820-4287-a8ed-00eb110a2410';
  v_campus_id constant uuid := '632d04b0-ee85-4604-9af7-703b2dfb8b95';
  v_charge_id constant uuid := 'df9bb19e-467d-4a02-b095-6a2e734b090a';
  v_payment_id constant uuid := '13477b23-fa9c-49e0-a6ed-039a299da4a3';
  v_credit_id constant uuid := '3b195f20-a092-4fad-82d0-0f20962c863d';
  v_adjustment_id constant uuid := '47aa2d60-208e-4258-967f-96d4186c80a8';
  v_actor_id constant uuid := '464e98eb-5ee2-41fa-a4cf-cbad67c7e415';
  v_refunded_at constant timestamptz := '2026-08-10 17:00:00 America/Monterrey';
  v_session_id uuid := gen_random_uuid();
  v_refund_id uuid := gen_random_uuid();
  v_rows integer;
  v_balance numeric(12,2);
  v_total_charges numeric(12,2);
  v_total_payments numeric(12,2);
begin
  -- Preview and other databases intentionally no-op when this production
  -- enrollment is absent. If it exists, every audited fact must match.
  if not exists (
    select 1
    from public.enrollments e
    where e.id = v_enrollment_id
      and e.player_id = v_player_id
      and e.campus_id = v_campus_id
  ) then
    raise notice 'Patricio production enrollment not present; repair skipped.';
    return;
  end if;

  perform 1
  from public.enrollments e
  where e.id = v_enrollment_id
    and e.player_id = v_player_id
    and e.campus_id = v_campus_id
  for update;

  perform 1
  from public.charges c
  join public.charge_types ct on ct.id = c.charge_type_id
  where c.id = v_charge_id
    and c.enrollment_id = v_enrollment_id
    and c.status = 'void'
    and c.amount = 300
    and ct.code = 'tournament'
  for update of c;
  if not found then raise exception 'repair_guard_original_charge_mismatch'; end if;

  perform 1
  from public.payments p
  where p.id = v_payment_id
    and p.enrollment_id = v_enrollment_id
    and p.status = 'void'
    and p.amount = 300
    and p.method = 'stripe_360player'
  for update;
  if not found then raise exception 'repair_guard_original_payment_mismatch'; end if;

  perform 1
  from public.enrollment_credits ec
  where ec.id = v_credit_id
    and ec.enrollment_id = v_enrollment_id
    and ec.source_payment_id = v_payment_id
    and ec.source_charge_id = v_charge_id
    and ec.source_workflow = 'charge_void'
    and ec.status = 'open'
    and ec.original_amount = 300
  for update;
  if not found then raise exception 'repair_guard_credit_mismatch'; end if;

  if exists (
    select 1 from public.enrollment_credit_applications
    where credit_id = v_credit_id
  ) then
    raise exception 'repair_guard_credit_already_applied';
  end if;

  perform 1
  from public.charges c
  join public.charge_types ct on ct.id = c.charge_type_id
  where c.id = v_adjustment_id
    and c.enrollment_id = v_enrollment_id
    and c.status = 'posted'
    and c.amount = -300
    and ct.code = 'balance_adjustment'
  for update of c;
  if not found then raise exception 'repair_guard_adjustment_mismatch'; end if;

  if exists (
    select 1 from public.charge_cash_refunds where charge_id = v_charge_id
  ) then
    raise exception 'repair_guard_cash_refund_already_exists';
  end if;
  if exists (
    select 1 from public.payment_allocations
    where payment_id = v_payment_id or charge_id = v_charge_id
  ) then
    raise exception 'repair_guard_allocations_changed';
  end if;

  update public.charges
  set status = 'void', updated_at = now()
  where id = v_adjustment_id and status = 'posted';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'repair_adjustment_update_failed'; end if;

  update public.enrollment_credits
  set status = 'void',
      voided_by = v_actor_id,
      voided_at = now(),
      void_reason = 'Correccion: el cargo correspondia a un reembolso en efectivo del 10/08/2026.'
  where id = v_credit_id and status = 'open';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'repair_credit_update_failed'; end if;

  update public.payments
  set status = 'posted', updated_at = now()
  where id = v_payment_id and status = 'void';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'repair_payment_update_failed'; end if;

  insert into public.cash_sessions (
    id, campus_id, opened_at, closed_at, opened_by, closed_by,
    opening_cash, closing_cash_reported, status, notes, created_at, updated_at
  ) values (
    v_session_id, v_campus_id,
    v_refunded_at - interval '1 minute', v_refunded_at + interval '1 minute',
    v_actor_id, v_actor_id, 300, 0, 'closed',
    'Correccion historica: reembolso en efectivo de Patricio Alejandro Garza Vazquez del 10/08/2026.',
    now(), now()
  );

  insert into public.charge_cash_refunds (
    id, charge_id, enrollment_id, primary_payment_id, amount,
    reopened_credit_amount, currency, refund_method, refunded_at,
    operator_campus_id, cash_session_id, reason, notes,
    charge_breakdown, created_by, created_at
  ) values (
    v_refund_id, v_charge_id, v_enrollment_id, v_payment_id, 300,
    0, 'MXN', 'cash', v_refunded_at,
    v_campus_id, v_session_id,
    'Reembolso en efectivo corregido despues de anulacion operativa incorrecta.',
    'Front Desk entrego $300 MXN en efectivo. La anulacion original genero credito por error; esta reparacion conserva el historial y registra la salida real.',
    jsonb_build_array(jsonb_build_object(
      'chargeId', v_charge_id,
      'description', 'Superliga Regia 17 Edicion',
      'chargeTypeCode', 'tournament',
      'amount', 300,
      'originalChargeAmount', 300
    )),
    v_actor_id, now()
  );

  insert into public.charge_cash_refund_sources (
    refund_id, payment_id, amount, created_at
  ) values (v_refund_id, v_payment_id, 300, now());

  insert into public.cash_session_entries (
    cash_session_id, payment_id, charge_cash_refund_id, entry_type,
    amount, notes, created_by, created_at
  ) values (
    v_session_id, v_payment_id, v_refund_id, 'manual_out', -300,
    'Reembolso en efectivo: Superliga Regia 17 Edicion. Correccion historica del 10/08/2026.',
    v_actor_id, v_refunded_at
  );

  update public.audit_logs
  set reversed_at = now(), reversed_by = v_actor_id
  where id in (10327, 10329) and reversed_at is null;

  insert into public.audit_logs (
    event_at, actor_user_id, action, table_name, record_id,
    before_data, after_data, request_id
  ) values (
    now(), v_actor_id, 'account.repair.cash_refund', 'charge_cash_refunds', v_refund_id,
    jsonb_build_object(
      'incorrectCreditId', v_credit_id,
      'incorrectBalanceAdjustmentId', v_adjustment_id,
      'originalChargeId', v_charge_id,
      'originalPaymentId', v_payment_id
    ),
    jsonb_build_object(
      'cashRefundId', v_refund_id,
      'cashSessionId', v_session_id,
      'refundAmount', 300,
      'refundedAt', v_refunded_at,
      'creditStatus', 'void',
      'balanceAdjustmentStatus', 'void',
      'paymentStatus', 'posted'
    ),
    'repair-patricio-cash-refund-20260817'
  );

  select total_charges, total_payments, balance
  into v_total_charges, v_total_payments, v_balance
  from public.v_enrollment_balances
  where enrollment_id = v_enrollment_id;

  if v_balance <> 0 or v_total_charges <> 5500 or v_total_payments <> 5500 then
    raise exception 'repair_final_balance_mismatch charges=% payments=% balance=%',
      v_total_charges, v_total_payments, v_balance;
  end if;
  if exists (
    select 1 from public.enrollment_credits
    where enrollment_id = v_enrollment_id and status = 'open'
  ) then
    raise exception 'repair_final_open_credit_remains';
  end if;
end
$$;
