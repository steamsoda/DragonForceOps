-- ── Tournaments ───────────────────────────────────────────────────────────────
--
-- Phase 2 schema for tournament management.
-- UI is NOT built yet — this migration just establishes the data model.
-- Build order: (1) team assignment UX clean-up → (2) tournament UI.
--
-- tournaments: a named competition event (e.g. "Superliga Regia Apertura 2026")
-- tournament_team_entries: which teams are registered for a tournament
-- tournament_player_entries: used ONLY when is_mandatory = false on the
--   tournament; records which individual players opted in. When mandatory,
--   all active players on the team are implicitly entered — no rows needed here.

create table if not exists public.tournaments (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  campus_id    uuid null references public.campuses(id) on delete set null,
  start_date   date null,
  end_date     date null,
  is_mandatory boolean not null default true,
  -- is_mandatory: true  → charges generated for every active player on each entered team
  --               false → charges generated only for players in tournament_player_entries
  charge_amount numeric(10,2) null,
  -- charge_amount: the per-player fee. Null = set per-team when registering.
  notes        text null,
  is_active    boolean not null default true,
  created_by   uuid null references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.tournament_team_entries (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references public.tournaments(id) on delete cascade,
  team_id         uuid not null references public.teams(id) on delete restrict,
  charge_amount   numeric(10,2) null,
  -- charge_amount here overrides tournaments.charge_amount for this specific team
  charges_created boolean not null default false,
  -- charges_created: set to true after bulk charge generation runs for this entry
  created_at      timestamptz not null default now(),
  unique (tournament_id, team_id)
);

create table if not exists public.tournament_player_entries (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references public.tournaments(id) on delete cascade,
  enrollment_id   uuid not null references public.enrollments(id) on delete restrict,
  charge_created  boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (tournament_id, enrollment_id)
);

-- Indexes
create index if not exists idx_tournaments_campus on public.tournaments(campus_id);
create index if not exists idx_tournament_team_entries_tournament on public.tournament_team_entries(tournament_id);
create index if not exists idx_tournament_team_entries_team on public.tournament_team_entries(team_id);
create index if not exists idx_tournament_player_entries_tournament on public.tournament_player_entries(tournament_id);
create index if not exists idx_tournament_player_entries_enrollment on public.tournament_player_entries(enrollment_id);

-- RLS (director_admin+ only — front desk has no tournament access)
alter table public.tournaments enable row level security;
alter table public.tournament_team_entries enable row level security;
alter table public.tournament_player_entries enable row level security;

create policy "director_admin can manage tournaments"
  on public.tournaments for all
  using (public.is_director_admin())
  with check (public.is_director_admin());

create policy "director_admin can manage tournament_team_entries"
  on public.tournament_team_entries for all
  using (public.is_director_admin())
  with check (public.is_director_admin());

create policy "director_admin can manage tournament_player_entries"
  on public.tournament_player_entries for all
  using (public.is_director_admin())
  with check (public.is_director_admin());

comment on table public.tournaments is
  'Tournament/cup events. is_mandatory controls whether all team players are charged or only opted-in players.';
comment on table public.tournament_team_entries is
  'Teams registered for a tournament. charges_created tracks whether bulk charge generation has run.';
comment on table public.tournament_player_entries is
  'Per-player opt-in for non-mandatory tournaments. Not used for mandatory tournaments.';
