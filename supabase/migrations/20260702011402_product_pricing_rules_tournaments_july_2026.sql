create table if not exists public.product_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  starts_on date not null,
  ends_on date null,
  gender text null check (gender in ('male', 'female')),
  birth_year_min integer null,
  birth_year_max integer null,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  constraint product_pricing_rules_birth_year_range_check
    check (
      birth_year_min is null
      or birth_year_max is null
      or birth_year_min <= birth_year_max
    )
);

create index if not exists idx_product_pricing_rules_product_dates
  on public.product_pricing_rules(product_id, starts_on, ends_on);

create index if not exists idx_product_pricing_rules_match
  on public.product_pricing_rules(product_id, gender, birth_year_min, birth_year_max, priority);

alter table public.product_pricing_rules enable row level security;

grant select on public.product_pricing_rules to authenticated;
grant select, insert, update, delete on public.product_pricing_rules to service_role;

drop policy if exists product_pricing_rules_select on public.product_pricing_rules;
create policy product_pricing_rules_select
  on public.product_pricing_rules
  for select to authenticated
  using (public.has_operational_access());

drop policy if exists product_pricing_rules_manage on public.product_pricing_rules;
create policy product_pricing_rules_manage
  on public.product_pricing_rules
  for all to authenticated
  using (public.is_director_admin())
  with check (public.is_director_admin());

comment on table public.product_pricing_rules is
  'Optional dynamic product pricing rules used by Caja. If a product has active rules, Caja resolves price by Monterrey business date, player gender, and birth year.';

comment on column public.product_pricing_rules.ends_on is
  'Inclusive Monterrey business date. Products with rules and no active rule are hidden from Caja.';

with product_inputs(name, charge_type_code, amount, sort_order) as (
  values
    ('Superliga Regia 17 Edicion', 'tournament', null::numeric, 10),
    ('Rosa Power Cup 13 Edicion', 'cup', null::numeric, 11),
    ('Copa Polideportivo', 'tournament', null::numeric, 12),
    ('Torneo de Leyendas', 'tournament', 150::numeric, 13)
)
insert into public.products (charge_type_id, name, default_amount, has_sizes, sort_order, is_active)
select ct.id, pi.name, pi.amount, false, pi.sort_order, true
from product_inputs pi
join public.charge_types ct on ct.code = pi.charge_type_code
where not exists (
  select 1
  from public.products existing
  where existing.name = pi.name
);

with
target_products as (
  select p.id, p.name
  from public.products p
  where p.name in (
    'Superliga Regia 17 Edicion',
    'Rosa Power Cup 13 Edicion',
    'Copa Polideportivo',
    'Torneo de Leyendas'
  )
),
rule_inputs(product_name, amount, starts_on, ends_on, gender, birth_year_min, birth_year_max, priority) as (
  values
    ('Superliga Regia 17 Edicion', 300::numeric, date '2026-07-01', date '2026-07-25', null::text, null::integer, null::integer, 0),
    ('Superliga Regia 17 Edicion', 500::numeric, date '2026-07-26', null::date, null::text, null::integer, null::integer, 0),
    ('Rosa Power Cup 13 Edicion', 300::numeric, date '2026-07-01', date '2026-07-25', null::text, null::integer, null::integer, 0),
    ('Rosa Power Cup 13 Edicion', 500::numeric, date '2026-07-26', null::date, null::text, null::integer, null::integer, 0),
    ('Copa Polideportivo', 500::numeric, date '2026-07-01', date '2026-07-18', 'female'::text, null::integer, null::integer, 100),
    ('Copa Polideportivo', 700::numeric, date '2026-07-01', date '2026-07-18', null::text, 2009, 2013, 10),
    ('Copa Polideportivo', 600::numeric, date '2026-07-01', date '2026-07-18', null::text, 2014, 2017, 10),
    ('Copa Polideportivo', 500::numeric, date '2026-07-01', date '2026-07-18', null::text, 2018, 2020, 10)
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
  tp.id,
  ri.amount,
  ri.starts_on,
  ri.ends_on,
  ri.gender,
  ri.birth_year_min,
  ri.birth_year_max,
  ri.priority
from rule_inputs ri
join target_products tp on tp.name = ri.product_name
where not exists (
  select 1
  from public.product_pricing_rules existing
  where existing.product_id = tp.id
    and existing.amount = ri.amount
    and existing.starts_on = ri.starts_on
    and existing.ends_on is not distinct from ri.ends_on
    and existing.gender is not distinct from ri.gender
    and existing.birth_year_min is not distinct from ri.birth_year_min
    and existing.birth_year_max is not distinct from ri.birth_year_max
);
