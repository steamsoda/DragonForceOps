-- Run only on Preview after applying the migration. No real charges/payments.
begin;
set local statement_timeout='30s';
create temporary table sales_guard_test(id integer primary key,product_id uuid,amount numeric);
-- Seed only the temporary table before attaching the guard.
insert into sales_guard_test
select 200,id,1250 from public.products where name='Copa Tigres 2026';
create trigger sales_guard_test before insert or update of product_id on sales_guard_test
for each row execute function public.guard_product_new_charge_sales();
do $$
declare p record; n integer:=0; active_id uuid;
begin
  for p in select id,name from public.products where name in (
    'Copa Tigres 2026','Liga Golden Septiembre','Copa LH15 Septiembre',
    'Rosa Power Cup 13 Edicion','Superliga Regia 17 Edicion'
  ) loop
    n:=n+1;
    if (select sales_enabled from public.products where id=p.id) then
      raise exception 'Retired product still enabled: %',p.name;
    end if;
    begin
      insert into sales_guard_test values(n,p.id,600);
      raise exception 'Retired insert was accepted: %',p.name;
    exception when check_violation then
      if sqlerrm<>'product_sales_disabled' then raise; end if;
    end;
    insert into sales_guard_test values(n,null,600);
    begin
      update sales_guard_test set product_id=p.id where id=n;
      raise exception 'Retired reassignment was accepted: %',p.name;
    exception when check_violation then
      if sqlerrm<>'product_sales_disabled' then raise; end if;
    end;
  end loop;
  if n=0 then raise exception 'No retired fixtures found'; end if;
  select id into strict active_id from public.products where name='McAllen Cup 2026' and sales_enabled;
  insert into sales_guard_test values(100,active_id,1995);
  update sales_guard_test set product_id=product_id,amount=1995 where id=100;
  for p in select distinct e.source_product_id id from public.product_bundle_entitlements e
    join public.products target on target.id=e.target_product_id
    where e.is_active and not target.sales_enabled loop
    begin
      insert into sales_guard_test values(300,p.id,600);
      raise exception 'Retired bundle insert was accepted';
    exception when check_violation then
      if sqlerrm<>'product_sales_disabled' then raise; end if;
    end;
  end loop;
end;
$$;
-- Simulate a pre-existing balance only in the temporary table.
update sales_guard_test set product_id=product_id,amount=1250 where id=200;
delete from sales_guard_test where id=200;
grant all on sales_guard_test to authenticated;
create temporary table sales_guard_actors as
select distinct on (r.code) r.code,u.user_id
from public.user_roles u join public.app_roles r on r.id=u.role_id
where r.code in ('front_desk','director_admin') order by r.code,u.user_id;
do $$
declare actor record; retired uuid; active_id uuid; actors integer:=0;
begin
  select id into strict retired from public.products where name='Copa Tigres 2026';
  select id into strict active_id from public.products where name='McAllen Cup 2026';
  for actor in select * from sales_guard_actors loop
    actors:=actors+1;
    perform set_config('request.jwt.claim.sub',actor.user_id::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor.user_id,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    insert into sales_guard_test values(400+actors,active_id,1995);
    begin
      insert into sales_guard_test values(500+actors,retired,600);
      raise exception 'Authenticated retired insert was accepted';
    exception when check_violation then
      if sqlerrm<>'product_sales_disabled' then raise; end if;
    end;
    execute 'reset role';
  end loop;
  if actors<>2 then raise exception 'Missing staff role fixtures'; end if;
end;
$$;
select 'PASS retired insert/reassignment denial, McAllen acceptance and existing-row preservation' result;
rollback;
