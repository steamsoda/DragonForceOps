-- Additive, service-only transaction. Prepared charge prices must be resolved by
-- the existing server-side eligibility/pricing helpers, never accepted from UI.
do $$ begin
  if strpos(pg_get_functiondef('public.auto_apply_enrollment_credit_fifo(uuid,uuid,uuid,text)'::regprocedure),
    'app.copa_cart_credit_targets')=0 then raise exception 'automatic_credit_guard_drift'; end if;
end $$;

create table public.explicit_cart_checkouts (
  id uuid primary key,
  enrollment_id uuid not null references public.enrollments(id),
  actor_id uuid not null references auth.users(id),
  campus_id uuid not null references public.campuses(id),
  payload jsonb not null,
  receipt jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.explicit_cart_checkouts enable row level security;
revoke all on public.explicit_cart_checkouts from public,anon,authenticated;
grant select on public.explicit_cart_checkouts to service_role;

create function public.checkout_explicit_cart(
  p_actor uuid,p_enrollment uuid,p_campus uuid,p_request uuid,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  e public.enrollments; ch public.charges; prior public.explicit_cart_checkouts;
  credit_source record; payment public.payments;
  cmd jsonb; item jsonb; plan jsonb; part jsonb; selection jsonb;
  lines jsonb:='[]'; receipts jsonb:='[]'; tenders jsonb:='[]';
  keys uuid[]:='{}'; ids uuid[]:='{}'; settled uuid[]:='{}'; plan_keys uuid[]:='{}'; selected_keys uuid[]:='{}';
  cid uuid; key_id uuid; session_id uuid;
  account_currency text; available numeric; pending numeric; due numeric; chosen numeric;
  total numeric:=0; credit_total numeric:=0; submitted numeric:=0; requested numeric:=0;
  left_credit numeric; take numeric; budget numeric; remaining numeric; account_pending numeric;
  line_index integer:=0; copa_count integer:=0; paid_at timestamptz; result jsonb;
  latest_prepared_month date;
  session_warning boolean:=false; old_claims text; old_sub text; old_targets text; old_copa text;
begin
  if auth.role() is distinct from 'service_role' or p_actor is null or not exists(
    select 1 from auth.users where id=p_actor and email_confirmed_at is not null
      and (banned_until is null or banned_until<=now())) then raise exception 'forbidden' using errcode='42501'; end if;
  if exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id
    where ur.user_id=p_actor and r.code in ('director_readonly','porto_viewer')) then raise exception 'forbidden' using errcode='42501'; end if;
  select * into e from public.enrollments where id=p_enrollment for update;
  if not found or e.status<>'active' then raise exception 'enrollment_inactive'; end if;
  if not exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id
    where ur.user_id=p_actor and (r.code in ('superadmin','director_admin') or
      (r.code='front_desk' and ur.campus_id=e.campus_id and ur.campus_id=p_campus))) then raise exception 'forbidden' using errcode='42501'; end if;
  if not exists(select 1 from public.campuses where id=p_campus and is_active) then raise exception 'invalid_campus'; end if;
  if p_request is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid_checkout'; end if;
  select * into prior from public.explicit_cart_checkouts where id=p_request;
  if found then
    if prior.actor_id<>p_actor or prior.enrollment_id<>e.id or prior.campus_id<>p_campus or prior.payload<>p_payload then
      raise exception 'checkout_request_conflict'; end if;
    return prior.receipt;
  end if;
  if exists(select 1 from public.enrollment_credit_applications where application_key=p_request)
    or exists(select 1 from public.explicit_credit_operations where id=p_request)
    or exists(select 1 from public.copa_cart_checkouts where id=p_request) then raise exception 'checkout_request_conflict'; end if;
  cmd:=p_payload->'command';
  if jsonb_typeof(cmd) is distinct from 'object' or (cmd->>'requestId')::uuid is distinct from p_request
    or (cmd->>'enrollmentId')::uuid is distinct from e.id
    or jsonb_typeof(cmd->'expectedLines') is distinct from 'array'
    or jsonb_typeof(cmd->'creditSelection') is distinct from 'array'
    or jsonb_typeof(cmd->'payments') is distinct from 'array'
    or jsonb_typeof(p_payload->'charges') is distinct from 'array'
    or jsonb_typeof(cmd->'expectedAvailableCredit') is distinct from 'number' then raise exception 'invalid_checkout'; end if;
  if jsonb_array_length(cmd->'expectedLines') not between 1 and 100
    or jsonb_array_length(cmd->'creditSelection')>100 or jsonb_array_length(cmd->'payments')>2
    or jsonb_array_length(p_payload->'charges')>50 then raise exception 'invalid_checkout'; end if;
  select coalesce((select currency from public.pricing_plans where id=e.pricing_plan_id),'MXN') into account_currency;
  if cmd->>'currency' is distinct from account_currency then raise exception 'checkout_changed'; end if;
  if (cmd->>'expectedAvailableCredit')::numeric<0 or (cmd->>'expectedAvailableCredit')::numeric>=10000000000
    or round((cmd->>'expectedAvailableCredit')::numeric,2)<>(cmd->>'expectedAvailableCredit')::numeric then raise exception 'invalid_checkout'; end if;

  -- Existing automation honors this transaction-local target filter. Never let
  -- new cart charges consume any credit before the reviewed selection is checked.
  old_targets:=coalesce(current_setting('app.copa_cart_credit_targets',true),'');
  old_claims:=coalesce(current_setting('request.jwt.claims',true),'{}');
  old_sub:=coalesce(current_setting('request.jwt.claim.sub',true),'');
  old_copa:=coalesce(current_setting('app.copa_tigres_payment',true),'');
  perform set_config('app.copa_cart_credit_targets','00000000-0000-0000-0000-000000000000',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  for plan in select value from jsonb_array_elements(p_payload->'charges') loop
    key_id:=(plan->>'key')::uuid; cid:=(plan->>'id')::uuid;
    if key_id is null or cid is null or key_id=any(plan_keys)
      or (select count(*) from jsonb_array_elements(cmd->'expectedLines') l where (l->>'key')::uuid=key_id and l->'chargeId'='null'::jsonb)<>1
      or plan->>'currency' is distinct from account_currency
      or jsonb_typeof(plan->'amount') is distinct from 'number' then raise exception 'invalid_checkout'; end if;
    if (plan->>'amount')::numeric<=0 or (plan->>'amount')::numeric>=10000000000
      or round((plan->>'amount')::numeric,2)<>(plan->>'amount')::numeric then raise exception 'invalid_checkout'; end if;
    if plan->>'product_id' is not null then
      perform 1 from public.products where id=(plan->>'product_id')::uuid and is_active for share;
      if not found then raise exception 'checkout_changed'; end if;
    end if;
    plan_keys:=array_append(plan_keys,key_id);
    if coalesce((plan->>'existing')::boolean,false) then
      select * into ch from public.charges where id=cid and enrollment_id=e.id and status<>'void' for update;
      if not found or ch.copa_tigres_installments or ch.currency<>account_currency
        or ch.amount is distinct from (plan->>'expected_amount')::numeric
        or exists(select 1 from public.payment_allocations where charge_id=cid)
        or exists(select 1 from public.enrollment_credit_applications where charge_id=cid) then raise exception 'checkout_changed'; end if;
      update public.charges set amount=(plan->>'amount')::numeric,pricing_rule_id=(plan->>'pricing_rule_id')::uuid where id=cid;
    else
      insert into public.charges(id,enrollment_id,product_id,charge_type_id,description,amount,currency,status,
        size,is_goalkeeper,uniform_fulfillment_mode,period_month,pricing_rule_id,created_by)
      values(cid,e.id,(plan->>'product_id')::uuid,(plan->>'charge_type_id')::uuid,plan->>'description',
        (plan->>'amount')::numeric,account_currency,'pending',plan->>'size',(plan->>'is_goalkeeper')::boolean,
        plan->>'uniform_fulfillment_mode',(plan->>'period_month')::date,(plan->>'pricing_rule_id')::uuid,p_actor);
    end if;
    insert into public.audit_logs(actor_user_id,action,table_name,record_id,after_data)
      values(p_actor,case when coalesce((plan->>'catalog_exception')::boolean,false) then 'charge.created.catalog_exception' else 'charge.explicit_cart' end,'charges',cid,plan);
  end loop;

  for selection in select value from jsonb_array_elements(cmd->'creditSelection') loop
    key_id:=(selection->>'key')::uuid;
    if key_id is null or key_id=any(selected_keys) or jsonb_typeof(selection->'amount') is distinct from 'number' then raise exception 'invalid_credit_selection'; end if;
    chosen:=(selection->>'amount')::numeric;
    if chosen<=0 or chosen>=10000000000 or round(chosen,2)<>chosen then raise exception 'invalid_credit_selection'; end if;
    selected_keys:=array_append(selected_keys,key_id); requested:=requested+chosen;
  end loop;
  -- Lock all reviewed charges before sources and allocations, in UUID order.
  perform 1 from public.charges where id in (
    select (l->>'chargeId')::uuid from jsonb_array_elements(cmd->'expectedLines') l where l->>'chargeId' is not null
    union select (p->>'id')::uuid from jsonb_array_elements(p_payload->'charges') p) order by id for update;
  perform 1 from public.enrollment_credits where enrollment_id=e.id and status='open' order by created_at,id for update;
  select coalesce(sum(greatest(c.original_amount-coalesce(a.amount,0),0)),0) into available
  from public.enrollment_credits c left join lateral(select sum(amount) amount from public.enrollment_credit_applications where credit_id=c.id) a on true
  where c.enrollment_id=e.id and c.status='open';
  if available<>(cmd->>'expectedAvailableCredit')::numeric then raise exception 'checkout_changed'; end if;
  if requested>available then raise exception 'invalid_credit_selection'; end if;
  if requested>0 then
    perform 1 from public.payments where id in(select source_payment_id from public.enrollment_credits where enrollment_id=e.id and status='open') order by id for share;
    if exists(select 1 from public.enrollment_credits c left join public.payments p on p.id=c.source_payment_id
      where c.enrollment_id=e.id and c.status='open' and (c.currency<>account_currency or c.campus_id<>e.campus_id
        or (c.source_payment_id is not null and (p.status is distinct from 'posted' or p.enrollment_id is distinct from e.id
          or p.currency<>account_currency or exists(select 1 from public.payment_refunds r where r.payment_id=p.id)
          or coalesce((select sum(amount) from public.payment_allocations where payment_id=p.id),0)
            +coalesce((select sum(original_amount) from public.enrollment_credits where source_payment_id=p.id and status<>'void'),0)
            +coalesce((select sum(amount) from public.charge_cash_refund_sources where payment_id=p.id),0)>p.amount)))) then
      raise exception 'credit_source_requires_review'; end if;
  end if;
  for item in select value from jsonb_array_elements(cmd->'expectedLines') order by (value->>'kind'='copa_tigres') desc,(value->>'key')::uuid loop
    key_id:=(item->>'key')::uuid; cid:=(item->>'chargeId')::uuid;
    if cid is null then select (p->>'id')::uuid into cid from jsonb_array_elements(p_payload->'charges') p where (p->>'key')::uuid=key_id; end if;
    if key_id is null or cid is null or key_id=any(keys) or cid=any(ids)
      or jsonb_typeof(item->'due') is distinct from 'number' or jsonb_typeof(item->'pending') is distinct from 'number'
      or jsonb_typeof(item->'creditAllowed') is distinct from 'boolean' then raise exception 'invalid_checkout'; end if;
    select * into ch from public.charges where id=cid and enrollment_id=e.id and status<>'void' and currency=account_currency;
    if not found then raise exception 'checkout_changed'; end if;
    keys:=array_append(keys,key_id); ids:=array_append(ids,cid); due:=(item->>'due')::numeric;
    select greatest(ch.amount-coalesce((select sum(a.amount) from public.payment_allocations a join public.payments p on p.id=a.payment_id and p.status='posted' where a.charge_id=cid),0)
      -coalesce((select sum(amount) from public.enrollment_credit_applications where charge_id=cid),0),0) into pending;
    if pending<>(item->>'pending')::numeric then raise exception 'checkout_changed'; end if;
    if due<=0 or due>pending or due>=10000000000 or round(due,2)<>due then raise exception 'invalid_checkout'; end if;
    select coalesce(sum((s->>'amount')::numeric),0) into chosen from jsonb_array_elements(cmd->'creditSelection') s where (s->>'key')::uuid=key_id;
    if chosen>due or (chosen>0 and not (item->>'creditAllowed')::boolean) then raise exception 'invalid_credit_selection'; end if;
    if ch.copa_tigres_installments then
      copa_count:=copa_count+1;
      if chosen>0 then raise exception 'copa_tigres_no_credit'; end if;
      if item->>'kind' is distinct from 'copa_tigres' or account_currency<>'MXN' or ch.amount<>1250 or copa_count>1
        or not ((pending=1250 and due in (600,1250)) or (pending=650 and due=650)) then raise exception 'invalid_copa_installment'; end if;
    elsif item->>'kind' is distinct from 'ordinary' then raise exception 'checkout_changed'; end if;
    left_credit:=chosen;
    if chosen>0 then
      for credit_source in select c.id,greatest(c.original_amount-coalesce(a.amount,0),0) available from public.enrollment_credits c
        left join lateral(select sum(amount) amount from public.enrollment_credit_applications where credit_id=c.id) a on true
        where c.enrollment_id=e.id and c.status='open' order by c.created_at,c.id loop
        take:=least(left_credit,credit_source.available);
        if take>0 then
          insert into public.enrollment_credit_applications(credit_id,charge_id,amount,applied_by,notes,application_key)
            values(credit_source.id,cid,take,p_actor,'Credito confirmado en cobro de Caja.',p_request);
          if take=credit_source.available then update public.enrollment_credits set status='fully_used' where id=credit_source.id; end if;
          left_credit:=left_credit-take;
        end if;
        exit when left_credit=0;
      end loop;
      if left_credit<>0 then raise exception 'checkout_changed'; end if;
    end if;
    credit_total:=credit_total+chosen; total:=total+due-chosen;
    if due=pending then settled:=array_append(settled,cid); end if;
    lines:=lines||jsonb_build_array(jsonb_build_object('id',cid,'amount',due-chosen));
    receipts:=receipts||jsonb_build_array(jsonb_build_object('key',key_id,'chargeId',cid,'description',ch.description,
      'pendingBefore',pending,'creditApplied',chosen,'moneyReceived',due-chosen,'pendingAfter',pending-due));
  end loop;
  if not selected_keys<@keys or credit_total<>requested then raise exception 'invalid_credit_selection'; end if;
  for part in select value from jsonb_array_elements(cmd->'payments') loop
    if jsonb_typeof(part->'amount') is distinct from 'number' or part->>'method' is null
      or part->>'method' not in ('cash','card','transfer','stripe_360player','other') then raise exception 'invalid_checkout'; end if;
    budget:=(part->>'amount')::numeric;
    if budget<=0 or budget>=10000000000 or round(budget,2)<>budget then raise exception 'invalid_checkout'; end if;
    submitted:=submitted+budget;
  end loop;
  if submitted<>total or total+credit_total>=10000000000 then raise exception 'payment_total_mismatch'; end if;
  paid_at:=coalesce((p_payload->>'paidAt')::timestamptz,now());
  if not isfinite(paid_at) or paid_at>now()+interval '5 minutes' then raise exception 'invalid_payment_date'; end if;
  remaining:=(lines->0->>'amount')::numeric;
  for part in select value from jsonb_array_elements(cmd->'payments') loop
    budget:=(part->>'amount')::numeric;
    insert into public.payments(enrollment_id,amount,currency,method,status,paid_at,operator_campus_id,provider_ref,external_source,created_by,notes)
      values(e.id,budget,account_currency,(part->>'method')::public.payment_method,'posted',paid_at,p_campus,
        'explicit-cart-'||p_request::text||'-'||jsonb_array_length(tenders),'manual',p_actor,p_payload->>'notes') returning * into payment;
    perform set_config('app.copa_tigres_payment',payment.id::text,true);
    while budget>0 loop
      if line_index>=jsonb_array_length(lines) then raise exception 'allocation_mismatch'; end if;
      take:=least(budget,remaining);
      if take>0 then insert into public.payment_allocations(payment_id,charge_id,amount) values(payment.id,(lines->line_index->>'id')::uuid,take); end if;
      budget:=budget-take; remaining:=remaining-take;
      if remaining=0 then line_index:=line_index+1; remaining:=coalesce((lines->line_index->>'amount')::numeric,0); end if;
    end loop;
    perform set_config('app.copa_tigres_payment',old_copa,true);
    if payment.method='cash' then
      select id into session_id from public.cash_sessions where campus_id=p_campus and status='open' order by opened_at desc limit 1 for update;
      if session_id is not null then
        insert into public.cash_session_entries(cash_session_id,payment_id,entry_type,amount,created_by) values(session_id,payment.id,'payment_in',payment.amount,p_actor);
      else session_warning:=true; end if;
    end if;
    tenders:=tenders||jsonb_build_array(jsonb_build_object('id',payment.id,'folio',payment.folio,'method',payment.method,'amount',payment.amount));
    insert into public.audit_logs(actor_user_id,action,table_name,record_id,after_data)
      values(p_actor,'payment.posted','payments',payment.id,jsonb_build_object('enrollment_id',e.id,'amount',payment.amount,'method',payment.method,'source','caja','checkout_id',p_request));
  end loop;
  select max(c.period_month) into latest_prepared_month from public.charges c join public.charge_types ct on ct.id=c.charge_type_id
    where ct.code='monthly_tuition' and c.id in(select (p->>'id')::uuid from jsonb_array_elements(p_payload->'charges') p);
  if latest_prepared_month is not null and exists(
    select 1 from public.charges c join public.charge_types ct on ct.id=c.charge_type_id
    where c.enrollment_id=e.id and c.status<>'void' and ct.code='monthly_tuition' and c.period_month<=latest_prepared_month
      and c.amount>coalesce((select sum(a.amount) from public.payment_allocations a join public.payments p on p.id=a.payment_id and p.status='posted' where a.charge_id=c.id),0)
        +coalesce((select sum(amount) from public.enrollment_credit_applications where charge_id=c.id),0)
  ) then raise exception 'prior_month_arrears'; end if;
  perform public.sync_paid_tournament_entries_for_charges(e.id,ids);
  insert into public.uniform_orders(player_id,enrollment_id,charge_id,uniform_type,size,status,sold_at,delivered_at,created_by)
  select e.player_id,e.id,c.id,case when ct.code='uniform_training' then 'training' else 'game' end,c.size,
    case when c.uniform_fulfillment_mode='deliver_now' then 'delivered' else 'pending_order' end,paid_at,
    case when c.uniform_fulfillment_mode='deliver_now' then paid_at else null end,p_actor
  from public.charges c join public.charge_types ct on ct.id=c.charge_type_id
  where c.id=any(settled) and ct.code in ('uniform_training','uniform_game') and not exists(select 1 from public.uniform_orders u where u.charge_id=c.id);
  select coalesce(sum(greatest(c.amount-coalesce(a.amount,0)-coalesce(cr.amount,0),0)),0) into account_pending from public.charges c
  left join lateral(select sum(pa.amount) amount from public.payment_allocations pa join public.payments p on p.id=pa.payment_id and p.status='posted' where pa.charge_id=c.id) a on true
  left join lateral(select sum(amount) amount from public.enrollment_credit_applications where charge_id=c.id) cr on true
  where c.enrollment_id=e.id and c.status<>'void';
  if account_pending=0 then update public.enrollments set follow_up_status=null,follow_up_at=null,follow_up_by=null,follow_up_note=null,promise_date=null where id=e.id; end if;
  result:=jsonb_build_object('operationId',p_request,'enrollmentId',e.id,'actorId',p_actor,'occurredAt',now(),'paidAt',paid_at,
    'playerName',(select concat_ws(' ',first_name,last_name) from public.players where id=e.player_id),
    'campusName',(select name from public.campuses where id=e.campus_id),'operatorCampusName',(select name from public.campuses where id=p_campus),
    'currency',account_currency,'moneyReceived',total,'creditApplied',credit_total,'creditRemaining',available-credit_total,
    'pendingChargesTotal',account_pending,'lines',receipts,'payments',tenders,'sessionWarning',session_warning);
  insert into public.explicit_cart_checkouts(id,enrollment_id,actor_id,campus_id,payload,receipt) values(p_request,e.id,p_actor,p_campus,p_payload,result);
  insert into public.audit_logs(actor_user_id,action,table_name,record_id,after_data) values(p_actor,'checkout.explicit.completed','explicit_cart_checkouts',p_request,result);
  perform set_config('request.jwt.claims',old_claims,true); perform set_config('request.jwt.claim.sub',old_sub,true);
  perform set_config('app.copa_cart_credit_targets',old_targets,true); perform set_config('app.copa_tigres_payment',old_copa,true);
  return result;
end $$;
revoke all on function public.checkout_explicit_cart(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.checkout_explicit_cart(uuid,uuid,uuid,uuid,jsonb) to service_role;
