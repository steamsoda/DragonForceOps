-- Prepared charge plans are resolved by the server using the existing Caja rules.
-- Only service_role may submit them; actor/campus checks are repeated in SQL.
create table public.copa_cart_checkouts (
 id uuid primary key,
 enrollment_id uuid not null references public.enrollments(id),
 actor_id uuid not null references auth.users(id),
 fingerprint text not null,
 payment_ids uuid[] not null,
 receipt jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.copa_cart_checkouts enable row level security;
revoke all on public.copa_cart_checkouts from public,anon,authenticated;
grant all on public.copa_cart_checkouts to service_role;

-- During mixed checkout, only its newly staged ordinary charges receive credit.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.auto_apply_enrollment_credit_fifo(uuid,uuid,uuid,text)'::regprocedure);
 if strpos(definition,'and not c.copa_tigres_installments')=0 then raise exception 'credit function drift'; end if;
 execute replace(definition,'and not c.copa_tigres_installments',
  'and not c.copa_tigres_installments and (nullif(current_setting(''app.copa_cart_credit_targets'',true),'''') is null or c.id=any(string_to_array(current_setting(''app.copa_cart_credit_targets'',true),'','')::uuid[]))');
end $$;

create function public.checkout_copa_cart(
 p_actor uuid, p_enrollment uuid, p_campus uuid, p_request uuid,
 p_fingerprint text, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 e public.enrollments; product public.products; copa public.charges; existing public.charges;
 prior public.copa_cart_checkouts; plan jsonb; part jsonb; item jsonb;
 cid uuid; pid uuid; session_id uuid; ids uuid[]:='{}'; new_ids uuid[]:='{}'; payment_ids uuid[]:='{}';
 lines jsonb:='[]'; receipt_lines jsonb:='[]'; pending numeric; funded numeric;
 installment numeric; total numeric:=0; submitted numeric:=0; budget numeric;
 take numeric; remaining numeric; credit_total numeric:=0; copa_before numeric;
 line_index integer:=0; paid_at timestamptz; result jsonb; first_payment public.payments;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
 if p_request is null or nullif(p_fingerprint,'') is null or not exists(
   select 1 from auth.users where id=p_actor and email_confirmed_at is not null
   and (banned_until is null or banned_until<=now())) then raise exception 'forbidden' using errcode='42501'; end if;
 if exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id
   where ur.user_id=p_actor and r.code in ('director_readonly','porto_viewer')) then
   raise exception 'forbidden' using errcode='42501'; end if;
 select * into e from public.enrollments where id=p_enrollment for update;
 if not found or e.status<>'active' then raise exception 'enrollment_inactive'; end if;
 if not exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id
   where ur.user_id=p_actor and (r.code in ('superadmin','director_admin') or
    (r.code='front_desk' and ur.campus_id=e.campus_id and ur.campus_id=p_campus))) then
   raise exception 'forbidden' using errcode='42501'; end if;
 if not exists(select 1 from public.campuses where id=p_campus and is_active) then raise exception 'invalid_campus'; end if;
 select * into prior from public.copa_cart_checkouts where id=p_request;
 if found then
   if prior.actor_id<>p_actor or prior.enrollment_id<>e.id or prior.fingerprint<>p_fingerprint then
     raise exception 'copa_cart_request_conflict'; end if;
   return jsonb_build_object('payment_id',prior.payment_ids[1]);
 end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 if jsonb_typeof(p_payload->'charges')<>'array' or jsonb_array_length(p_payload->'charges')>50
   or jsonb_typeof(p_payload->'targets')<>'array' or jsonb_array_length(p_payload->'targets')>100
   or jsonb_array_length(p_payload->'payments') not between 1 and 2 then raise exception 'invalid_form'; end if;
 installment:=(p_payload#>>'{copa,amount}')::numeric;
 select * into product from public.products where id=(p_payload#>>'{copa,productId}')::uuid
   and is_active and copa_tigres_installments for share;
 if not found then raise exception 'copa_tigres_product_unavailable'; end if;
 select * into copa from public.charges where enrollment_id=e.id and product_id=product.id and status<>'void' for update;
 if not found then
   insert into public.charges(enrollment_id,product_id,charge_type_id,description,amount,currency,status,created_by)
   values(e.id,product.id,product.charge_type_id,product.name,1250,'MXN','pending',p_actor) returning * into copa;
 end if;
 select coalesce(sum(a.amount),0) into copa_before from public.payment_allocations a
   join public.payments p on p.id=a.payment_id and p.status='posted' where a.charge_id=copa.id;
 if installment is null or not ((copa_before=0 and installment in (600,1250)) or (copa_before=600 and installment=650)) then
   raise exception 'copa_cart_changed'; end if;
 lines:=jsonb_build_array(jsonb_build_object('id',copa.id,'amount',installment));
 receipt_lines:=jsonb_build_array(jsonb_build_object('description',product.name||
   case when installment=600 then ' - Reserva $600; saldo $650' when installment=650 then ' - Liquidacion $650; saldo $0' else ' - Pago completo; saldo $0' end,'amount',installment));
 total:=installment;
 for plan in select value from jsonb_array_elements(p_payload->'charges') loop
   if not coalesce((plan->>'existing')::boolean,false) then new_ids:=array_append(new_ids,(plan->>'id')::uuid); end if;
 end loop;
 -- A sentinel prevents the ordinary insert trigger from sweeping unrelated debt.
 perform set_config('app.copa_cart_credit_targets',case when cardinality(new_ids)=0 then '00000000-0000-0000-0000-000000000000' else array_to_string(new_ids,',') end,true);
 for plan in select value from jsonb_array_elements(p_payload->'charges') loop
   cid:=(plan->>'id')::uuid;
   if cid=any(ids) then raise exception 'invalid_form'; end if;
   if plan->>'currency'<>'MXN' or (plan->>'amount')::numeric<=0 then raise exception 'invalid_form'; end if;
   if coalesce((plan->>'existing')::boolean,false) then
     select * into existing from public.charges where id=cid and enrollment_id=e.id and status<>'void' for update;
     if not found or existing.copa_tigres_installments or existing.amount<>(plan->>'expected_amount')::numeric
       or exists(select 1 from public.payment_allocations where charge_id=cid)
       or exists(select 1 from public.enrollment_credit_applications where charge_id=cid) then raise exception 'copa_cart_changed'; end if;
     update public.charges set amount=(plan->>'amount')::numeric,pricing_rule_id=(plan->>'pricing_rule_id')::uuid where id=cid;
   else
     insert into public.charges(id,enrollment_id,product_id,charge_type_id,description,amount,currency,status,
       size,is_goalkeeper,uniform_fulfillment_mode,period_month,pricing_rule_id,created_by)
     values(cid,e.id,(plan->>'product_id')::uuid,(plan->>'charge_type_id')::uuid,plan->>'description',
       (plan->>'amount')::numeric,'MXN','pending',plan->>'size',(plan->>'is_goalkeeper')::boolean,
       plan->>'uniform_fulfillment_mode',(plan->>'period_month')::date,(plan->>'pricing_rule_id')::uuid,p_actor);
   end if;
   ids:=array_append(ids,cid);
   insert into public.audit_logs(actor_user_id,action,table_name,record_id,after_data)
     values(p_actor,case when coalesce((plan->>'catalog_exception')::boolean,false) then 'charge.created.catalog_exception' else 'charge.copa_cart' end,'charges',cid,plan);
 end loop;
 for item in select value from jsonb_array_elements(p_payload->'targets') loop
   cid:=(item#>>'{}')::uuid;
   if cid=any(ids) then raise exception 'invalid_form'; end if;
   ids:=array_append(ids,cid);
 end loop;
 for cid in select unnest(ids) loop
   select * into existing from public.charges where id=cid and enrollment_id=e.id and status<>'void' for update;
   if not found or existing.copa_tigres_installments or existing.currency<>'MXN' then raise exception 'copa_cart_changed'; end if;
   select coalesce(sum(a.amount),0) into funded from public.payment_allocations a join public.payments p
     on p.id=a.payment_id and p.status='posted' where a.charge_id=cid;
   select coalesce(sum(amount),0) into pending from public.enrollment_credit_applications where charge_id=cid;
   credit_total:=credit_total+case when cid=any(new_ids) then pending else 0 end;
   pending:=greatest(existing.amount-funded-pending,0);
   lines:=lines||jsonb_build_array(jsonb_build_object('id',cid,'amount',pending));
   receipt_lines:=receipt_lines||jsonb_build_array(jsonb_build_object('description',existing.description,'amount',pending));
   total:=total+pending;
 end loop;
 for part in select value from jsonb_array_elements(p_payload->'payments') loop
   if (part->>'amount')::numeric<=0 or round((part->>'amount')::numeric,2)<>(part->>'amount')::numeric then raise exception 'invalid_form'; end if;
   submitted:=submitted+(part->>'amount')::numeric;
 end loop;
 if submitted is null or submitted<>total then raise exception 'copa_cart_changed'; end if;
 paid_at:=coalesce((p_payload->>'paidAt')::timestamptz,now());
 if paid_at>now()+interval '5 minutes' then raise exception 'invalid_payment_date'; end if;
 remaining:=(lines->0->>'amount')::numeric;
 for part in select value from jsonb_array_elements(p_payload->'payments') loop
   budget:=(part->>'amount')::numeric;
   insert into public.payments(enrollment_id,amount,currency,method,status,paid_at,operator_campus_id,provider_ref,external_source,created_by,notes)
     values(e.id,budget,'MXN',(part->>'method')::public.payment_method,'posted',paid_at,p_campus,
       'copa-cart-'||p_request::text||'-'||cardinality(payment_ids),'manual',p_actor,p_payload->>'notes') returning id into pid;
   payment_ids:=array_append(payment_ids,pid);
   perform set_config('app.copa_tigres_payment',pid::text,true);
   while budget>0 loop
     if line_index>=jsonb_array_length(lines) then raise exception 'allocation_mismatch'; end if;
     take:=least(budget,remaining);
     if take>0 then
       insert into public.payment_allocations(payment_id,charge_id,amount) values(pid,(lines->line_index->>'id')::uuid,take);
     end if;
     budget:=budget-take; remaining:=remaining-take;
     if remaining=0 then line_index:=line_index+1; remaining:=coalesce((lines->line_index->>'amount')::numeric,0); end if;
   end loop;
   perform set_config('app.copa_tigres_payment','',true);
   if part->>'method'='cash' then
     select id into session_id from public.cash_sessions where campus_id=p_campus and status='open' order by opened_at desc limit 1 for update;
     if session_id is not null then insert into public.cash_session_entries(cash_session_id,payment_id,entry_type,amount,created_by)
       values(session_id,pid,'payment_in',(part->>'amount')::numeric,p_actor); end if;
   end if;
   insert into public.audit_logs(actor_user_id,action,table_name,record_id,after_data)
     values(p_actor,'payment.posted','payments',pid,jsonb_build_object('enrollment_id',e.id,'amount',part->'amount','method',part->'method','source','caja','checkout_id',p_request));
 end loop;
 perform public.sync_paid_tournament_entries_for_charges(e.id,array_prepend(copa.id,ids));
 insert into public.uniform_orders(player_id,enrollment_id,charge_id,uniform_type,size,status,sold_at,delivered_at,created_by)
 select e.player_id,e.id,c.id,case when ct.code='uniform_training' then 'training' else 'game' end,c.size,
   case when c.uniform_fulfillment_mode='deliver_now' then 'delivered' else 'pending_order' end,paid_at,
   case when c.uniform_fulfillment_mode='deliver_now' then paid_at else null end,p_actor
 from public.charges c join public.charge_types ct on ct.id=c.charge_type_id
 where c.id=any(ids) and ct.code in ('uniform_training','uniform_game')
   and not exists(select 1 from public.uniform_orders u where u.charge_id=c.id);
 select * into first_payment from public.payments where id=payment_ids[1];
 select coalesce(sum(greatest(c.amount-coalesce(a.amount,0)-coalesce(cr.amount,0),0)),0) into pending
 from public.charges c left join lateral(select sum(pa.amount) amount from public.payment_allocations pa join public.payments p on p.id=pa.payment_id and p.status='posted' where pa.charge_id=c.id) a on true
 left join lateral(select sum(amount) amount from public.enrollment_credit_applications where charge_id=c.id) cr on true
 where c.enrollment_id=e.id and c.status<>'void';
 if pending=0 then
   update public.enrollments set follow_up_status=null,follow_up_at=null,follow_up_by=null,
     follow_up_note=null,promise_date=null where id=e.id;
 end if;
 result:=jsonb_build_object('amount',total,'chargesPaid',receipt_lines,'creditAppliedAmount',credit_total,
   'remainingBalance',pending,'method',first_payment.method,'paidAt',paid_at,'folio',first_payment.folio,
   'paymentId',first_payment.id,'splitPayment',case when cardinality(payment_ids)=2 then p_payload->'payments'->1 else null end,
   'sessionWarning',exists(select 1 from public.payments p where p.id=any(payment_ids) and p.method='cash'
     and not exists(select 1 from public.cash_session_entries ce where ce.payment_id=p.id)));
 insert into public.copa_cart_checkouts(id,enrollment_id,actor_id,fingerprint,payment_ids,receipt)
   values(p_request,e.id,p_actor,p_fingerprint,payment_ids,result);
 return jsonb_build_object('payment_id',first_payment.id);
end $$;
revoke all on function public.checkout_copa_cart(uuid,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.checkout_copa_cart(uuid,uuid,uuid,uuid,text,jsonb) to service_role;
