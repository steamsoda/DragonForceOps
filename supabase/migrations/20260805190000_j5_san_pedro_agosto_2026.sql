alter table public.product_pricing_rules
  add column if not exists campus_id uuid null references public.campuses(id) on delete cascade,
  add column if not exists training_program text null;

create index if not exists idx_product_pricing_rules_campus_program
  on public.product_pricing_rules(product_id, campus_id, training_program, priority desc);

comment on column public.product_pricing_rules.campus_id is
  'Optional campus required for this Caja price and availability rule.';

comment on column public.product_pricing_rules.training_program is
  'Optional active training-group program required for this Caja price and availability rule.';

with tournament_charge_type as (
  select id
  from public.charge_types
  where code = 'tournament'
  limit 1
)
insert into public.products (
  charge_type_id,
  name,
  default_amount,
  has_sizes,
  sort_order,
  is_active
)
select
  tournament_charge_type.id,
  'J5 San Pedro Agosto 2026',
  null,
  false,
  30,
  true
from tournament_charge_type
where not exists (
  select 1 from public.products where name = 'J5 San Pedro Agosto 2026'
);

with
target_product as (
  select id from public.products where name = 'J5 San Pedro Agosto 2026' limit 1
),
polideportivo as (
  select id from public.products where name = 'Copa Polideportivo' limit 1
),
campus_ids as (
  select
    max(id::text) filter (where code = 'LINDA_VISTA')::uuid as linda_vista_id,
    max(id::text) filter (where code = 'CONTRY')::uuid as contry_id
  from public.campuses
),
rule_inputs(amount, campus_id, training_program, gender, birth_year_min, birth_year_max, required_paid_product_id, priority) as (
  select 1000::numeric, linda_vista_id, 'selectivo'::text, null::text, 2014, 2014, null::uuid, 100 from campus_ids
  union all select 1000, linda_vista_id, 'selectivo', null, 2015, 2015, null, 100 from campus_ids
  union all select 1200, linda_vista_id, 'selectivo', null, 2016, 2016, null, 100 from campus_ids
  union all select 1000, linda_vista_id, 'selectivo', null, 2020, 2020, null, 100 from campus_ids
  union all select 1000, linda_vista_id, 'futbol_para_todos', null, 2020, 2020, null, 100 from campus_ids
  union all select 1200, contry_id, 'selectivo', null, 2014, 2014, null, 100 from campus_ids
  union all select 1200, contry_id, 'selectivo', null, 2015, 2015, null, 100 from campus_ids
  union all select 1000, contry_id, 'selectivo', null, 2016, 2016, null, 100 from campus_ids
  union all select 1000, contry_id, 'futbol_para_todos', 'female', 2011, 2013, null, 100 from campus_ids
  union all
  select 500, contry_id, 'futbol_para_todos', 'female', 2011, 2013, polideportivo.id, 200
  from campus_ids cross join polideportivo
)
insert into public.product_pricing_rules (
  product_id,
  amount,
  starts_on,
  ends_on,
  campus_id,
  training_program,
  gender,
  birth_year_min,
  birth_year_max,
  required_paid_product_id,
  priority
)
select
  target_product.id,
  rule_inputs.amount,
  date '2026-08-05',
  date '2026-08-20',
  rule_inputs.campus_id,
  rule_inputs.training_program,
  rule_inputs.gender,
  rule_inputs.birth_year_min,
  rule_inputs.birth_year_max,
  rule_inputs.required_paid_product_id,
  rule_inputs.priority
from target_product
cross join rule_inputs
where rule_inputs.campus_id is not null
  and not exists (
    select 1
    from public.product_pricing_rules existing
    where existing.product_id = target_product.id
      and existing.amount = rule_inputs.amount
      and existing.starts_on = date '2026-08-05'
      and existing.ends_on = date '2026-08-20'
      and existing.campus_id is not distinct from rule_inputs.campus_id
      and existing.training_program is not distinct from rule_inputs.training_program
      and existing.gender is not distinct from rule_inputs.gender
      and existing.birth_year_min is not distinct from rule_inputs.birth_year_min
      and existing.birth_year_max is not distinct from rule_inputs.birth_year_max
      and existing.required_paid_product_id is not distinct from rule_inputs.required_paid_product_id
  );

with
target_product as (
  select id, name from public.products where name = 'J5 San Pedro Agosto 2026' limit 1
),
target_campuses as (
  select id from public.campuses where code in ('LINDA_VISTA', 'CONTRY')
)
insert into public.tournaments (
  name,
  campus_id,
  product_id,
  start_date,
  end_date,
  signup_deadline,
  is_active,
  is_mandatory
)
select
  target_product.name,
  target_campuses.id,
  target_product.id,
  null,
  null,
  date '2026-08-20',
  true,
  false
from target_product
cross join target_campuses
where not exists (
  select 1
  from public.tournaments existing
  where existing.product_id = target_product.id
    and existing.campus_id = target_campuses.id
    and existing.is_active = true
  );
