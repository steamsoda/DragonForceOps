-- Weekly WhatsApp callup packets. This is an operational snapshot only and
-- does not mutate tournament registrations, charges, payments, or rosters.

create table if not exists public.weekly_callups (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete restrict,
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  program text not null check (program in ('selectivo', 'futbol_para_todos')),
  week_start date not null,
  status text not null default 'draft' check (status in ('draft', 'ready', 'shared')),
  roster_snapshot_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campus_id, tournament_id, program, week_start),
  check (extract(isodow from week_start) = 1)
);

create table if not exists public.weekly_callup_categories (
  id uuid primary key default gen_random_uuid(),
  weekly_callup_id uuid not null references public.weekly_callups(id) on delete cascade,
  training_group_id uuid null references public.training_groups(id) on delete set null,
  category_label text not null,
  birth_year_min int null,
  birth_year_max int null,
  training_group_name_snapshot text not null,
  sort_order int not null default 0,
  is_rest boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (weekly_callup_id, training_group_id),
  check (birth_year_min is null or birth_year_max is null or birth_year_max >= birth_year_min)
);

create table if not exists public.weekly_callup_players (
  id uuid primary key default gen_random_uuid(),
  weekly_callup_category_id uuid not null references public.weekly_callup_categories(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  player_name_snapshot text not null,
  birth_year int null,
  training_group_id uuid null references public.training_groups(id) on delete set null,
  training_group_name_snapshot text not null,
  eligibility_source text not null check (eligibility_source in ('direct', 'bundle', 'manual_unpaid')),
  roster_status text not null default 'included' check (roster_status in ('included', 'excluded')),
  source_snapshot_at timestamptz not null default now(),
  adjusted_by uuid null references auth.users(id) on delete set null,
  adjusted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (weekly_callup_category_id, enrollment_id)
);

create table if not exists public.weekly_callup_games (
  id uuid primary key default gen_random_uuid(),
  weekly_callup_category_id uuid not null references public.weekly_callup_categories(id) on delete cascade,
  match_date date not null,
  arrival_time time null,
  venue text null,
  opponent text null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_weekly_callups_week_campus
  on public.weekly_callups(week_start desc, campus_id, program);
create index if not exists idx_weekly_callup_categories_parent
  on public.weekly_callup_categories(weekly_callup_id, sort_order);
create index if not exists idx_weekly_callup_players_category
  on public.weekly_callup_players(weekly_callup_category_id, roster_status, player_name_snapshot);
create index if not exists idx_weekly_callup_games_category
  on public.weekly_callup_games(weekly_callup_category_id, match_date, sort_order);

create or replace function public.can_manage_weekly_callup_campus(p_campus_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_director_admin()
    or public.can_access_sports_campus(p_campus_id)
    or (public.is_front_desk() and public.can_access_campus(p_campus_id));
$$;

revoke all on function public.can_manage_weekly_callup_campus(uuid) from public, anon;
grant execute on function public.can_manage_weekly_callup_campus(uuid) to authenticated;

alter table public.weekly_callups enable row level security;
alter table public.weekly_callup_categories enable row level security;
alter table public.weekly_callup_players enable row level security;
alter table public.weekly_callup_games enable row level security;

create policy weekly_callups_manage on public.weekly_callups
  for all to authenticated
  using (public.can_manage_weekly_callup_campus(campus_id))
  with check (public.can_manage_weekly_callup_campus(campus_id));

create policy weekly_callup_categories_manage on public.weekly_callup_categories
  for all to authenticated
  using (exists (
    select 1 from public.weekly_callups c
    where c.id = weekly_callup_id
      and public.can_manage_weekly_callup_campus(c.campus_id)
  ))
  with check (exists (
    select 1 from public.weekly_callups c
    where c.id = weekly_callup_id
      and public.can_manage_weekly_callup_campus(c.campus_id)
  ));

create policy weekly_callup_players_manage on public.weekly_callup_players
  for all to authenticated
  using (exists (
    select 1
    from public.weekly_callup_categories category
    join public.weekly_callups callup on callup.id = category.weekly_callup_id
    where category.id = weekly_callup_category_id
      and public.can_manage_weekly_callup_campus(callup.campus_id)
  ))
  with check (exists (
    select 1
    from public.weekly_callup_categories category
    join public.weekly_callups callup on callup.id = category.weekly_callup_id
    where category.id = weekly_callup_category_id
      and public.can_manage_weekly_callup_campus(callup.campus_id)
      and (
        eligibility_source <> 'manual_unpaid'
        or public.can_access_sports_campus(callup.campus_id)
      )
  ));

create policy weekly_callup_games_manage on public.weekly_callup_games
  for all to authenticated
  using (exists (
    select 1
    from public.weekly_callup_categories category
    join public.weekly_callups callup on callup.id = category.weekly_callup_id
    where category.id = weekly_callup_category_id
      and public.can_manage_weekly_callup_campus(callup.campus_id)
  ))
  with check (exists (
    select 1
    from public.weekly_callup_categories category
    join public.weekly_callups callup on callup.id = category.weekly_callup_id
    where category.id = weekly_callup_category_id
      and public.can_manage_weekly_callup_campus(callup.campus_id)
  ));

grant select, insert, update, delete on public.weekly_callups to authenticated;
grant select, insert, update, delete on public.weekly_callup_categories to authenticated;
grant select, insert, update, delete on public.weekly_callup_players to authenticated;
grant select, insert, update, delete on public.weekly_callup_games to authenticated;

comment on table public.weekly_callups is 'Saved weekly WhatsApp callup packet headers with a frozen paid-roster timestamp.';
comment on table public.weekly_callup_players is 'Frozen player eligibility snapshots; manual_unpaid is director-only.';
comment on table public.weekly_callup_games is 'One or more games for a category in a weekly callup packet.';
