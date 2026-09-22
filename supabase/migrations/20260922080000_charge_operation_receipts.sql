-- Preserve the existing financial routines; save their outcomes atomically.
create table public.charge_operation_receipts (
  charge_id uuid primary key references public.charges(id) on delete restrict,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  receipt jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.charge_operation_receipts enable row level security;
revoke all on public.charge_operation_receipts from public, anon, authenticated, service_role;
grant select on public.charge_operation_receipts to service_role;

create function public.charge_operation_receipt_context(p_enrollment uuid, p_charge uuid, p_actor uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  -- Match the financial routines' lock order before reading the original folios.
  perform 1 from public.enrollments where id=p_enrollment for update;
  perform 1 from public.charges where id=p_charge and enrollment_id=p_enrollment for update;
  select jsonb_build_object(
    'operationId',gen_random_uuid(), 'chargeId',c.id, 'enrollmentId',e.id,
    'playerName',concat_ws(' ',p.first_name,p.last_name), 'campusName',ca.name,
    'description',c.description, 'chargeAmount',c.amount, 'currency',c.currency,
    'operator',coalesce(u.email,p_actor::text), 'recordedAt',now(),
    'paymentReferences',coalesce((select jsonb_agg(coalesce(pay.folio,pay.id::text) order by pay.id)
      from public.payment_allocations pa join public.payments pay on pay.id=pa.payment_id
      where pa.charge_id=c.id),'[]'::jsonb)) into v
  from public.charges c join public.enrollments e on e.id=c.enrollment_id
  join public.players p on p.id=e.player_id join public.campuses ca on ca.id=e.campus_id
  join auth.users u on u.id=p_actor where c.id=p_charge and e.id=p_enrollment;
  if v is null then raise exception 'charge_not_found'; end if;
  return v;
end $$;
revoke all on function public.charge_operation_receipt_context(uuid,uuid,uuid) from public,anon,authenticated,service_role;

alter function public.void_charge_to_explicit_credit(uuid,uuid,uuid,text) rename to void_charge_to_explicit_credit_core;
revoke all on function public.void_charge_to_explicit_credit_core(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.void_charge_to_explicit_credit(p_enrollment_id uuid,p_charge_id uuid,p_actor_id uuid,p_reason text)
returns table(released_payment_amount numeric,reopened_credit_amount numeric,created_credit_count integer,
  auto_applied_credit_amount numeric,remaining_credit_amount numeric)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; r record;
begin
  v:=public.charge_operation_receipt_context(p_enrollment_id,p_charge_id,p_actor_id);
  select * into strict r from public.void_charge_to_explicit_credit_core(p_enrollment_id,p_charge_id,p_actor_id,p_reason);
  v:=v||jsonb_build_object('kind','credit','occurredAt',now(),'reason',btrim(p_reason),
    'cashReturned',0,'creditGenerated',r.released_payment_amount,'creditRestored',r.reopened_credit_amount);
  insert into public.charge_operation_receipts(charge_id,enrollment_id,receipt) values(p_charge_id,p_enrollment_id,v);
  return query select r.released_payment_amount,r.reopened_credit_amount,r.created_credit_count,
    r.auto_applied_credit_amount,r.remaining_credit_amount;
end $$;
revoke all on function public.void_charge_to_explicit_credit(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.void_charge_to_explicit_credit(uuid,uuid,uuid,text) to service_role;

alter function public.record_charge_cash_refund(uuid,uuid,uuid,uuid,timestamptz,text,text) rename to record_charge_cash_refund_core;
revoke all on function public.record_charge_cash_refund_core(uuid,uuid,uuid,uuid,timestamptz,text,text) from public,anon,authenticated,service_role;
create function public.record_charge_cash_refund(p_enrollment_id uuid,p_charge_id uuid,p_operator_campus_id uuid,
  p_actor_id uuid,p_refunded_at timestamptz,p_reason text,p_notes text default null)
returns table(refund_id uuid,cash_refund_amount numeric,reopened_credit_amount numeric,
  auto_applied_credit_amount numeric,remaining_credit_amount numeric,cash_session_id uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; r record;
begin
  v:=public.charge_operation_receipt_context(p_enrollment_id,p_charge_id,p_actor_id);
  select * into strict r from public.record_charge_cash_refund_core(p_enrollment_id,p_charge_id,p_operator_campus_id,p_actor_id,p_refunded_at,p_reason,p_notes);
  v:=v||jsonb_build_object('operationId',r.refund_id,'kind','cash','occurredAt',p_refunded_at,
    'reason',btrim(p_reason),'cashReturned',r.cash_refund_amount,'creditGenerated',0,'creditRestored',r.reopened_credit_amount,
    'operatorCampusName',(select name from public.campuses where id=p_operator_campus_id));
  insert into public.charge_operation_receipts(charge_id,enrollment_id,receipt) values(p_charge_id,p_enrollment_id,v);
  return query select r.refund_id,r.cash_refund_amount,r.reopened_credit_amount,
    r.auto_applied_credit_amount,r.remaining_credit_amount,r.cash_session_id;
end $$;
revoke all on function public.record_charge_cash_refund(uuid,uuid,uuid,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.record_charge_cash_refund(uuid,uuid,uuid,uuid,timestamptz,text,text) to service_role;
