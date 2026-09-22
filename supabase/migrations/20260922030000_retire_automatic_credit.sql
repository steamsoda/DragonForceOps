-- Coordinated release only: explicit checkout and selection UI must ship with
-- this migration. Existing credit creation/reopening and financial history stay.
do $$ declare definition text; marker text := 'if exists (select 1 from public.enrollment_credit_applications where application_key=p_request) then'; begin
  definition:=pg_get_functiondef('public.apply_explicit_credit_selection(uuid,uuid,jsonb,numeric)'::regprocedure);
  if strpos(definition,marker)=0 then raise exception 'explicit_credit_request_guard_drift'; end if;
  execute replace(definition,marker,'if exists (select 1 from public.enrollment_credit_applications where application_key=p_request) or exists(select 1 from public.explicit_cart_checkouts where id=p_request) then');
end $$;

do $$ declare signature regprocedure; begin
  for signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='apply_enrollment_credit_to_charges' loop
    execute format('revoke execute on function %s from public,anon,authenticated,service_role',signature);
  end loop;
end $$;
drop trigger if exists trg_apply_explicit_credit_after_charge_insert on public.charges;

-- Compatibility read for older definer workflows (annulment/refund). Returning
-- zero prevents those callers, including old deployments, from spending credit.
create or replace function public.auto_apply_enrollment_credit_fifo(
  p_enrollment_id uuid,p_actor_id uuid default null,p_application_key uuid default null,p_notes text default null
) returns table(applied_amount numeric,application_count integer,remaining_credit_amount numeric)
language sql stable security definer set search_path=pg_catalog,public as $$
  select 0::numeric,0::integer,coalesce(sum(greatest(c.original_amount-coalesce(a.amount,0),0)),0)
  from public.enrollment_credits c left join lateral(
    select sum(amount) amount from public.enrollment_credit_applications where credit_id=c.id
  ) a on true where c.enrollment_id=p_enrollment_id and c.status='open'
$$;
revoke all on function public.auto_apply_enrollment_credit_fifo(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.auto_apply_enrollment_credit_fifo(uuid,uuid,uuid,text) to service_role;
comment on function public.auto_apply_enrollment_credit_fifo(uuid,uuid,uuid,text) is 'Retired automatic application. Read-only compatibility result; explicit selection is required.';

create or replace function public.reconcile_returning_enrollment_credit_fifo(p_enrollment_id uuid,p_actor_id uuid)
returns table(legacy_applied_amount numeric,legacy_allocation_count integer,explicit_applied_amount numeric,
  explicit_application_count integer,remaining_legacy_credit_amount numeric,remaining_explicit_credit_amount numeric)
language plpgsql security definer set search_path=pg_catalog,public as $$
declare e public.enrollments;
begin
  if auth.role() is distinct from 'service_role' or not exists(select 1 from auth.users where id=p_actor_id and email_confirmed_at is not null
    and (banned_until is null or banned_until<=now())) then raise exception 'forbidden' using errcode='42501'; end if;
  select * into e from public.enrollments where id=p_enrollment_id;
  if not found or e.status not in ('ended','cancelled') then raise exception 'historical_enrollment_required'; end if;
  if exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id where ur.user_id=p_actor_id and r.code in ('director_readonly','porto_viewer'))
    or not exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id where ur.user_id=p_actor_id
      and (r.code in ('superadmin','director_admin') or (r.code='front_desk' and ur.campus_id=e.campus_id))) then raise exception 'forbidden' using errcode='42501'; end if;
  return query select 0::numeric,0::integer,0::numeric,0::integer,
    (select coalesce(sum(greatest(p.amount
      -coalesce((select sum(amount) from public.payment_allocations where payment_id=p.id),0)
      -coalesce((select sum(original_amount) from public.enrollment_credits where source_payment_id=p.id and status<>'void'),0)
      -coalesce((select sum(amount) from public.charge_cash_refund_sources where payment_id=p.id),0),0)),0)
      from public.payments p where p.enrollment_id=e.id and p.status='posted' and not exists(select 1 from public.payment_refunds where payment_id=p.id)),
    (select remaining_credit_amount from public.auto_apply_enrollment_credit_fifo(e.id));
end $$;
revoke all on function public.reconcile_returning_enrollment_credit_fifo(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reconcile_returning_enrollment_credit_fifo(uuid,uuid) to service_role;
