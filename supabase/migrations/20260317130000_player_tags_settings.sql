-- ── App settings ─────────────────────────────────────────────────────────────
-- Generic key/value store for director-controlled feature flags and settings.

create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  label      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

alter table public.app_settings enable row level security;

create policy "director_admin can manage app_settings"
  on public.app_settings for all
  using (public.is_director_admin())
  with check (public.is_director_admin());

-- Allow all authenticated users to read settings (needed for server components)
create policy "authenticated can read app_settings"
  on public.app_settings for select
  using (auth.role() = 'authenticated');

-- Default tag settings (all on except uniform — no orders exist yet)
insert into public.app_settings (key, value, label) values
  ('tag_payment',    'true',  'Tag: Al corriente / Pendiente'),
  ('tag_team_type',  'true',  'Tag: Selectivo / Clases'),
  ('tag_goalkeeper', 'true',  'Tag: Portero'),
  ('tag_uniform',    'false', 'Tag: Estado de uniforme')
on conflict (key) do nothing;

-- ── Players: goalkeeper flag ──────────────────────────────────────────────────

alter table public.players
  add column if not exists is_goalkeeper boolean not null default false;

-- ── Uniform orders ────────────────────────────────────────────────────────────
-- Tracks uniform orders per player/enrollment, separate from charges.
-- status: 'ordered' = requested/paid, 'delivered' = physically handed to player.

create table if not exists public.uniform_orders (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  uniform_type  text not null check (uniform_type in ('training', 'game')),
  size          text null,
  status        text not null default 'ordered' check (status in ('ordered', 'delivered')),
  charge_id     uuid null references public.charges(id) on delete set null,
  ordered_at    timestamptz not null default now(),
  delivered_at  timestamptz null,
  notes         text null,
  created_by    uuid null references auth.users(id) on delete set null,
  updated_at    timestamptz not null default now()
);

create index if not exists idx_uniform_orders_player    on public.uniform_orders (player_id);
create index if not exists idx_uniform_orders_enrollment on public.uniform_orders (enrollment_id);

alter table public.uniform_orders enable row level security;

-- All staff can view and create/update (front desk marks deliveries)
create policy "staff can manage uniform_orders"
  on public.uniform_orders for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

comment on table public.uniform_orders is
  'Tracks uniform order and delivery status per player/enrollment. Independent of charges.';
comment on column public.uniform_orders.status is
  'ordered = awaiting delivery; delivered = physically handed to player';
