-- Sports operations v1
-- Adds a campus-scoped director_deportivo role plus competition/source-team/squad planning.

insert into public.app_roles (code, name)
values ('director_deportivo', 'Director Deportivo')
on conflict (code) do update
set name = excluded.name;

create or replace function public.is_director_deportivo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.app_roles ar on ar.id = ur.role_id
    where ur.user_id = auth.uid()
      and ar.code = 'director_deportivo'
  );
$$;

grant execute on function public.is_director_deportivo() to authenticated, anon;

create or replace function public.can_access_sports_campus(p_campus_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_director_admin()
    or exists (
      select 1
      from public.user_roles ur
      join public.app_roles ar on ar.id = ur.role_id
      where ur.user_id = auth.uid()
        and ar.code = 'director_deportivo'
        and (ur.campus_id = p_campus_id or ur.campus_id is null)
    );
$$;

grant execute on function public.can_access_sports_campus(uuid) to authenticated, anon;

alter table public.tournaments
  add column if not exists product_id uuid null references public.products(id) on delete set null,
  add column if not exists signup_deadline date null,
  add column if not exists eligible_birth_year_min int null,
  add column if not exists eligible_birth_year_max int null;

create table if not exists public.tournament_source_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  source_team_id uuid not null references public.teams(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (tournament_id, source_team_id)
);

create table if not exists public.tournament_squads (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  source_team_id uuid not null references public.teams(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  label text not null,
  min_target_players int not null default 0,
  max_target_players int not null default 14,
  refuerzo_limit int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id),
  unique (tournament_id, source_team_id, label),
  check (min_target_players >= 0),
  check (max_target_players >= min_target_players),
  check (refuerzo_limit >= 0)
);

alter table public.tournament_player_entries
  add column if not exists charge_id uuid null references public.charges(id) on delete set null,
  add column if not exists signed_up_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_tournaments_active_product_campus
  on public.tournaments(product_id, campus_id)
  where product_id is not null and is_active = true;

create index if not exists idx_tournaments_product on public.tournaments(product_id);
create index if not exists idx_tournaments_signup_deadline on public.tournaments(signup_deadline);
create index if not exists idx_tournament_source_teams_tournament on public.tournament_source_teams(tournament_id);
create index if not exists idx_tournament_source_teams_source on public.tournament_source_teams(source_team_id);
create index if not exists idx_tournament_squads_tournament on public.tournament_squads(tournament_id);
create index if not exists idx_tournament_squads_source on public.tournament_squads(source_team_id);
create index if not exists idx_tournament_player_entries_charge on public.tournament_player_entries(charge_id);

alter table public.tournament_source_teams enable row level security;
alter table public.tournament_squads enable row level security;

drop policy if exists "director_admin can manage tournaments" on public.tournaments;
drop policy if exists "director_admin can manage tournament_team_entries" on public.tournament_team_entries;
drop policy if exists "director_admin can manage tournament_player_entries" on public.tournament_player_entries;

create policy sports_staff_manage_tournaments
  on public.tournaments for all
  using (
    public.is_director_admin()
    or (campus_id is not null and public.can_access_sports_campus(campus_id))
  )
  with check (
    public.is_director_admin()
    or (campus_id is not null and public.can_access_sports_campus(campus_id))
  );

create policy sports_staff_manage_tournament_team_entries
  on public.tournament_team_entries for all
  using (
    public.is_director_admin()
    or exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and t.campus_id is not null
        and public.can_access_sports_campus(t.campus_id)
    )
  )
  with check (
    public.is_director_admin()
    or exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and t.campus_id is not null
        and public.can_access_sports_campus(t.campus_id)
    )
  );

create policy sports_staff_manage_tournament_player_entries
  on public.tournament_player_entries for all
  using (
    public.is_director_admin()
    or exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and t.campus_id is not null
        and public.can_access_sports_campus(t.campus_id)
    )
  )
  with check (
    public.is_director_admin()
    or exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and t.campus_id is not null
        and public.can_access_sports_campus(t.campus_id)
    )
  );

create policy sports_staff_manage_tournament_source_teams
  on public.tournament_source_teams for all
  using (
    public.is_director_admin()
    or exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and t.campus_id is not null
        and public.can_access_sports_campus(t.campus_id)
    )
  )
  with check (
    public.is_director_admin()
    or exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and t.campus_id is not null
        and public.can_access_sports_campus(t.campus_id)
    )
  );

create policy sports_staff_manage_tournament_squads
  on public.tournament_squads for all
  using (
    public.is_director_admin()
    or exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and t.campus_id is not null
        and public.can_access_sports_campus(t.campus_id)
    )
  )
  with check (
    public.is_director_admin()
    or exists (
      select 1
      from public.tournaments t
      where t.id = tournament_id
        and t.campus_id is not null
        and public.can_access_sports_campus(t.campus_id)
    )
  );

comment on table public.tournament_source_teams is
  'Source rosters that feed a competition. One source team can feed multiple competition squads.';

comment on table public.tournament_squads is
  'Competition squads tied to a tournament and source team. Each squad maps to a real team for secondary assignments.';
