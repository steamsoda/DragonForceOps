-- Opt-in product policy; no existing product or account is modified.
alter table public.products add column copa_tigres_installments boolean not null default false;
alter table public.charges add column copa_tigres_installments boolean not null default false;
alter table public.products add constraint copa_tigres_price check
 (not copa_tigres_installments or (default_amount=1250 and currency='MXN' and not has_sizes));
alter table public.charges add constraint copa_tigres_charge_price check
 (not copa_tigres_installments or (amount=1250 and currency='MXN' and product_id is not null));
create unique index copa_tigres_one_live_charge on public.charges(enrollment_id,product_id)
 where copa_tigres_installments and status<>'void';

create function public.guard_copa_tigres_charge() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if tg_op='UPDATE' and old.copa_tigres_installments and
   (new.amount<>old.amount or new.product_id is distinct from old.product_id
    or new.enrollment_id<>old.enrollment_id or not new.copa_tigres_installments) then
   raise exception 'copa_tigres_fixed_charge';
 end if;
 new.copa_tigres_installments := coalesce((select p.copa_tigres_installments
   from public.products p where p.id=new.product_id),false);
 return new;
end $$;
create trigger copa_tigres_charge_guard before insert or update on public.charges
 for each row execute function public.guard_copa_tigres_charge();

create function public.guard_copa_tigres_product() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.copa_tigres_installments and not exists(select 1 from public.charge_types
   where id=new.charge_type_id and code in ('tournament','cup')) then
   raise exception 'copa_tigres_tournament_only';
 end if;
 if tg_op='UPDATE' and new.copa_tigres_installments is distinct from old.copa_tigres_installments
   and exists(select 1 from public.charges where product_id=old.id) then
   raise exception 'copa_tigres_policy_locked';
 end if;
 return new;
end $$;
create trigger copa_tigres_product_guard before insert or update on public.products
 for each row execute function public.guard_copa_tigres_product();

-- Skip explicit credit at its source, including the AFTER INSERT charge sweep.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.auto_apply_enrollment_credit_fifo(uuid,uuid,uuid,text)'::regprocedure);
 if strpos(definition,'and c.status <> ''void''')=0 then raise exception 'credit function drift'; end if;
 definition:=replace(definition,'and c.status <> ''void''',
   'and c.status <> ''void'' and not c.copa_tigres_installments');
 execute definition;
 definition:=pg_get_functiondef('public.apply_explicit_credit_after_charge_insert()'::regprocedure);
 if strpos(definition,'if new.status <> ''void'' then')=0 then raise exception 'charge credit trigger drift'; end if;
 execute replace(definition,'if new.status <> ''void'' then',
   'if new.status <> ''void'' and not new.copa_tigres_installments then');
 definition:=pg_get_functiondef('public.sync_paid_tournament_entries_for_charges(uuid,uuid[])'::regprocedure);
 if strpos(definition,'paid.funded_amount + 0.009 >= charge.amount')=0 then raise exception 'signup function drift'; end if;
 execute replace(definition,'paid.funded_amount + 0.009 >= charge.amount',
   'paid.funded_amount + 0.009 >= case when charge.copa_tigres_installments then 600 else charge.amount end');
end $$;

create function public.guard_copa_tigres_funding() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if tg_op='UPDATE' and old.charge_id is distinct from new.charge_id
   and exists(select 1 from public.charges where id=old.charge_id and copa_tigres_installments) then
   raise exception 'copa_tigres_use_installment_payment';
 end if;
 if exists(select 1 from public.charges where id=new.charge_id and copa_tigres_installments) then
   if tg_table_name='enrollment_credit_applications' then
     raise exception 'copa_tigres_no_credit';
   end if;
   if current_setting('app.copa_tigres_payment',true) is distinct from new.payment_id::text then
     raise exception 'copa_tigres_use_installment_payment';
   end if;
 end if;
 return new;
end $$;
create trigger copa_tigres_payment_guard before insert or update on public.payment_allocations
 for each row execute function public.guard_copa_tigres_funding();
create trigger copa_tigres_credit_guard before insert or update on public.enrollment_credit_applications
 for each row execute function public.guard_copa_tigres_funding();

create function public.pay_copa_tigres_installment(
 p_enrollment uuid,p_product uuid,p_amount numeric,p_method public.payment_method,
 p_operator_campus uuid,p_request uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.enrollments; p public.products; c public.charges; paid numeric;
 payment_id uuid; prior public.payments; actor uuid:=auth.uid(); session_id uuid;
begin
 if p_request is null or actor is null or not exists(select 1 from auth.users u where u.id=actor
   and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now()))
 or exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id
   where ur.user_id=actor and r.code in ('director_readonly','porto_viewer')) then
   raise exception 'forbidden' using errcode='42501';
 end if;
 select * into e from public.enrollments where id=p_enrollment for update;
 if not found or e.status<>'active' then raise exception 'enrollment_inactive'; end if;
 if not exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id
   where ur.user_id=actor and (r.code in ('superadmin','director_admin')
   or (r.code='front_desk' and ur.campus_id=e.campus_id and ur.campus_id=p_operator_campus))) then
   raise exception 'forbidden' using errcode='42501';
 end if;
 if not exists(select 1 from public.campuses where id=p_operator_campus and is_active) then
   raise exception 'invalid_campus';
 end if;
 select * into p from public.products where id=p_product and copa_tigres_installments and is_active;
 if not found then raise exception 'copa_tigres_product_unavailable'; end if;
 select * into prior from public.payments where enrollment_id=e.id
   and provider_ref='copa-tigres-'||p_request::text;
 if found then
   if prior.amount<>p_amount or prior.method<>p_method or prior.status<>'posted'
     or prior.created_by<>actor or prior.operator_campus_id<>p_operator_campus
     or not exists(select 1 from public.payment_allocations a join public.charges ch on ch.id=a.charge_id
       where a.payment_id=prior.id and ch.product_id=p.id and ch.status<>'void') then
     raise exception 'copa_tigres_request_conflict';
   end if;
   return jsonb_build_object('payment_id',prior.id,'amount',prior.amount);
 end if;
 select * into c from public.charges where enrollment_id=e.id and product_id=p.id and status<>'void' for update;
 if not found then
   if p_amount not in (600,1250) then raise exception 'copa_tigres_invalid_installment'; end if;
   insert into public.charges(enrollment_id,product_id,charge_type_id,description,amount,currency,status,created_by)
   values(e.id,p.id,p.charge_type_id,p.name,1250,'MXN','pending',actor) returning * into c;
 end if;
 select coalesce(sum(a.amount),0) into paid from public.payment_allocations a
 join public.payments pay on pay.id=a.payment_id and pay.status='posted' where a.charge_id=c.id;
 if p_amount is null or not ((paid=0 and p_amount in (600,1250)) or (paid=600 and p_amount=650)) then
   raise exception 'copa_tigres_invalid_installment';
 end if;
 insert into public.payments(enrollment_id,amount,currency,method,status,paid_at,operator_campus_id,
   provider_ref,external_source,created_by,notes)
 values(e.id,p_amount,'MXN',p_method,'posted',now(),p_operator_campus,
   'copa-tigres-'||p_request::text,'manual',actor,
   case when p_amount=600 then 'Copa Tigres: reserva $600; saldo $650'
        when p_amount=650 then 'Copa Tigres: liquidacion $650; saldo $0'
        else 'Copa Tigres: pago completo $1250; saldo $0' end) returning id into payment_id;
 perform set_config('app.copa_tigres_payment',payment_id::text,true);
 insert into public.payment_allocations(payment_id,charge_id,amount) values(payment_id,c.id,p_amount);
 perform set_config('app.copa_tigres_payment','',true);
 if p_method='cash' then
   select id into session_id from public.cash_sessions where campus_id=p_operator_campus
     and status='open' order by opened_at desc limit 1 for update;
   if session_id is not null then
     insert into public.cash_session_entries(cash_session_id,payment_id,entry_type,amount,created_by)
       values(session_id,payment_id,'payment_in',p_amount,actor);
   end if;
 end if;
 insert into public.audit_logs(actor_user_id,action,table_name,record_id,after_data)
 values(actor,'payment.copa_tigres_installment','payments',payment_id,
   jsonb_build_object('enrollment_id',e.id,'charge_id',c.id,'amount',p_amount,'pending',1250-paid-p_amount));
 perform public.sync_paid_tournament_entries_for_charges(e.id,array[c.id]);
 return jsonb_build_object('payment_id',payment_id,'amount',p_amount);
end $$;
revoke all on function public.pay_copa_tigres_installment(uuid,uuid,numeric,public.payment_method,uuid,uuid) from public,anon;
grant execute on function public.pay_copa_tigres_installment(uuid,uuid,numeric,public.payment_method,uuid,uuid) to authenticated;
revoke all on function public.guard_copa_tigres_charge(),public.guard_copa_tigres_product(),public.guard_copa_tigres_funding() from public,anon,authenticated;

-- Explicitly requested new tournament, unrestricted, dates intentionally unset.
do $$ declare product uuid; charge_type uuid; begin
 if exists(select 1 from public.products where lower(name)='copa tigres 2026') then
   raise exception 'Copa Tigres already exists; reconcile before activation';
 end if;
 select id into charge_type from public.charge_types where code='cup' and is_active;
 if charge_type is null then raise exception 'Missing cup charge type'; end if;
 insert into public.products(name,charge_type_id,default_amount,currency,is_active,copa_tigres_installments)
   values('Copa Tigres 2026',charge_type,1250,'MXN',true,true) returning id into product;
 insert into public.tournaments(name,campus_id,product_id,is_active,is_mandatory,charge_amount)
   select 'Copa Tigres 2026',id,product,true,false,1250 from public.campuses where is_active;
end $$;
