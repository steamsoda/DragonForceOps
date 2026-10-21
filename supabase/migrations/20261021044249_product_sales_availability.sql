-- Sales retirement is independent of sports reporting and existing balances.
alter table public.products
  add column sales_enabled boolean not null default true;

comment on column public.products.sales_enabled is
  'Allows new product charges. False preserves product/tournament visibility and settlement of existing charges.';

create function public.guard_product_new_charge_sales()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and new.product_id is not distinct from old.product_id then
    return new;
  end if;
  if new.product_id is null then return new; end if;

  -- UNION terminates cycles; a bundle cannot bypass a retired entitlement.
  if exists (
    with recursive included(id) as (
      select new.product_id
      union
      select e.target_product_id
      from public.product_bundle_entitlements e join included i on i.id=e.source_product_id
      where e.is_active
    )
    select 1 from included i left join public.products p on p.id=i.id
    where p.id is null or not p.sales_enabled
  ) then
    raise exception 'product_sales_disabled' using errcode='23514';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_product_new_charge_sales() from public, anon, authenticated;
create trigger guard_product_new_charge_sales
  before insert or update of product_id on public.charges
  for each row execute function public.guard_product_new_charge_sales();

-- Exact editions only. Do not deactivate products, tournaments, or entitlements.
update public.products set sales_enabled=false
where name in (
  'Copa Tigres 2026',
  'Liga Golden Septiembre',
  'Copa LH15 Septiembre',
  'Rosa Power Cup 13 Edicion',
  'Superliga Regia 17 Edicion'
);
