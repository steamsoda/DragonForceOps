create table if not exists public.product_bundle_entitlements (
  id uuid primary key default gen_random_uuid(),
  source_product_id uuid not null references public.products(id) on delete cascade,
  target_product_id uuid not null references public.products(id) on delete cascade,
  gender text null check (gender in ('male', 'female')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint product_bundle_entitlements_distinct_products_check
    check (source_product_id <> target_product_id)
);

create unique index if not exists idx_product_bundle_entitlements_unique_rule
  on public.product_bundle_entitlements (
    source_product_id,
    target_product_id,
    coalesce(gender, '')
  );

create index if not exists idx_product_bundle_entitlements_source
  on public.product_bundle_entitlements(source_product_id)
  where is_active;

create index if not exists idx_product_bundle_entitlements_target
  on public.product_bundle_entitlements(target_product_id)
  where is_active;

alter table public.product_bundle_entitlements enable row level security;

grant select on public.product_bundle_entitlements to authenticated;
grant select, insert, update, delete on public.product_bundle_entitlements to service_role;

drop policy if exists product_bundle_entitlements_select on public.product_bundle_entitlements;
create policy product_bundle_entitlements_select
  on public.product_bundle_entitlements
  for select to authenticated
  using (public.has_operational_access());

comment on table public.product_bundle_entitlements is
  'Non-financial rules that let one paid source product grant registration in one or more target tournament products.';

with combo_charge_type as (
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
  combo_charge_type.id,
  'Combo Torneos Julio 2026',
  null,
  false,
  14,
  true
from combo_charge_type
where not exists (
  select 1
  from public.products existing
  where existing.name = 'Combo Torneos Julio 2026'
);

with combo_product as (
  select id
  from public.products
  where name = 'Combo Torneos Julio 2026'
  limit 1
),
rule_inputs(amount, starts_on, ends_on, gender, priority) as (
  values
    (400::numeric, date '2026-07-14', null::date, 'male'::text, 100),
    (400::numeric, date '2026-07-14', null::date, 'female'::text, 100)
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
  combo_product.id,
  rule_inputs.amount,
  rule_inputs.starts_on,
  rule_inputs.ends_on,
  rule_inputs.gender,
  null,
  null,
  rule_inputs.priority
from combo_product
cross join rule_inputs
where not exists (
  select 1
  from public.product_pricing_rules existing
  where existing.product_id = combo_product.id
    and existing.amount = rule_inputs.amount
    and existing.starts_on = rule_inputs.starts_on
    and existing.ends_on is not distinct from rule_inputs.ends_on
    and existing.gender is not distinct from rule_inputs.gender
    and existing.birth_year_min is null
    and existing.birth_year_max is null
);

with product_ids as (
  select
    max(id::text) filter (where name = 'Combo Torneos Julio 2026')::uuid as combo_id,
    max(id::text) filter (where name = 'Torneo de Leyendas')::uuid as leyendas_id,
    max(id::text) filter (where name = 'Superliga Regia 17 Edicion')::uuid as superliga_id,
    max(id::text) filter (where name = 'Rosa Power Cup 13 Edicion')::uuid as rosa_id
  from public.products
  where name in (
    'Combo Torneos Julio 2026',
    'Torneo de Leyendas',
    'Superliga Regia 17 Edicion',
    'Rosa Power Cup 13 Edicion'
  )
),
entitlement_inputs(target_product_id, gender) as (
  select leyendas_id, null::text from product_ids
  union all
  select superliga_id, 'male'::text from product_ids
  union all
  select rosa_id, 'female'::text from product_ids
)
insert into public.product_bundle_entitlements (
  source_product_id,
  target_product_id,
  gender,
  is_active
)
select
  product_ids.combo_id,
  entitlement_inputs.target_product_id,
  entitlement_inputs.gender,
  true
from product_ids
cross join entitlement_inputs
where product_ids.combo_id is not null
  and entitlement_inputs.target_product_id is not null
on conflict do nothing;
