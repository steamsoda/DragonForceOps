-- Additive foundation only. Existing automatic paths are retired in a later,
-- coordinated UI/checkout migration; this does not change their behavior yet.
create table public.explicit_credit_operations (
  id uuid primary key,
  enrollment_id uuid not null references public.enrollments(id),
  actor_id uuid not null references auth.users(id),
  selection jsonb not null,
  expected_available numeric not null,
  receipt jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.explicit_credit_operations enable row level security;
revoke all on public.explicit_credit_operations from public, anon, authenticated;
grant select on public.explicit_credit_operations to service_role;

create function public.apply_explicit_credit_selection(
  p_enrollment uuid, p_request uuid, p_selection jsonb, p_expected_available numeric
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  actor uuid := auth.uid();
  e public.enrollments;
  account_currency text;
  prior public.explicit_credit_operations;
  c public.charges;
  credit record;
  item jsonb;
  ids uuid[];
  settled_ids uuid[] := '{}';
  normalized jsonb;
  receipt_lines jsonb := '[]';
  requested numeric := 0;
  available numeric;
  pending numeric;
  remaining numeric;
  take numeric;
  account_pending numeric;
  receipt jsonb;
  operation_time timestamptz := now();
begin
  -- Use the verified session, never a client-supplied actor or role.
  if auth.role() is distinct from 'authenticated' or actor is null or not exists (
    select 1 from auth.users where id=actor and email_confirmed_at is not null
      and (banned_until is null or banned_until <= now())
  ) then raise exception 'forbidden' using errcode='42501'; end if;
  if exists (select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id
    where ur.user_id=actor and r.code in ('director_readonly','porto_viewer')) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  select * into e from public.enrollments where id=p_enrollment for update;
  if not found then raise exception 'enrollment_not_found'; end if;
  select coalesce((select currency from public.pricing_plans where id=e.pricing_plan_id),'MXN') into account_currency;
  if not exists (select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id
    where ur.user_id=actor and (r.code in ('superadmin','director_admin') or
      (r.code='front_desk' and ur.campus_id=e.campus_id))) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  -- Historical charges may be explicitly settled without changing enrollment state.
  if e.status not in ('active','ended','cancelled') then raise exception 'enrollment_inactive'; end if;
  if p_request is null or jsonb_typeof(p_selection) is distinct from 'array' then
    raise exception 'invalid_credit_selection';
  end if;
  if jsonb_array_length(p_selection) not between 1 and 100
    or p_expected_available is null or p_expected_available <= 0
    or p_expected_available >= 10000000000 or round(p_expected_available,2) <> p_expected_available then
    raise exception 'invalid_credit_selection';
  end if;
  for item in select value from jsonb_array_elements(p_selection) loop
    if jsonb_typeof(item->'chargeId') is distinct from 'string'
      or jsonb_typeof(item->'amount') is distinct from 'number'
      or jsonb_typeof(item->'expectedPending') is distinct from 'number' then
      raise exception 'invalid_credit_selection';
    end if;
    if (item->>'amount')::numeric <= 0 or (item->>'amount')::numeric >= 10000000000
      or round((item->>'amount')::numeric,2) <> (item->>'amount')::numeric
      or (item->>'expectedPending')::numeric < (item->>'amount')::numeric
      or (item->>'expectedPending')::numeric >= 10000000000
      or round((item->>'expectedPending')::numeric,2) <> (item->>'expectedPending')::numeric then
      raise exception 'invalid_credit_selection';
    end if;
    requested := requested + (item->>'amount')::numeric;
  end loop;
  select array_agg((value->>'chargeId')::uuid order by (value->>'chargeId')::uuid),
    jsonb_agg(jsonb_build_object('chargeId',(value->>'chargeId')::uuid,
      'amount',(value->>'amount')::numeric,'expectedPending',(value->>'expectedPending')::numeric)
      order by (value->>'chargeId')::uuid)
  into ids, normalized from jsonb_array_elements(p_selection);
  if cardinality(ids) <> (select count(distinct id) from unnest(ids) id)
    or requested > p_expected_available then raise exception 'invalid_credit_selection'; end if;

  -- Check authorization before replay, and compare the actual command, not a
  -- client-provided fingerprint. Enrollment locking serializes same-account retries.
  select * into prior from public.explicit_credit_operations where id=p_request;
  if found then
    if prior.actor_id<>actor or prior.enrollment_id<>e.id or prior.selection<>normalized
      or prior.expected_available<>p_expected_available then raise exception 'credit_request_conflict'; end if;
    return prior.receipt;
  end if;
  if exists (select 1 from public.enrollment_credit_applications where application_key=p_request) then
    raise exception 'credit_request_conflict';
  end if;

  perform 1 from public.charges where id=any(ids) order by id for update;
  if (select count(*) from public.charges where id=any(ids) and enrollment_id=e.id
      and status<>'void' and currency=account_currency) <> cardinality(ids) then
    raise exception 'invalid_target_charge';
  end if;
  if exists(select 1 from public.charges where id=any(ids) and copa_tigres_installments) then
    raise exception 'copa_tigres_no_credit';
  end if;
  perform 1 from public.enrollment_credits where enrollment_id=e.id and status='open'
    order by created_at,id for update;
  perform 1 from public.payments p where p.id in (select source_payment_id
    from public.enrollment_credits where enrollment_id=e.id and status='open') order by p.id for share;
  -- Do not silently spend credit whose source payment has since been voided/refunded.
  if exists (select 1 from public.enrollment_credits cr left join public.payments p on p.id=cr.source_payment_id
    where cr.enrollment_id=e.id and cr.status='open' and
      (cr.currency<>account_currency or cr.campus_id<>e.campus_id or
       (cr.source_payment_id is not null and (p.status is distinct from 'posted'
        or p.enrollment_id is distinct from e.id or p.currency<>account_currency
        or exists(select 1 from public.payment_refunds r where r.payment_id=p.id)
        or coalesce((select sum(amount) from public.payment_allocations where payment_id=p.id),0)
          +coalesce((select sum(original_amount) from public.enrollment_credits where source_payment_id=p.id and status<>'void'),0)
          +coalesce((select sum(amount) from public.charge_cash_refund_sources where payment_id=p.id),0)>p.amount)))) then
    raise exception 'credit_source_requires_review';
  end if;
  select coalesce(sum(greatest(cr.original_amount-coalesce(a.amount,0),0)),0) into available
  from public.enrollment_credits cr left join lateral (select sum(amount) amount
    from public.enrollment_credit_applications where credit_id=cr.id) a on true
  where cr.enrollment_id=e.id and cr.status='open';
  if available<>p_expected_available then raise exception 'credit_selection_changed'; end if;

  for item in select value from jsonb_array_elements(normalized) loop
    select * into c from public.charges where id=(item->>'chargeId')::uuid;
    select greatest(c.amount
      -coalesce((select sum(pa.amount) from public.payment_allocations pa join public.payments p
        on p.id=pa.payment_id and p.status='posted' where pa.charge_id=c.id),0)
      -coalesce((select sum(amount) from public.enrollment_credit_applications where charge_id=c.id),0),0)
    into pending;
    if pending<>(item->>'expectedPending')::numeric then raise exception 'credit_selection_changed'; end if;
    remaining := (item->>'amount')::numeric;
    for credit in select cr.id, greatest(cr.original_amount-coalesce(a.amount,0),0) available
      from public.enrollment_credits cr left join lateral (select sum(amount) amount
        from public.enrollment_credit_applications where credit_id=cr.id) a on true
      where cr.enrollment_id=e.id and cr.status='open' order by cr.created_at,cr.id
    loop
      take := least(remaining,credit.available);
      if take > 0 then
        insert into public.enrollment_credit_applications(credit_id,charge_id,amount,applied_by,notes,application_key)
          values(credit.id,c.id,take,actor,'Aplicacion explicita confirmada por el operador.',p_request);
        if take=credit.available then update public.enrollment_credits set status='fully_used' where id=credit.id; end if;
        remaining := remaining-take;
      end if;
      exit when remaining=0;
    end loop;
    if remaining<>0 then raise exception 'credit_selection_changed'; end if;
    if pending=(item->>'amount')::numeric then settled_ids:=array_append(settled_ids,c.id); end if;
    receipt_lines:=receipt_lines||jsonb_build_array(jsonb_build_object('chargeId',c.id,
      'description',c.description,'creditApplied',(item->>'amount')::numeric,
      'pendingBefore',pending,'pendingAfter',pending-(item->>'amount')::numeric));
  end loop;

  -- Settlement side effects share the credit transaction; credit is not cash.
  perform public.sync_paid_tournament_entries_for_charges(e.id,ids);
  insert into public.uniform_orders(player_id,enrollment_id,charge_id,uniform_type,size,status,sold_at,delivered_at,created_by)
  select e.player_id,e.id,ch.id,case when ct.code='uniform_training' then 'training' else 'game' end,ch.size,
    case when ch.uniform_fulfillment_mode='deliver_now' then 'delivered' else 'pending_order' end,operation_time,
    case when ch.uniform_fulfillment_mode='deliver_now' then operation_time else null end,actor
  from public.charges ch join public.charge_types ct on ct.id=ch.charge_type_id
  where ch.id=any(settled_ids) and ct.code in ('uniform_training','uniform_game')
    and not exists(select 1 from public.uniform_orders u where u.charge_id=ch.id);
  select coalesce(sum(greatest(ch.amount-coalesce(a.amount,0)-coalesce(cr.amount,0),0)),0)
    into account_pending from public.charges ch
  left join lateral(select sum(pa.amount) amount from public.payment_allocations pa join public.payments p
    on p.id=pa.payment_id and p.status='posted' where pa.charge_id=ch.id) a on true
  left join lateral(select sum(amount) amount from public.enrollment_credit_applications where charge_id=ch.id) cr on true
  where ch.enrollment_id=e.id and ch.status<>'void';
  if account_pending=0 then
    update public.enrollments set follow_up_status=null,follow_up_at=null,follow_up_by=null,
      follow_up_note=null,promise_date=null where id=e.id;
  end if;
  receipt:=jsonb_build_object('operationId',p_request,'enrollmentId',e.id,'actorId',actor,
    'playerName',(select concat_ws(' ',first_name,last_name) from public.players where id=e.player_id),
    'campusName',(select name from public.campuses where id=e.campus_id),
    'occurredAt',operation_time,'currency',account_currency,'moneyReceived',0,'creditApplied',requested,
    'creditRemaining',available-requested,'pendingChargesTotal',account_pending,'lines',receipt_lines);
  insert into public.explicit_credit_operations(id,enrollment_id,actor_id,selection,expected_available,receipt)
    values(p_request,e.id,actor,normalized,p_expected_available,receipt);
  insert into public.audit_logs(actor_user_id,action,table_name,record_id,after_data)
    values(actor,'account_credit.applied.explicit','explicit_credit_operations',p_request,receipt);
  return receipt;
end $$;
revoke all on function public.apply_explicit_credit_selection(uuid,uuid,jsonb,numeric) from public,anon,service_role;
grant execute on function public.apply_explicit_credit_selection(uuid,uuid,jsonb,numeric) to authenticated;
