-- Optional product availability restrictions by training group.
-- Existing products remain unrestricted unless rows are added here.

create table if not exists public.product_training_group_restrictions (
  product_id uuid not null references public.products(id) on delete cascade,
  training_group_id uuid not null references public.training_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  primary key (product_id, training_group_id)
);

create index if not exists idx_product_training_group_restrictions_group
  on public.product_training_group_restrictions(training_group_id);

alter table public.product_training_group_restrictions enable row level security;

drop policy if exists product_training_group_restrictions_select
  on public.product_training_group_restrictions;
create policy product_training_group_restrictions_select
  on public.product_training_group_restrictions
  for select to authenticated
  using (public.has_operational_access());

drop policy if exists product_training_group_restrictions_manage
  on public.product_training_group_restrictions;
create policy product_training_group_restrictions_manage
  on public.product_training_group_restrictions
  for all to authenticated
  using (public.is_director_admin())
  with check (public.is_director_admin());

comment on table public.product_training_group_restrictions is
  'Optional product availability allow-list. If a product has no rows, it is available to all eligible Caja enrollments. If rows exist, Caja may charge it only to players with an active assignment in one of those training groups.';
