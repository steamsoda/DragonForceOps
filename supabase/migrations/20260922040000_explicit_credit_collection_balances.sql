-- Collection status is charge funding, not net cash received. Unused credit
-- remains available; it cannot make an unpaid charge appear settled.
create view public.v_charge_collection_balances with (security_invoker=true) as
select c.id as charge_id,c.enrollment_id,c.due_date,c.period_month,ct.code as charge_type_code,
  greatest(c.amount
    -coalesce((select sum(a.amount) from public.payment_allocations a
      join public.payments p on p.id=a.payment_id and p.status='posted' where a.charge_id=c.id),0)
    -coalesce((select sum(a.amount) from public.enrollment_credit_applications a where a.charge_id=c.id),0),0)::numeric(12,2) as balance
from public.charges c join public.charge_types ct on ct.id=c.charge_type_id where c.status<>'void';

create view public.v_enrollment_collection_balances with (security_invoker=true) as
select b.enrollment_id,b.total_charges,b.total_payments,b.balance as accounting_balance,
  coalesce((select sum(c.balance) from public.v_charge_collection_balances c where c.enrollment_id=b.enrollment_id),0)::numeric(12,2) as balance
from public.v_enrollment_balances b;
revoke all on public.v_charge_collection_balances,public.v_enrollment_collection_balances from public,anon;
grant select on public.v_charge_collection_balances,public.v_enrollment_collection_balances to authenticated,service_role;

-- Keep the installed role/campus guards, signatures and sorting intact.
do $$ declare signature text; definition text; begin
  foreach signature in array array['public.search_players_for_caja(text)',
    'public.list_caja_players_by_campus_year(uuid,integer)','public.list_pending_enrollments_full(uuid)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    if strpos(definition,'public.v_enrollment_balances')=0
      or strpos(definition,'director_readonly_deny_legacy_rpc')=0 then raise exception 'collection_reader_drift: %',signature; end if;
    definition:=replace(definition,'public.v_enrollment_balances','public.v_enrollment_collection_balances');
    if signature='public.list_pending_enrollments_full(uuid)' then
      if strpos(definition,'min(ch.due_date) filter (where ch.status <> ''void'' and ch.due_date is not null)')=0 then raise exception 'collection_due_date_drift'; end if;
      definition:=replace(definition,'min(ch.due_date) filter (where ch.status <> ''void'' and ch.due_date is not null)',
        'min(ch.due_date) filter (where ch.balance>0 and ch.due_date is not null)');
      definition:=replace(definition,'from public.charges ch group by ch.enrollment_id',
        'from public.v_charge_collection_balances ch group by ch.enrollment_id');
    end if;
    execute definition;
  end loop;
end $$;

do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.director_caja_players(text,uuid,integer)'::regprocedure);
  if strpos(definition,'public.v_enrollment_balances')=0 or strpos(definition,'is_director_readonly')=0 then raise exception 'director_collection_reader_drift'; end if;
  execute replace(definition,'public.v_enrollment_balances','public.v_enrollment_collection_balances');
end $$;
