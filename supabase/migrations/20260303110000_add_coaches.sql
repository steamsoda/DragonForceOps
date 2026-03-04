-- Add coaches table and link coaches to teams.
-- Phase 1: coaches are names + contact info only (no system accounts yet).
-- Phase 2+: link coaches to auth.users via user_roles when they get app access.

create table if not exists public.coaches (
  id           uuid primary key default gen_random_uuid(),
  first_name   text not null,
  last_name    text not null,
  phone        text null,
  email        text null,
  campus_id    uuid null references public.campuses(id) on delete set null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Index for active coaches per campus
create index if not exists coaches_campus_active_idx on public.coaches(campus_id, is_active);

-- RLS: director_admin can manage coaches; all authenticated staff can read
alter table public.coaches enable row level security;

create policy "coaches_select_authenticated"
  on public.coaches for select
  to authenticated
  using (true);

create policy "coaches_insert_director"
  on public.coaches for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_roles ur
      join public.app_roles ar on ar.id = ur.role_id
      where ur.user_id = auth.uid() and ar.code = 'director_admin'
    )
  );

create policy "coaches_update_director"
  on public.coaches for update
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      join public.app_roles ar on ar.id = ur.role_id
      where ur.user_id = auth.uid() and ar.code = 'director_admin'
    )
  );

-- Add coach_id to teams (nullable — teams may not have an assigned coach yet)
alter table public.teams
  add column if not exists coach_id uuid null references public.coaches(id) on delete set null;

create index if not exists teams_coach_idx on public.teams(coach_id);
