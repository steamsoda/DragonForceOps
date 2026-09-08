-- Owner confirmed actual card receipt: J5 1000 + September tuition 700 = 1700.
do $$
declare
  v_payment_before jsonb;
  v_credit_before jsonb;
  v_balance numeric;
begin
  if exists (select 1 from public.audit_logs where request_id='repair.damian-payment.20260907') then return; end if;
  perform 1 from public.enrollments where id='02ff111d-799e-4db4-8e0f-c0458508a386' for update;
  select to_jsonb(p) into strict v_payment_before from public.payments p
    where id='8cba45e8-2ea5-421e-9cd0-ff1e2562a258'
      and enrollment_id='02ff111d-799e-4db4-8e0f-c0458508a386'
      and status='posted' and method='card' and amount=2000 for update;
  select to_jsonb(c) into strict v_credit_before from public.enrollment_credits c
    where id='fee782cc-d59a-4797-97ef-473cdd22c265'
      and source_payment_id='8cba45e8-2ea5-421e-9cd0-ff1e2562a258'
      and enrollment_id='02ff111d-799e-4db4-8e0f-c0458508a386'
      and original_amount=1000 and status='open' for update;
  if (select coalesce(sum(amount),0) from public.payment_allocations where payment_id='8cba45e8-2ea5-421e-9cd0-ff1e2562a258') <> 1000 then
    raise exception 'Damian direct funding changed';
  end if;
  if (select coalesce(sum(amount),0) from public.payment_allocations where payment_id='8cba45e8-2ea5-421e-9cd0-ff1e2562a258' and charge_id='2e5488c6-6a67-4df3-9970-f5022dcaad35') <> 1000 then
    raise exception 'Damian J5 funding changed';
  end if;
  if (select coalesce(sum(amount),0) from public.enrollment_credit_applications where credit_id='fee782cc-d59a-4797-97ef-473cdd22c265') <> 700
    or (select coalesce(sum(amount),0) from public.enrollment_credit_applications where credit_id='fee782cc-d59a-4797-97ef-473cdd22c265' and charge_id='674da609-5304-4abc-8770-7cdaaf0df55a') <> 700 then
    raise exception 'Damian September credit application changed';
  end if;
  update public.payments set amount=1700, updated_at=now()
    where id='8cba45e8-2ea5-421e-9cd0-ff1e2562a258';
  update public.enrollment_credits set original_amount=700, status='fully_used',
    notes=concat_ws(E'\n',notes,'2026-09-07: importe corregido al confirmar pago real de $1,700 ($1,000 J5 + $700 septiembre); aplicacion de septiembre conservada.')
    where id='fee782cc-d59a-4797-97ef-473cdd22c265';
  select balance into strict v_balance from public.v_enrollment_balances where enrollment_id='02ff111d-799e-4db4-8e0f-c0458508a386';
  if v_balance<>0 then raise exception 'Damian balance must be zero: %',v_balance; end if;
  if exists(select 1 from public.v_enrollment_credit_balances where enrollment_id='02ff111d-799e-4db4-8e0f-c0458508a386' and available_credit_total<>0) then
    raise exception 'Damian available credit must be zero';
  end if;
  insert into public.audit_logs(actor_user_id,actor_email,action,table_name,record_id,before_data,after_data,request_id)
    values('7af8a854-f9de-4c20-ad79-176571433331','javierg@dragonforcemty.com','payment.amount_corrected','payments',
      '8cba45e8-2ea5-421e-9cd0-ff1e2562a258',jsonb_build_object('payment',v_payment_before,'credit',v_credit_before),
      jsonb_build_object('amount',1700,'credit_original_amount',700,'credit_status','fully_used','j5_funding',1000,'september_funding',700,'balance',v_balance,
        'reason','Owner and Front Desk confirmed actual payment of 1000 + 700, not 2000; original date, card method, folio and September allocation preserved.'),
      'repair.damian-payment.20260907');
end $$;
