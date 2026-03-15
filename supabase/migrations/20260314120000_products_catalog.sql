-- ── Product catalog ────────────────────────────────────────────────────────────
-- Adds product_categories and products tables.
-- Extends charges with product_id (nullable FK) and size (nullable text).
--
-- Non-breaking: product_id is nullable so every existing charge, query, report,
-- and RLS policy is completely unaffected. Corte Diario still groups by
-- charge_type (the category layer). Product-level KPIs are additive queries.

-- ── product_categories ────────────────────────────────────────────────────────

create table if not exists public.product_categories (
  id         uuid    primary key default gen_random_uuid(),
  name       text    not null,
  slug       text    not null unique,
  sort_order int     not null default 0,
  is_active  boolean not null default true
);

-- ── products ──────────────────────────────────────────────────────────────────

create table if not exists public.products (
  id             uuid          primary key default gen_random_uuid(),
  category_id    uuid          not null references public.product_categories(id) on delete restrict,
  charge_type_id uuid          not null references public.charge_types(id)       on delete restrict,
  name           text          not null,
  default_amount numeric(12,2) null,            -- null = staff must enter amount
  currency       text          not null default 'MXN',
  has_sizes      boolean       not null default false,
  is_active      boolean       not null default true,
  sort_order     int           not null default 0,
  created_at     timestamptz   not null default now()
);

-- ── Extend charges ────────────────────────────────────────────────────────────

alter table public.charges
  add column if not exists product_id uuid null references public.products(id) on delete set null,
  add column if not exists size       text null;

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.product_categories enable row level security;
alter table public.products            enable row level security;

-- Any operational staff (director_admin, superadmin, front_desk) can read
create policy op_read_product_categories on public.product_categories
  for select to authenticated
  using (public.has_operational_access());

create policy op_read_products on public.products
  for select to authenticated
  using (public.has_operational_access());

-- Director admin / superadmin have full write access
create policy director_admin_product_categories on public.product_categories
  for all to authenticated
  using (public.is_director_admin())
  with check (public.is_director_admin());

create policy director_admin_products on public.products
  for all to authenticated
  using (public.is_director_admin())
  with check (public.is_director_admin());

-- ── Seed: categories ──────────────────────────────────────────────────────────

insert into public.product_categories (name, slug, sort_order)
values
  ('Uniformes',     'uniforms',     1),
  ('Mensualidades', 'tuition',      2),
  ('Torneos',       'tournaments',  3)
on conflict (slug) do nothing;

-- ── Seed: products ────────────────────────────────────────────────────────────

insert into public.products (category_id, charge_type_id, name, default_amount, has_sizes, sort_order)
values
  (
    (select id from public.product_categories where slug = 'uniforms'),
    (select id from public.charge_types       where code = 'uniform_training'),
    'Kit Entrenamiento', 600, true, 1
  ),
  (
    (select id from public.product_categories where slug = 'uniforms'),
    (select id from public.charge_types       where code = 'uniform_game'),
    'Kit Partido', 600, true, 2
  ),
  (
    (select id from public.product_categories where slug = 'tournaments'),
    (select id from public.charge_types       where code = 'tournament'),
    'Superliga Regia', 350, false, 1
  ),
  (
    (select id from public.product_categories where slug = 'tournaments'),
    (select id from public.charge_types       where code = 'cup'),
    'Rosa Power Cup', 350, false, 2
  )
on conflict do nothing;
