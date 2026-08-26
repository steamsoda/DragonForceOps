-- Keep Caja availability aligned with the extended J5 registration deadline.
update public.product_pricing_rules as pricing_rule
set ends_on = date '2026-09-03'
from public.products as product
where product.id = pricing_rule.product_id
  and product.name = 'J5 San Pedro Agosto 2026'
  and pricing_rule.ends_on = date '2026-08-20';
