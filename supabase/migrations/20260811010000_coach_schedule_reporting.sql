-- Explicit coach account links and a schedule-only reporting lane for weekly callups.
-- This does not grant access to registrations, roster composition, attendance, or finance.

alter table public.coaches
  add column if not exists user_id uuid null references auth.users(id) on delete set null;

create unique index if not exists coaches_user_id_key
  on public.coaches(user_id)
  where user_id is not null;

create or replace function public.is_coach()
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
      and ar.code = 'coach'
  );
$$;

revoke all on function public.is_coach() from public, anon;
grant execute on function public.is_coach() to authenticated;

drop policy if exists coach_read_app_roles on public.app_roles;
create policy coach_read_app_roles on public.app_roles
  for select to authenticated
  using (public.is_coach());

drop policy if exists coach_read_own_user_roles on public.user_roles;
create policy coach_read_own_user_roles on public.user_roles
  for select to authenticated
  using (public.is_coach() and user_id = auth.uid());

create table if not exists public.coach_weekly_schedule_reports (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  training_group_id uuid not null references public.training_groups(id) on delete cascade,
  tournament_id uuid null references public.tournaments(id) on delete set null,
  coach_id uuid not null references public.coaches(id) on delete restrict,
  is_rest boolean not null default false,
  notes text null,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_weekly_schedule_reports_week_monday check (extract(isodow from week_start) = 1),
  constraint coach_weekly_schedule_reports_notes_length check (notes is null or char_length(notes) <= 500),
  constraint coach_weekly_schedule_reports_rest_tournament check (not is_rest or tournament_id is not null),
  unique (week_start, training_group_id)
);

create index if not exists coach_weekly_schedule_reports_coach_week_idx
  on public.coach_weekly_schedule_reports(coach_id, week_start desc);

create index if not exists coach_weekly_schedule_reports_group_week_idx
  on public.coach_weekly_schedule_reports(training_group_id, week_start desc);

create table if not exists public.coach_weekly_schedule_games (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.coach_weekly_schedule_reports(id) on delete cascade,
  match_date date not null,
  arrival_time time not null,
  venue text not null,
  opponent text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_weekly_schedule_games_venue_length check (char_length(trim(venue)) between 1 and 160),
  constraint coach_weekly_schedule_games_opponent_length check (char_length(trim(opponent)) between 1 and 160),
  unique (report_id, sort_order)
);

create index if not exists coach_weekly_schedule_games_report_idx
  on public.coach_weekly_schedule_games(report_id, sort_order);

alter table public.coach_weekly_schedule_reports enable row level security;
alter table public.coach_weekly_schedule_games enable row level security;

create or replace function public.current_user_coach_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.coaches c
  where c.user_id = auth.uid()
    and c.is_active = true
  limit 1;
$$;

revoke all on function public.current_user_coach_id() from public, anon;
grant execute on function public.current_user_coach_id() to authenticated;

create or replace function public.can_manage_assigned_coach_schedule(p_training_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coaches c
    join public.training_group_coaches tgc on tgc.coach_id = c.id
    join public.training_groups tg on tg.id = tgc.training_group_id
    where c.user_id = auth.uid()
      and c.is_active = true
      and tg.status = 'active'
      and tgc.training_group_id = p_training_group_id
  );
$$;

revoke all on function public.can_manage_assigned_coach_schedule(uuid) from public, anon;
grant execute on function public.can_manage_assigned_coach_schedule(uuid) to authenticated;

create or replace function public.can_review_coach_schedules()
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
      and ar.code in ('superadmin', 'director_admin', 'director_deportivo', 'front_desk')
  );
$$;

revoke all on function public.can_review_coach_schedules() from public, anon;
grant execute on function public.can_review_coach_schedules() to authenticated;

drop policy if exists coach_schedule_reports_select on public.coach_weekly_schedule_reports;
create policy coach_schedule_reports_select
  on public.coach_weekly_schedule_reports for select
  to authenticated
  using (
    public.can_review_coach_schedules()
    or (
      coach_id = public.current_user_coach_id()
      and public.can_manage_assigned_coach_schedule(training_group_id)
    )
  );

drop policy if exists coach_schedule_reports_insert on public.coach_weekly_schedule_reports;
create policy coach_schedule_reports_insert
  on public.coach_weekly_schedule_reports for insert
  to authenticated
  with check (
    coach_id = public.current_user_coach_id()
    and created_by = auth.uid()
    and updated_by = auth.uid()
    and public.can_manage_assigned_coach_schedule(training_group_id)
  );

drop policy if exists coach_schedule_reports_update on public.coach_weekly_schedule_reports;
create policy coach_schedule_reports_update
  on public.coach_weekly_schedule_reports for update
  to authenticated
  using (
    coach_id = public.current_user_coach_id()
    and public.can_manage_assigned_coach_schedule(training_group_id)
  )
  with check (
    coach_id = public.current_user_coach_id()
    and updated_by = auth.uid()
    and public.can_manage_assigned_coach_schedule(training_group_id)
  );

drop policy if exists coach_schedule_reports_delete on public.coach_weekly_schedule_reports;
create policy coach_schedule_reports_delete
  on public.coach_weekly_schedule_reports for delete
  to authenticated
  using (
    coach_id = public.current_user_coach_id()
    and public.can_manage_assigned_coach_schedule(training_group_id)
  );

drop policy if exists coach_schedule_games_select on public.coach_weekly_schedule_games;
create policy coach_schedule_games_select
  on public.coach_weekly_schedule_games for select
  to authenticated
  using (
    exists (
      select 1
      from public.coach_weekly_schedule_reports r
      where r.id = report_id
    )
  );

drop policy if exists coach_schedule_games_insert on public.coach_weekly_schedule_games;
create policy coach_schedule_games_insert
  on public.coach_weekly_schedule_games for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.coach_weekly_schedule_reports r
      where r.id = report_id
        and r.coach_id = public.current_user_coach_id()
        and public.can_manage_assigned_coach_schedule(r.training_group_id)
    )
  );

drop policy if exists coach_schedule_games_update on public.coach_weekly_schedule_games;
create policy coach_schedule_games_update
  on public.coach_weekly_schedule_games for update
  to authenticated
  using (
    exists (
      select 1
      from public.coach_weekly_schedule_reports r
      where r.id = report_id
        and r.coach_id = public.current_user_coach_id()
        and public.can_manage_assigned_coach_schedule(r.training_group_id)
    )
  );

drop policy if exists coach_schedule_games_delete on public.coach_weekly_schedule_games;
create policy coach_schedule_games_delete
  on public.coach_weekly_schedule_games for delete
  to authenticated
  using (
    exists (
      select 1
      from public.coach_weekly_schedule_reports r
      where r.id = report_id
        and r.coach_id = public.current_user_coach_id()
        and public.can_manage_assigned_coach_schedule(r.training_group_id)
    )
  );

revoke all on table public.coach_weekly_schedule_reports from public, anon;
revoke all on table public.coach_weekly_schedule_games from public, anon;
grant select, insert, update, delete on table public.coach_weekly_schedule_reports to authenticated;
grant select, insert, update, delete on table public.coach_weekly_schedule_games to authenticated;

comment on column public.coaches.user_id is
  'Explicit Supabase auth account link. Never inferred from coach name or email.';
comment on table public.coach_weekly_schedule_reports is
  'Schedule-only coach submissions; roster and paid-registration truth remain in competition/weekly callup tables.';

create or replace function public.save_coach_weekly_schedule_report(
  p_week_start date,
  p_training_group_id uuid,
  p_tournament_id uuid,
  p_is_rest boolean,
  p_notes text,
  p_games jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_coach_id uuid := public.current_user_coach_id();
  v_report_id uuid;
  v_game_count integer;
begin
  if v_coach_id is null or not public.can_manage_assigned_coach_schedule(p_training_group_id) then
    raise exception 'coach_group_forbidden';
  end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'week_must_start_monday';
  end if;
  if p_tournament_id is null or not exists (
    select 1
    from public.tournaments t
    join public.training_groups tg on tg.id = p_training_group_id
    where t.id = p_tournament_id
      and t.is_active = true
      and t.campus_id = tg.campus_id
  ) then
    raise exception 'invalid_tournament';
  end if;
  if p_notes is not null and char_length(p_notes) > 500 then
    raise exception 'notes_too_long';
  end if;
  if jsonb_typeof(coalesce(p_games, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_games';
  end if;
  v_game_count := jsonb_array_length(coalesce(p_games, '[]'::jsonb));
  if v_game_count > 3 or (not p_is_rest and v_game_count < 1) or (p_is_rest and v_game_count <> 0) then
    raise exception 'invalid_game_count';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(coalesce(p_games, '[]'::jsonb))
      as g(match_date date, arrival_time time, venue text, opponent text)
    where g.match_date < p_week_start
       or g.match_date > p_week_start + 6
       or g.arrival_time is null
       or char_length(trim(coalesce(g.venue, ''))) not between 1 and 160
       or char_length(trim(coalesce(g.opponent, ''))) not between 1 and 160
  ) then
    raise exception 'invalid_game';
  end if;

  insert into public.coach_weekly_schedule_reports (
    week_start, training_group_id, tournament_id, coach_id, is_rest, notes, created_by, updated_by
  ) values (
    p_week_start, p_training_group_id, p_tournament_id, v_coach_id, p_is_rest,
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid(), auth.uid()
  )
  on conflict (week_start, training_group_id) do update
    set tournament_id = excluded.tournament_id,
        coach_id = excluded.coach_id,
        is_rest = excluded.is_rest,
        notes = excluded.notes,
        updated_by = auth.uid(),
        updated_at = now()
  returning id into v_report_id;

  delete from public.coach_weekly_schedule_games where report_id = v_report_id;
  if not p_is_rest then
    insert into public.coach_weekly_schedule_games (
      report_id, match_date, arrival_time, venue, opponent, sort_order
    )
    select
      v_report_id,
      (g.value ->> 'match_date')::date,
      (g.value ->> 'arrival_time')::time,
      trim(g.value ->> 'venue'),
      trim(g.value ->> 'opponent'),
      g.ordinality - 1
    from jsonb_array_elements(p_games) with ordinality as g(value, ordinality);
  end if;
  return v_report_id;
end;
$$;

revoke all on function public.save_coach_weekly_schedule_report(date, uuid, uuid, boolean, text, jsonb) from public, anon;
grant execute on function public.save_coach_weekly_schedule_report(date, uuid, uuid, boolean, text, jsonb) to authenticated;
