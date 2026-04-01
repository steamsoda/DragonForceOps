create table if not exists public.corte_checkpoints (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_at timestamptz null,
  printed_at timestamptz null,
  closed_by uuid null references auth.users(id) on delete restrict,
  notes text null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_corte_checkpoints_one_open_per_campus
  on public.corte_checkpoints (campus_id)
  where status = 'open';

create index if not exists idx_corte_checkpoints_campus_opened
  on public.corte_checkpoints (campus_id, opened_at desc);

alter table public.corte_checkpoints enable row level security;

drop policy if exists director_admin_all_corte_checkpoints on public.corte_checkpoints;
create policy director_admin_all_corte_checkpoints on public.corte_checkpoints
for all
using (public.is_director_admin())
with check (public.is_director_admin());

drop policy if exists front_desk_read_corte_checkpoints on public.corte_checkpoints;
create policy front_desk_read_corte_checkpoints on public.corte_checkpoints
for select to authenticated
using (public.is_front_desk());

drop policy if exists front_desk_insert_corte_checkpoints on public.corte_checkpoints;
create policy front_desk_insert_corte_checkpoints on public.corte_checkpoints
for insert to authenticated
with check (public.is_front_desk());

drop policy if exists front_desk_update_corte_checkpoints on public.corte_checkpoints;
create policy front_desk_update_corte_checkpoints on public.corte_checkpoints
for update to authenticated
using (public.is_front_desk())
with check (public.is_front_desk());
