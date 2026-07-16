alter table public.product_pricing_rules
  add column if not exists required_paid_product_id uuid null
  references public.products(id) on delete cascade;

create index if not exists idx_product_pricing_rules_required_paid_product
  on public.product_pricing_rules(required_paid_product_id)
  where required_paid_product_id is not null;

comment on column public.product_pricing_rules.required_paid_product_id is
  'Optional prerequisite product that must already have a fully allocated direct charge on the same enrollment for this price rule to apply.';

with combo_product as (
  select id
  from public.products
  where name = 'Combo Torneos Julio 2026'
  limit 1
)
update public.product_pricing_rules rule
set ends_on = date '2026-07-14'
from combo_product
where rule.product_id = combo_product.id
  and rule.amount = 400
  and rule.starts_on = date '2026-07-14'
  and rule.ends_on is null
  and rule.required_paid_product_id is null;

with product_ids as (
  select
    max(id::text) filter (where name = 'Combo Torneos Julio 2026')::uuid as combo_id,
    max(id::text) filter (where name = 'Torneo de Leyendas')::uuid as leyendas_id
  from public.products
  where name in ('Combo Torneos Julio 2026', 'Torneo de Leyendas')
),
rule_inputs(amount, gender, required_paid_product_id, priority) as (
  select 300::numeric, 'male'::text, null::uuid, 100
  union all
  select 300::numeric, 'female'::text, null::uuid, 100
  union all
  select 150::numeric, 'male'::text, leyendas_id, 200 from product_ids
  union all
  select 150::numeric, 'female'::text, leyendas_id, 200 from product_ids
)
insert into public.product_pricing_rules (
  product_id,
  amount,
  starts_on,
  ends_on,
  gender,
  birth_year_min,
  birth_year_max,
  required_paid_product_id,
  priority
)
select
  product_ids.combo_id,
  rule_inputs.amount,
  date '2026-07-15',
  null,
  rule_inputs.gender,
  null,
  null,
  rule_inputs.required_paid_product_id,
  rule_inputs.priority
from product_ids
cross join rule_inputs
where product_ids.combo_id is not null
  and (rule_inputs.amount = 300 or rule_inputs.required_paid_product_id is not null)
  and not exists (
    select 1
    from public.product_pricing_rules existing
    where existing.product_id = product_ids.combo_id
      and existing.amount = rule_inputs.amount
      and existing.starts_on = date '2026-07-15'
      and existing.ends_on is null
      and existing.gender is not distinct from rule_inputs.gender
      and existing.birth_year_min is null
      and existing.birth_year_max is null
      and existing.required_paid_product_id is not distinct from rule_inputs.required_paid_product_id
  );
