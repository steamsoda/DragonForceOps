-- Stable coach games and game-specific convocatoria player snapshots.
-- These tables never mutate competition squads, tournament registrations,
-- training groups, attendance, or finance records.

alter table public.coach_weekly_schedule_games
  add column if not exists competition_roster_squad_id uuid null
    references public.competition_roster_squads(id) on delete set null;

create table if not exists public.coach_weekly_schedule_game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.coach_weekly_schedule_games(id) on delete cascade,
  competition_roster_squad_id uuid null references public.competition_roster_squads(id) on delete set null,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  player_name_snapshot text not null,
  roster_status text not null check (roster_status in ('included', 'excluded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, enrollment_id)
);

create index if not exists coach_schedule_game_players_game_idx
  on public.coach_weekly_schedule_game_players(game_id, roster_status, player_name_snapshot);

alter table public.weekly_callup_games
  add column if not exists source_coach_schedule_game_id uuid null
    references public.coach_weekly_schedule_games(id) on delete set null,
  add column if not exists competition_roster_squad_id uuid null
    references public.competition_roster_squads(id) on delete set null;

create table if not exists public.weekly_callup_game_players (
  id uuid primary key default gen_random_uuid(),
  weekly_callup_game_id uuid not null references public.weekly_callup_games(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  player_name_snapshot text not null,
  roster_status text not null check (roster_status in ('included', 'excluded')),
  created_at timestamptz not null default now(),
  unique (weekly_callup_game_id, enrollment_id)
);

create index if not exists weekly_callup_game_players_game_idx
  on public.weekly_callup_game_players(weekly_callup_game_id, roster_status, player_name_snapshot);

alter table public.coach_weekly_schedule_game_players enable row level security;
alter table public.weekly_callup_game_players enable row level security;

drop policy if exists coach_schedule_game_players_select on public.coach_weekly_schedule_game_players;
create policy coach_schedule_game_players_select
  on public.coach_weekly_schedule_game_players for select
  to authenticated
  using (
    exists (
      select 1
      from public.coach_weekly_schedule_games game
      join public.coach_weekly_schedule_reports report on report.id = game.report_id
      where game.id = coach_weekly_schedule_game_players.game_id
        and (
          public.can_review_coach_schedules()
          or (
            report.coach_id = public.current_user_coach_id()
            and public.can_manage_assigned_coach_schedule(report.training_group_id)
          )
        )
    )
  );

drop policy if exists weekly_callup_game_players_manage on public.weekly_callup_game_players;
create policy weekly_callup_game_players_manage
  on public.weekly_callup_game_players for all
  to authenticated
  using (
    exists (
      select 1
      from public.weekly_callup_games game
      join public.weekly_callup_categories category on category.id = game.weekly_callup_category_id
      join public.weekly_callups callup on callup.id = category.weekly_callup_id
      where game.id = weekly_callup_game_players.weekly_callup_game_id
        and public.can_manage_weekly_callup_campus(callup.campus_id)
    )
  )
  with check (
    exists (
      select 1
      from public.weekly_callup_games game
      join public.weekly_callup_categories category on category.id = game.weekly_callup_category_id
      join public.weekly_callups callup on callup.id = category.weekly_callup_id
      where game.id = weekly_callup_game_players.weekly_callup_game_id
        and public.can_manage_weekly_callup_campus(callup.campus_id)
    )
  );

revoke all on public.coach_weekly_schedule_game_players from public, anon, authenticated;
grant select on public.coach_weekly_schedule_game_players to authenticated;
revoke all on public.weekly_callup_game_players from public, anon;
grant select, insert, update, delete on public.weekly_callup_game_players to authenticated;

create or replace function public.save_coach_weekly_schedule_report_v2(
  p_actor_user_id uuid,
  p_effective_user_id uuid,
  p_coach_id uuid,
  p_week_start date,
  p_training_group_id uuid,
  p_tournament_id uuid,
  p_is_rest boolean,
  p_notes text,
  p_games jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_id uuid;
  v_game_count integer;
  v_game jsonb;
  v_game_id uuid;
  v_game_ids uuid[] := '{}'::uuid[];
  v_squad_id uuid;
  v_players jsonb;
  v_player_count integer;
  v_squad_member_count integer;
  v_sort_order integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if p_actor_user_id <> p_effective_user_id and not exists (
    select 1
    from public.user_roles role_link
    join public.app_roles role on role.id = role_link.role_id
    where role_link.user_id = p_actor_user_id and role.code = 'superadmin'
  ) then
    raise exception 'debug_actor_forbidden';
  end if;
  if not exists (
    select 1 from public.coaches coach
    where coach.id = p_coach_id
      and coach.user_id = p_effective_user_id
      and coach.is_active = true
  ) then
    raise exception 'coach_link_invalid';
  end if;
  if not exists (
    select 1
    from public.training_group_coaches coach_group
    join public.training_groups training_group on training_group.id = coach_group.training_group_id
    where coach_group.coach_id = p_coach_id
      and coach_group.training_group_id = p_training_group_id
      and training_group.status = 'active'
  ) then
    raise exception 'coach_group_forbidden';
  end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'week_must_start_monday';
  end if;
  if p_tournament_id is null or not exists (
    select 1
    from public.tournaments tournament
    join public.training_groups training_group on training_group.id = p_training_group_id
    where tournament.id = p_tournament_id
      and tournament.is_active = true
      and tournament.campus_id = training_group.campus_id
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

  insert into public.coach_weekly_schedule_reports (
    week_start, training_group_id, tournament_id, coach_id, is_rest, notes,
    created_by, updated_by
  ) values (
    p_week_start, p_training_group_id, p_tournament_id, p_coach_id, p_is_rest,
    nullif(trim(coalesce(p_notes, '')), ''), p_actor_user_id, p_actor_user_id
  )
  on conflict (week_start, training_group_id) do update
    set tournament_id = excluded.tournament_id,
        coach_id = excluded.coach_id,
        is_rest = excluded.is_rest,
        notes = excluded.notes,
        updated_by = p_actor_user_id,
        updated_at = now()
  returning id into v_report_id;

  if p_is_rest then
    delete from public.coach_weekly_schedule_games where report_id = v_report_id;
    return v_report_id;
  end if;

  for v_game in select value from jsonb_array_elements(p_games)
  loop
    if nullif(v_game ->> 'id', '') is not null then
      begin
        v_game_id := (v_game ->> 'id')::uuid;
      exception when invalid_text_representation then
        raise exception 'invalid_game_id';
      end;
    else
      v_game_id := null;
    end if;
    begin
      v_squad_id := (v_game ->> 'squad_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid_squad_id';
    end;
    if (v_game ->> 'match_date')::date < p_week_start
      or (v_game ->> 'match_date')::date > p_week_start + 6
      or nullif(v_game ->> 'arrival_time', '') is null
      or char_length(trim(coalesce(v_game ->> 'venue', ''))) not between 1 and 160
      or char_length(trim(coalesce(v_game ->> 'opponent', ''))) not between 1 and 160 then
      raise exception 'invalid_game';
    end if;
    if not exists (
      select 1
      from public.competition_roster_squads squad
      join public.competition_roster_squad_groups source_group on source_group.squad_id = squad.id
      where squad.id = v_squad_id
        and squad.tournament_id = p_tournament_id
        and squad.status <> 'archived'
        and source_group.training_group_id = p_training_group_id
    ) then
      raise exception 'invalid_game_squad';
    end if;

    v_players := coalesce(v_game -> 'players', '[]'::jsonb);
    if jsonb_typeof(v_players) <> 'array' then
      raise exception 'invalid_game_players';
    end if;
    v_player_count := jsonb_array_length(v_players);
    select count(*) into v_squad_member_count
    from public.competition_roster_squad_members member
    where member.squad_id = v_squad_id;
    if v_player_count <> v_squad_member_count or v_player_count = 0 then
      raise exception 'game_roster_changed';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(v_players) player
      where coalesce(player ->> 'roster_status', '') not in ('included', 'excluded')
         or nullif(player ->> 'enrollment_id', '') is null
    ) or exists (
      select 1
      from jsonb_array_elements(v_players) player
      left join public.competition_roster_squad_members member
        on member.squad_id = v_squad_id
       and member.enrollment_id = (player ->> 'enrollment_id')::uuid
      where member.id is null
    ) or exists (
      select player ->> 'enrollment_id'
      from jsonb_array_elements(v_players) player
      group by player ->> 'enrollment_id'
      having count(*) > 1
    ) or not exists (
      select 1 from jsonb_array_elements(v_players) player
      where player ->> 'roster_status' = 'included'
    ) then
      raise exception 'invalid_game_players';
    end if;

    if v_game_id is null then
      insert into public.coach_weekly_schedule_games (
        report_id, competition_roster_squad_id, match_date, arrival_time,
        venue, opponent, sort_order
      ) values (
        v_report_id, v_squad_id, (v_game ->> 'match_date')::date,
        (v_game ->> 'arrival_time')::time, trim(v_game ->> 'venue'),
        trim(v_game ->> 'opponent'), v_sort_order
      ) returning id into v_game_id;
    else
      update public.coach_weekly_schedule_games
      set competition_roster_squad_id = v_squad_id,
          match_date = (v_game ->> 'match_date')::date,
          arrival_time = (v_game ->> 'arrival_time')::time,
          venue = trim(v_game ->> 'venue'),
          opponent = trim(v_game ->> 'opponent'),
          sort_order = v_sort_order,
          updated_at = now()
      where id = v_game_id and report_id = v_report_id;
      if not found then raise exception 'invalid_game_id'; end if;
    end if;

    delete from public.coach_weekly_schedule_game_players where game_id = v_game_id;
    insert into public.coach_weekly_schedule_game_players (
      game_id, competition_roster_squad_id, enrollment_id, player_id,
      player_name_snapshot, roster_status
    )
    select
      v_game_id,
      v_squad_id,
      enrollment.id,
      enrollment.player_id,
      btrim(concat_ws(' ', player.first_name, player.last_name)),
      roster.roster_status
    from jsonb_to_recordset(v_players) as roster(enrollment_id uuid, roster_status text)
    join public.enrollments enrollment on enrollment.id = roster.enrollment_id
    join public.players player on player.id = enrollment.player_id;

    v_game_ids := array_append(v_game_ids, v_game_id);
    v_sort_order := v_sort_order + 1;
  end loop;

  delete from public.coach_weekly_schedule_games
  where report_id = v_report_id and not (id = any(v_game_ids));
  return v_report_id;
end;
$$;

revoke all on function public.save_coach_weekly_schedule_report_v2(
  uuid, uuid, uuid, date, uuid, uuid, boolean, text, jsonb
) from public, anon, authenticated;
grant execute on function public.save_coach_weekly_schedule_report_v2(
  uuid, uuid, uuid, date, uuid, uuid, boolean, text, jsonb
) to service_role;

comment on table public.coach_weekly_schedule_game_players is
  'Latest coach-submitted included/excluded player snapshot for one game; permanent squad membership is unchanged.';
comment on table public.weekly_callup_game_players is
  'Game-specific player snapshot copied into a generated weekly convocatoria for historical PNG output.';
