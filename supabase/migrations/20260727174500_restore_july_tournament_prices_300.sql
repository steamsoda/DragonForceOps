with target_products as (
  select id
  from public.products
  where name in (
    'Superliga Regia 17 Edicion',
    'Rosa Power Cup 13 Edicion'
  )
)
update public.product_pricing_rules rule
set ends_on = date '2026-07-26'
where rule.product_id in (select id from target_products)
  and rule.amount = 500
  and rule.starts_on = date '2026-07-26'
  and rule.ends_on is null;

with target_products as (
  select id
  from public.products
  where name in (
    'Superliga Regia 17 Edicion',
    'Rosa Power Cup 13 Edicion'
  )
)
update public.product_pricing_rules rule
set
  ends_on = null,
  gender = null,
  birth_year_min = null,
  birth_year_max = null,
  priority = 0
where rule.product_id in (select id from target_products)
  and rule.amount = 300
  and rule.starts_on = date '2026-07-27';

with target_products as (
  select id
  from public.products
  where name in (
    'Superliga Regia 17 Edicion',
    'Rosa Power Cup 13 Edicion'
  )
)
insert into public.product_pricing_rules (
  product_id,
  amount,
  starts_on,
  ends_on,
  gender,
  birth_year_min,
  birth_year_max,
  priority
)
select
  product.id,
  300,
  date '2026-07-27',
  null,
  null,
  null,
  null,
  0
from target_products product
where not exists (
  select 1
  from public.product_pricing_rules existing
  where existing.product_id = product.id
    and existing.amount = 300
    and existing.starts_on = date '2026-07-27'
);
