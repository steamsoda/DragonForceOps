-- Independent tournament squad foundation.
-- Paid tournament entries remain candidate truth. These tables only store
-- explicit sporting organization, exclusions, and immutable roster history.

create table if not exists public.competition_roster_squads (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  squad_kind text not null default 'single'
    check (squad_kind in ('single', 'azul', 'blanco', 'custom')),
  program text null
    check (program is null or program in ('futbol_para_todos', 'selectivo', 'little_dragons')),
  category_label text null,
  gender text null check (gender is null or gender in ('male', 'female', 'mixed')),
  status text not null default 'planning'
    check (status in ('planning', 'ready', 'archived')),
  sort_order int not null default 0,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, name)
);

create table if not exists public.competition_roster_squad_groups (
  squad_id uuid not null references public.competition_roster_squads(id) on delete cascade,
  training_group_id uuid not null references public.training_groups(id) on delete restrict,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (squad_id, training_group_id)
);

create table if not exists public.competition_roster_squad_members (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.competition_roster_squads(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  source text not null default 'paid' check (source in ('paid', 'manual')),
  reason text null,
  added_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (squad_id, enrollment_id)
);

create table if not exists public.competition_roster_exclusions (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  reason text not null,
  excluded_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, enrollment_id)
);

create table if not exists public.competition_roster_snapshots (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  label text not null,
  captured_by uuid null references auth.users(id) on delete set null,
  captured_at timestamptz not null default now(),
  notes text null
);

create table if not exists public.competition_roster_snapshot_squads (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.competition_roster_snapshots(id) on delete cascade,
  source_squad_id uuid null references public.competition_roster_squads(id) on delete set null,
  name_snapshot text not null,
  squad_kind_snapshot text not null
    check (squad_kind_snapshot in ('single', 'azul', 'blanco', 'custom')),
  program_snapshot text null,
  category_label_snapshot text null,
  gender_snapshot text null,
  source_group_names_snapshot text[] not null default '{}',
  sort_order int not null default 0
);

create table if not exists public.competition_roster_snapshot_members (
  id uuid primary key default gen_random_uuid(),
  snapshot_squad_id uuid not null references public.competition_roster_snapshot_squads(id) on delete cascade,
  enrollment_id uuid null references public.enrollments(id) on delete set null,
  player_id uuid null references public.players(id) on delete set null,
  player_name_snapshot text not null,
  player_public_id_snapshot text null,
  birth_year_snapshot int null,
  training_group_name_snapshot text null,
  membership_source_snapshot text not null check (membership_source_snapshot in ('paid', 'manual')),
  sort_order int not null default 0
);

create table if not exists public.competition_roster_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  squad_id uuid null references public.competition_roster_squads(id) on delete set null,
  enrollment_id uuid null references public.enrollments(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  actor_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_competition_roster_squads_tournament
  on public.competition_roster_squads(tournament_id, status, sort_order, name);
create index if not exists idx_competition_roster_squad_groups_group
  on public.competition_roster_squad_groups(training_group_id, squad_id);
create index if not exists idx_competition_roster_members_enrollment
  on public.competition_roster_squad_members(enrollment_id, squad_id);
create index if not exists idx_competition_roster_exclusions_enrollment
  on public.competition_roster_exclusions(enrollment_id, tournament_id);
create index if not exists idx_competition_roster_snapshots_tournament
  on public.competition_roster_snapshots(tournament_id, captured_at desc);
create index if not exists idx_competition_roster_snapshot_squads_snapshot
  on public.competition_roster_snapshot_squads(snapshot_id, sort_order);
create index if not exists idx_competition_roster_snapshot_members_squad
  on public.competition_roster_snapshot_members(snapshot_squad_id, sort_order);
create index if not exists idx_competition_roster_events_tournament
  on public.competition_roster_events(tournament_id, created_at desc);
create index if not exists idx_competition_roster_events_squad
  on public.competition_roster_events(squad_id, created_at desc);
create index if not exists idx_competition_roster_events_enrollment
  on public.competition_roster_events(enrollment_id, created_at desc);

create or replace function public.validate_competition_roster_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_tournament_campus_id uuid;
  v_record_campus_id uuid;
begin
  if tg_table_name = 'competition_roster_squad_groups' then
    select squad.tournament_id, tournament.campus_id, training_group.campus_id
      into v_tournament_id, v_tournament_campus_id, v_record_campus_id
    from public.competition_roster_squads squad
    join public.tournaments tournament on tournament.id = squad.tournament_id
    join public.training_groups training_group on training_group.id = new.training_group_id
    where squad.id = new.squad_id;
  elsif tg_table_name = 'competition_roster_squad_members' then
    select squad.tournament_id, tournament.campus_id, enrollment.campus_id
      into v_tournament_id, v_tournament_campus_id, v_record_campus_id
    from public.competition_roster_squads squad
    join public.tournaments tournament on tournament.id = squad.tournament_id
    join public.enrollments enrollment on enrollment.id = new.enrollment_id
    where squad.id = new.squad_id;

    if exists (
      select 1
      from public.competition_roster_exclusions exclusion
      where exclusion.tournament_id = v_tournament_id
        and exclusion.enrollment_id = new.enrollment_id
    ) then
      raise exception 'competition_roster_member_is_excluded';
    end if;
  elsif tg_table_name = 'competition_roster_exclusions' then
    select tournament.campus_id, enrollment.campus_id
      into v_tournament_campus_id, v_record_campus_id
    from public.tournaments tournament
    join public.enrollments enrollment on enrollment.id = new.enrollment_id
    where tournament.id = new.tournament_id;

    if exists (
      select 1
      from public.competition_roster_squad_members member
      join public.competition_roster_squads squad on squad.id = member.squad_id
      where squad.tournament_id = new.tournament_id
        and member.enrollment_id = new.enrollment_id
    ) then
      raise exception 'competition_roster_exclusion_has_membership';
    end if;
  end if;

  if v_tournament_campus_id is null or v_record_campus_id is null then
    raise exception 'competition_roster_scope_not_found';
  end if;

  if v_tournament_campus_id <> v_record_campus_id then
    raise exception 'competition_roster_campus_mismatch';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_competition_roster_scope() from public, anon;

drop trigger if exists validate_competition_roster_squad_group_scope on public.competition_roster_squad_groups;
create trigger validate_competition_roster_squad_group_scope
  before insert or update on public.competition_roster_squad_groups
  for each row execute function public.validate_competition_roster_scope();

drop trigger if exists validate_competition_roster_member_scope on public.competition_roster_squad_members;
create trigger validate_competition_roster_member_scope
  before insert or update on public.competition_roster_squad_members
  for each row execute function public.validate_competition_roster_scope();

drop trigger if exists validate_competition_roster_exclusion_scope on public.competition_roster_exclusions;
create trigger validate_competition_roster_exclusion_scope
  before insert or update on public.competition_roster_exclusions
  for each row execute function public.validate_competition_roster_scope();

alter table public.competition_roster_squads enable row level security;
alter table public.competition_roster_squad_groups enable row level security;
alter table public.competition_roster_squad_members enable row level security;
alter table public.competition_roster_exclusions enable row level security;
alter table public.competition_roster_snapshots enable row level security;
alter table public.competition_roster_snapshot_squads enable row level security;
alter table public.competition_roster_snapshot_members enable row level security;
alter table public.competition_roster_events enable row level security;

create policy competition_roster_squads_read on public.competition_roster_squads
  for select to authenticated
  using (exists (
    select 1 from public.tournaments tournament
    where tournament.id = competition_roster_squads.tournament_id
      and public.can_access_campus(tournament.campus_id)
  ));
create policy competition_roster_squads_manage on public.competition_roster_squads
  for all to authenticated
  using (exists (
    select 1 from public.tournaments tournament
    where tournament.id = competition_roster_squads.tournament_id
      and public.can_access_sports_campus(tournament.campus_id)
  ))
  with check (exists (
    select 1 from public.tournaments tournament
    where tournament.id = competition_roster_squads.tournament_id
      and public.can_access_sports_campus(tournament.campus_id)
  ));

create policy competition_roster_squad_groups_read on public.competition_roster_squad_groups
  for select to authenticated
  using (exists (
    select 1
    from public.competition_roster_squads squad
    join public.tournaments tournament on tournament.id = squad.tournament_id
    where squad.id = competition_roster_squad_groups.squad_id
      and public.can_access_campus(tournament.campus_id)
  ));
create policy competition_roster_squad_groups_manage on public.competition_roster_squad_groups
  for all to authenticated
  using (exists (
    select 1
    from public.competition_roster_squads squad
    join public.tournaments tournament on tournament.id = squad.tournament_id
    where squad.id = competition_roster_squad_groups.squad_id
      and public.can_access_sports_campus(tournament.campus_id)
  ))
  with check (exists (
    select 1
    from public.competition_roster_squads squad
    join public.tournaments tournament on tournament.id = squad.tournament_id
    where squad.id = competition_roster_squad_groups.squad_id
      and public.can_access_sports_campus(tournament.campus_id)
  ));

create policy competition_roster_members_read on public.competition_roster_squad_members
  for select to authenticated
  using (exists (
    select 1
    from public.competition_roster_squads squad
    join public.tournaments tournament on tournament.id = squad.tournament_id
    where squad.id = competition_roster_squad_members.squad_id
      and public.can_access_campus(tournament.campus_id)
  ));
create policy competition_roster_members_manage on public.competition_roster_squad_members
  for all to authenticated
  using (exists (
    select 1
    from public.competition_roster_squads squad
    join public.tournaments tournament on tournament.id = squad.tournament_id
    where squad.id = competition_roster_squad_members.squad_id
      and public.can_access_sports_campus(tournament.campus_id)
  ))
  with check (exists (
    select 1
    from public.competition_roster_squads squad
    join public.tournaments tournament on tournament.id = squad.tournament_id
    where squad.id = competition_roster_squad_members.squad_id
      and public.can_access_sports_campus(tournament.campus_id)
  ));

create policy competition_roster_exclusions_read on public.competition_roster_exclusions
  for select to authenticated
  using (exists (
    select 1 from public.tournaments tournament
    where tournament.id = competition_roster_exclusions.tournament_id
      and public.can_access_campus(tournament.campus_id)
  ));
create policy competition_roster_exclusions_manage on public.competition_roster_exclusions
  for all to authenticated
  using (exists (
    select 1 from public.tournaments tournament
    where tournament.id = competition_roster_exclusions.tournament_id
      and public.can_access_sports_campus(tournament.campus_id)
  ))
  with check (exists (
    select 1 from public.tournaments tournament
    where tournament.id = competition_roster_exclusions.tournament_id
      and public.can_access_sports_campus(tournament.campus_id)
  ));

create policy competition_roster_snapshots_read on public.competition_roster_snapshots
  for select to authenticated
  using (exists (
    select 1 from public.tournaments tournament
    where tournament.id = competition_roster_snapshots.tournament_id
      and public.can_access_campus(tournament.campus_id)
  ));
create policy competition_roster_snapshots_insert on public.competition_roster_snapshots
  for insert to authenticated
  with check (exists (
    select 1 from public.tournaments tournament
    where tournament.id = competition_roster_snapshots.tournament_id
      and public.can_access_sports_campus(tournament.campus_id)
  ));

create policy competition_roster_snapshot_squads_read on public.competition_roster_snapshot_squads
  for select to authenticated
  using (exists (
    select 1
    from public.competition_roster_snapshots snapshot
    join public.tournaments tournament on tournament.id = snapshot.tournament_id
    where snapshot.id = competition_roster_snapshot_squads.snapshot_id
      and public.can_access_campus(tournament.campus_id)
  ));
create policy competition_roster_snapshot_squads_insert on public.competition_roster_snapshot_squads
  for insert to authenticated
  with check (exists (
    select 1
    from public.competition_roster_snapshots snapshot
    join public.tournaments tournament on tournament.id = snapshot.tournament_id
    where snapshot.id = competition_roster_snapshot_squads.snapshot_id
      and public.can_access_sports_campus(tournament.campus_id)
  ));

create policy competition_roster_snapshot_members_read on public.competition_roster_snapshot_members
  for select to authenticated
  using (exists (
    select 1
    from public.competition_roster_snapshot_squads snapshot_squad
    join public.competition_roster_snapshots snapshot on snapshot.id = snapshot_squad.snapshot_id
    join public.tournaments tournament on tournament.id = snapshot.tournament_id
    where snapshot_squad.id = competition_roster_snapshot_members.snapshot_squad_id
      and public.can_access_campus(tournament.campus_id)
  ));
create policy competition_roster_snapshot_members_insert on public.competition_roster_snapshot_members
  for insert to authenticated
  with check (exists (
    select 1
    from public.competition_roster_snapshot_squads snapshot_squad
    join public.competition_roster_snapshots snapshot on snapshot.id = snapshot_squad.snapshot_id
    join public.tournaments tournament on tournament.id = snapshot.tournament_id
    where snapshot_squad.id = competition_roster_snapshot_members.snapshot_squad_id
      and public.can_access_sports_campus(tournament.campus_id)
  ));

create policy competition_roster_events_read on public.competition_roster_events
  for select to authenticated
  using (exists (
    select 1 from public.tournaments tournament
    where tournament.id = competition_roster_events.tournament_id
      and public.can_access_campus(tournament.campus_id)
  ));
create policy competition_roster_events_insert on public.competition_roster_events
  for insert to authenticated
  with check (exists (
    select 1 from public.tournaments tournament
    where tournament.id = competition_roster_events.tournament_id
      and public.can_access_sports_campus(tournament.campus_id)
  ));

revoke all on public.competition_roster_squads from public, anon;
revoke all on public.competition_roster_squad_groups from public, anon;
revoke all on public.competition_roster_squad_members from public, anon;
revoke all on public.competition_roster_exclusions from public, anon;
revoke all on public.competition_roster_snapshots from public, anon;
revoke all on public.competition_roster_snapshot_squads from public, anon;
revoke all on public.competition_roster_snapshot_members from public, anon;
revoke all on public.competition_roster_events from public, anon;

grant select, insert, update, delete on public.competition_roster_squads to authenticated;
grant select, insert, update, delete on public.competition_roster_squad_groups to authenticated;
grant select, insert, update, delete on public.competition_roster_squad_members to authenticated;
grant select, insert, update, delete on public.competition_roster_exclusions to authenticated;
grant select, insert on public.competition_roster_snapshots to authenticated;
grant select, insert on public.competition_roster_snapshot_squads to authenticated;
grant select, insert on public.competition_roster_snapshot_members to authenticated;
grant select, insert on public.competition_roster_events to authenticated;

comment on table public.competition_roster_squads is
  'Tournament-specific Equipo unico, Azul, Blanco, or custom squads independent from legacy teams and training rosters.';
comment on table public.competition_roster_squad_groups is
  'One or more training groups that provide the candidate pool for a tournament squad.';
comment on table public.competition_roster_squad_members is
  'Explicit final squad membership. Paid eligibility remains in tournament_player_entries and is not copied or mutated here.';
comment on table public.competition_roster_exclusions is
  'Rare audited exclusion of a paid tournament registration from the final sporting roster.';
comment on table public.competition_roster_snapshots is
  'Immutable tournament roster checkpoint header.';
comment on table public.competition_roster_snapshot_members is
  'Immutable player and source snapshots used to preserve historical tournament rosters.';
comment on table public.competition_roster_events is
  'Append-only sporting roster audit events. No finance mutations are stored here.';
