alter table public.tournament_source_teams
  add column if not exists participation_mode text not null default 'competitive',
  add column if not exists roster_status text not null default 'planning',
  add column if not exists approved_at timestamptz null,
  add column if not exists approved_by uuid null references auth.users(id) on delete set null,
  add column if not exists default_squad_id uuid null references public.tournament_squads(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tournament_source_teams'::regclass
      and conname = 'tournament_source_teams_participation_mode_check'
  ) then
    alter table public.tournament_source_teams
      add constraint tournament_source_teams_participation_mode_check
      check (participation_mode in ('competitive', 'invited'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tournament_source_teams'::regclass
      and conname = 'tournament_source_teams_roster_status_check'
  ) then
    alter table public.tournament_source_teams
      add constraint tournament_source_teams_roster_status_check
      check (roster_status in ('planning', 'approved'));
  end if;
end $$;

alter table public.tournament_player_entries
  add column if not exists entry_status text not null default 'confirmed';

update public.tournament_player_entries
set entry_status = coalesce(entry_status, 'confirmed')
where entry_status is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tournament_player_entries'::regclass
      and conname = 'tournament_player_entries_entry_status_check'
  ) then
    alter table public.tournament_player_entries
      add constraint tournament_player_entries_entry_status_check
      check (entry_status in ('confirmed', 'interested'));
  end if;
end $$;

create index if not exists idx_tournament_source_teams_participation_mode
  on public.tournament_source_teams(tournament_id, participation_mode);

create index if not exists idx_tournament_source_teams_roster_status
  on public.tournament_source_teams(tournament_id, roster_status);

create index if not exists idx_tournament_player_entries_status
  on public.tournament_player_entries(tournament_id, entry_status);

comment on column public.tournament_source_teams.participation_mode is
  'Sports participation mode for the team in this competition: competitive or invited.';

comment on column public.tournament_source_teams.roster_status is
  'Roster planning state for this competition team: planning or approved.';

comment on column public.tournament_source_teams.default_squad_id is
  'Primary competition squad used as the approved/final roster snapshot for this source team.';

comment on column public.tournament_player_entries.entry_status is
  'Sports signup state: confirmed when fully paid through Caja, interested when manually tracked before payment.';
