-- Guarded production repairs approved on 2026-08-17.
--
-- Abraham paid July and August tuition together in cash on 2026-07-27, but
-- only $400 of August and $900 of the $1,200 receipt were recorded.
--
-- Xavier had $300 from an older cash payment converted to explicit credit and
-- applied to August. Front Desk collected the remaining $400 in cash on
-- 2026-08-10 at the time the partial coverage was applied. Normalize the $300
-- to a direct allocation, void the credit, and reconstruct the missing payment.

do $$
declare
  v_actor_id constant uuid := '7af8a854-f9de-4c20-ad79-176571433331';
  v_campus_id constant uuid := 'bd879be2-40c1-405f-893e-02ede605a927';
  v_cash_session_id constant uuid := '7f9f4537-5113-402a-9576-afb911b85609';

  v_abraham_player_id constant uuid := '36a04bc4-d63e-4233-b7f0-12157fb25cca';
  v_abraham_enrollment_id constant uuid := '83f17fb7-9e3f-4698-9033-02372f3d6bb4';
  v_abraham_payment_id constant uuid := '2be99006-4567-4b02-8a38-a46d9ef15208';
  v_abraham_august_charge_id constant uuid := 'cb2d9207-0651-4afe-8533-1470b8caf506';
  v_abraham_august_allocation_id constant uuid := '36fa7586-6599-4e86-9a76-ec5c89338a11';
  v_abraham_cash_entry_id constant uuid := '10e7db56-490a-46c4-9699-c4a31c999865';

  v_xavier_player_id constant uuid := '4d74d999-721c-4bc9-b2af-2a928c1e4175';
  v_xavier_enrollment_id constant uuid := '36ce6d01-c17b-4965-a573-51c12e7e7e8a';
  v_xavier_source_payment_id constant uuid := '705826f0-dd58-4980-b2f9-e0bb25c92eb6';
  v_xavier_august_charge_id constant uuid := 'e5f7395e-8d97-4a2c-a79a-e8fc85a0bd66';
  v_xavier_credit_id constant uuid := 'a12a2a24-1428-4acc-be02-b5e27c3aabc3';
  v_xavier_credit_application_id constant uuid := '21898239-d154-409e-bc36-408c0aa6904c';
  v_xavier_paid_at constant timestamptz := '2026-08-10 18:32:34.044 America/Monterrey';
  v_xavier_payment_id uuid := gen_random_uuid();
  v_rows integer;
  v_balance numeric(12,2);
  v_total_charges numeric(12,2);
  v_total_payments numeric(12,2);
begin
  -- Preview and unrelated databases intentionally skip production-only rows.
  if exists (
    select 1
    from public.enrollments e
    where e.id = v_abraham_enrollment_id
      and e.player_id = v_abraham_player_id
      and e.campus_id = v_campus_id
  ) then
    perform 1
    from public.enrollments e
    where e.id = v_abraham_enrollment_id
      and e.player_id = v_abraham_player_id
      and e.campus_id = v_campus_id
    for update;

    perform 1
    from public.payments p
    where p.id = v_abraham_payment_id
      and p.enrollment_id = v_abraham_enrollment_id
      and p.amount = 900
      and p.method = 'cash'
      and p.status = 'posted'
      and p.paid_at = timestamptz '2026-07-27 22:35:59.917+00'
      and p.folio = 'LINDA_VISTA-202607-00467'
      and p.operator_campus_id = v_campus_id
    for update;
    if not found then raise exception 'repair_abraham_payment_mismatch'; end if;

    perform 1
    from public.charges c
    join public.charge_types ct on ct.id = c.charge_type_id
    where c.id = v_abraham_august_charge_id
      and c.enrollment_id = v_abraham_enrollment_id
      and c.amount = 700
      and c.period_month = date '2026-08-01'
      and ct.code = 'monthly_tuition'
    for update of c;
    if not found then raise exception 'repair_abraham_august_charge_mismatch'; end if;

    perform 1
    from public.payment_allocations pa
    where pa.id = v_abraham_august_allocation_id
      and pa.payment_id = v_abraham_payment_id
      and pa.charge_id = v_abraham_august_charge_id
      and pa.amount = 400
    for update;
    if not found then raise exception 'repair_abraham_allocation_mismatch'; end if;

    perform 1
    from public.cash_session_entries cse
    join public.cash_sessions cs on cs.id = cse.cash_session_id
    where cse.id = v_abraham_cash_entry_id
      and cse.cash_session_id = v_cash_session_id
      and cse.payment_id = v_abraham_payment_id
      and cse.entry_type = 'payment_in'
      and cse.amount = 900
      and cs.campus_id = v_campus_id
      and cs.status = 'open'
    for update of cse;
    if not found then raise exception 'repair_abraham_cash_entry_mismatch'; end if;

    if exists (
      select 1 from public.enrollment_credits
      where enrollment_id = v_abraham_enrollment_id and status <> 'void'
    ) then
      raise exception 'repair_abraham_unexpected_credit';
    end if;

    update public.payments
    set amount = 1200,
        notes = 'Correccion auditada: pago en efectivo de mensualidades Julio y Agosto 2026.',
        updated_at = now()
    where id = v_abraham_payment_id and amount = 900;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'repair_abraham_payment_update_failed'; end if;

    update public.payment_allocations
    set amount = 700
    where id = v_abraham_august_allocation_id and amount = 400;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'repair_abraham_allocation_update_failed'; end if;

    update public.cash_session_entries
    set amount = 1200,
        notes = 'Correccion auditada: recibo en efectivo real de $1,200 para Julio y Agosto 2026.'
    where id = v_abraham_cash_entry_id and amount = 900;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'repair_abraham_cash_entry_update_failed'; end if;

    if (
      select coalesce(sum(pa.amount), 0)
      from public.payment_allocations pa
      where pa.charge_id = v_abraham_august_charge_id
    ) <> 700 then
      raise exception 'repair_abraham_august_not_fully_allocated';
    end if;

    select total_charges, total_payments, balance
    into v_total_charges, v_total_payments, v_balance
    from public.v_enrollment_balances
    where enrollment_id = v_abraham_enrollment_id;
    if v_total_charges <> 4100 or v_total_payments <> 4100 or v_balance <> 0 then
      raise exception 'repair_abraham_final_balance_mismatch charges=% payments=% balance=%',
        v_total_charges, v_total_payments, v_balance;
    end if;

    insert into public.audit_logs (
      event_at, actor_user_id, action, table_name, record_id,
      before_data, after_data, request_id
    ) values (
      now(), v_actor_id, 'account.repair.payment_amount_and_allocation', 'payments', v_abraham_payment_id,
      jsonb_build_object(
        'paymentAmount', 900,
        'augustAllocation', 400,
        'cashSessionEntryAmount', 900,
        'balance', 300
      ),
      jsonb_build_object(
        'paymentAmount', 1200,
        'julyAllocation', 500,
        'augustAllocation', 700,
        'cashSessionEntryAmount', 1200,
        'balance', 0
      ),
      'repair-abraham-august-tuition-20260817'
    );
  end if;

  if exists (
    select 1
    from public.enrollments e
    where e.id = v_xavier_enrollment_id
      and e.player_id = v_xavier_player_id
      and e.campus_id = v_campus_id
  ) then
    perform 1
    from public.enrollments e
    where e.id = v_xavier_enrollment_id
      and e.player_id = v_xavier_player_id
      and e.campus_id = v_campus_id
    for update;

    perform 1
    from public.payments p
    where p.id = v_xavier_source_payment_id
      and p.enrollment_id = v_xavier_enrollment_id
      and p.amount = 700
      and p.method = 'cash'
      and p.status = 'posted'
      and p.paid_at = timestamptz '2026-04-07 00:09:36.220+00'
      and p.folio = 'LINDA_VISTA-202604-00041'
      and (
        select coalesce(sum(pa.amount), 0)
        from public.payment_allocations pa
        where pa.payment_id = p.id
      ) = 400
    for update;
    if not found then raise exception 'repair_xavier_source_payment_mismatch'; end if;

    perform 1
    from public.charges c
    join public.charge_types ct on ct.id = c.charge_type_id
    where c.id = v_xavier_august_charge_id
      and c.enrollment_id = v_xavier_enrollment_id
      and c.amount = 700
      and c.period_month = date '2026-08-01'
      and ct.code = 'monthly_tuition'
      and not exists (
        select 1 from public.payment_allocations pa where pa.charge_id = c.id
      )
    for update of c;
    if not found then raise exception 'repair_xavier_august_charge_mismatch'; end if;

    perform 1
    from public.enrollment_credits ec
    where ec.id = v_xavier_credit_id
      and ec.enrollment_id = v_xavier_enrollment_id
      and ec.source_payment_id = v_xavier_source_payment_id
      and ec.source_workflow = 'reassignment_remainder'
      and ec.original_amount = 300
      and ec.status = 'fully_used'
    for update;
    if not found then raise exception 'repair_xavier_credit_mismatch'; end if;

    perform 1
    from public.enrollment_credit_applications eca
    where eca.id = v_xavier_credit_application_id
      and eca.credit_id = v_xavier_credit_id
      and eca.charge_id = v_xavier_august_charge_id
      and eca.amount = 300
    for update;
    if not found then raise exception 'repair_xavier_credit_application_mismatch'; end if;

    perform 1
    from public.cash_sessions cs
    where cs.id = v_cash_session_id
      and cs.campus_id = v_campus_id
      and cs.status = 'open'
    for update;
    if not found then raise exception 'repair_xavier_cash_session_mismatch'; end if;

    delete from public.enrollment_credit_applications
    where id = v_xavier_credit_application_id;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'repair_xavier_credit_application_delete_failed'; end if;

    update public.enrollment_credits
    set status = 'void',
        voided_by = v_actor_id,
        voided_at = now(),
        void_reason = 'Correccion: los $300 se asignan directamente a Agosto; Front Desk cobro los $400 restantes en efectivo.'
    where id = v_xavier_credit_id and status = 'fully_used';
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'repair_xavier_credit_void_failed'; end if;

    insert into public.payment_allocations (
      payment_id, charge_id, amount, created_at
    ) values (
      v_xavier_source_payment_id, v_xavier_august_charge_id, 300, v_xavier_paid_at
    );

    insert into public.payments (
      id, enrollment_id, paid_at, method, amount, currency, status,
      external_source, notes, created_by, created_at, updated_at,
      operator_campus_id
    ) values (
      v_xavier_payment_id, v_xavier_enrollment_id, v_xavier_paid_at,
      'cash', 400, 'MXN', 'posted',
      'historical_regularization_admin',
      'Correccion auditada: pago en efectivo faltante de Mensualidad Agosto 2026.',
      v_actor_id, now(), now(), v_campus_id
    );

    insert into public.payment_allocations (
      payment_id, charge_id, amount, created_at
    ) values (
      v_xavier_payment_id, v_xavier_august_charge_id, 400, v_xavier_paid_at
    );

    insert into public.cash_session_entries (
      cash_session_id, payment_id, entry_type, amount, notes, created_by, created_at
    ) values (
      v_cash_session_id, v_xavier_payment_id, 'payment_in', 400,
      'Correccion auditada: cobro en efectivo faltante de Mensualidad Agosto 2026.',
      v_actor_id, v_xavier_paid_at
    );

    if (
      select coalesce(sum(pa.amount), 0)
      from public.payment_allocations pa
      where pa.payment_id = v_xavier_source_payment_id
    ) <> 700 then
      raise exception 'repair_xavier_source_payment_not_fully_allocated';
    end if;
    if (
      select coalesce(sum(pa.amount), 0)
      from public.payment_allocations pa
      where pa.charge_id = v_xavier_august_charge_id
    ) <> 700 then
      raise exception 'repair_xavier_august_not_fully_allocated';
    end if;
    if exists (
      select 1 from public.enrollment_credits
      where enrollment_id = v_xavier_enrollment_id and status <> 'void'
    ) then
      raise exception 'repair_xavier_nonvoid_credit_remains';
    end if;

    select total_charges, total_payments, balance
    into v_total_charges, v_total_payments, v_balance
    from public.v_enrollment_balances
    where enrollment_id = v_xavier_enrollment_id;
    if v_total_charges <> 6000 or v_total_payments <> 6000 or v_balance <> 0 then
      raise exception 'repair_xavier_final_balance_mismatch charges=% payments=% balance=%',
        v_total_charges, v_total_payments, v_balance;
    end if;

    insert into public.audit_logs (
      event_at, actor_user_id, action, table_name, record_id,
      before_data, after_data, request_id
    ) values (
      now(), v_actor_id, 'account.repair.credit_normalized_and_payment_reconstructed', 'payments', v_xavier_payment_id,
      jsonb_build_object(
        'sourcePaymentId', v_xavier_source_payment_id,
        'sourcePaymentAllocated', 400,
        'creditId', v_xavier_credit_id,
        'creditApplication', 300,
        'augustBalance', 400
      ),
      jsonb_build_object(
        'sourcePaymentAllocated', 700,
        'creditStatus', 'void',
        'newPaymentId', v_xavier_payment_id,
        'newPaymentAmount', 400,
        'newPaymentMethod', 'cash',
        'newPaymentPaidAt', v_xavier_paid_at,
        'augustDirectAllocation', 700,
        'balance', 0
      ),
      'repair-xavier-august-tuition-20260817'
    );
  end if;
end
$$;
