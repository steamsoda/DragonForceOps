begin;

alter table public.coach_weekly_schedule_reports
  add column if not exists competition_roster_squad_id uuid null
    references public.competition_roster_squads(id) on delete set null;

alter table public.weekly_callup_categories
  add column if not exists competition_roster_squad_id uuid null
    references public.competition_roster_squads(id) on delete set null;

alter table public.coach_weekly_schedule_reports
  drop constraint if exists coach_weekly_schedule_reports_week_start_training_group_id_key;

create unique index if not exists uq_coach_schedule_group_week_legacy
  on public.coach_weekly_schedule_reports(week_start, training_group_id)
  where competition_roster_squad_id is null;

create unique index if not exists uq_coach_schedule_squad_week
  on public.coach_weekly_schedule_reports(week_start, competition_roster_squad_id)
  where competition_roster_squad_id is not null;

create index if not exists idx_coach_schedule_reports_squad_week
  on public.coach_weekly_schedule_reports(competition_roster_squad_id, week_start desc)
  where competition_roster_squad_id is not null;

create index if not exists idx_weekly_callup_categories_live_squad
  on public.weekly_callup_categories(competition_roster_squad_id)
  where competition_roster_squad_id is not null;

-- Preserve an in-progress weekly report when all of its saved games already
-- identify the same valid squad. Ambiguous historical group reports stay legacy.
with unambiguous_report_squads as (
  select report.id as report_id, min(game.competition_roster_squad_id::text)::uuid as squad_id
  from public.coach_weekly_schedule_reports report
  join public.coach_weekly_schedule_games game on game.report_id = report.id
  where report.competition_roster_squad_id is null
    and game.competition_roster_squad_id is not null
  group by report.id
  having count(distinct game.competition_roster_squad_id) = 1
)
update public.coach_weekly_schedule_reports report
set competition_roster_squad_id = candidate.squad_id
from unambiguous_report_squads candidate
where report.id = candidate.report_id
  and exists (
    select 1 from public.competition_roster_squad_groups source_group
    where source_group.squad_id = candidate.squad_id
      and source_group.training_group_id = report.training_group_id
  )
  and not exists (
    select 1 from public.coach_weekly_schedule_reports existing
    where existing.week_start = report.week_start
      and existing.competition_roster_squad_id = candidate.squad_id
      and existing.id <> report.id
  );

create or replace function public.can_manage_competition_squad_schedule(
  p_coach_id uuid,
  p_squad_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.competition_roster_squads squad
    where squad.id = p_squad_id
      and squad.status <> 'archived'
      and (
        (
          squad.coach_assignment_mode = 'manual'
          and exists (
            select 1
            from public.competition_roster_squad_coaches link
            join public.coaches coach on coach.id = link.coach_id
            where link.squad_id = squad.id
              and link.coach_id = p_coach_id
              and coach.is_active = true
          )
        )
        or (
          squad.coach_assignment_mode = 'inherited'
          and exists (
            select 1
            from public.competition_roster_squad_groups source_group
            join public.training_group_coaches group_coach
              on group_coach.training_group_id = source_group.training_group_id
            join public.coaches coach on coach.id = group_coach.coach_id
            where source_group.squad_id = squad.id
              and group_coach.coach_id = p_coach_id
              and coach.is_active = true
          )
        )
      )
  );
$$;

revoke all on function public.can_manage_competition_squad_schedule(uuid, uuid) from public, anon;
grant execute on function public.can_manage_competition_squad_schedule(uuid, uuid) to authenticated;

drop policy if exists coach_schedule_reports_select on public.coach_weekly_schedule_reports;
create policy coach_schedule_reports_select
  on public.coach_weekly_schedule_reports for select to authenticated
  using (
    public.can_review_coach_schedules()
    or (
      coach_id = public.current_user_coach_id()
      and case
        when competition_roster_squad_id is not null
          then public.can_manage_competition_squad_schedule(coach_id, competition_roster_squad_id)
        else public.can_manage_assigned_coach_schedule(training_group_id)
      end
    )
  );

create or replace function public.save_coach_weekly_schedule_report_v3(
  p_actor_user_id uuid,
  p_effective_user_id uuid,
  p_coach_id uuid,
  p_week_start date,
  p_training_group_id uuid,
  p_competition_roster_squad_id uuid,
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
  v_players jsonb;
  v_player_count integer;
  v_squad_member_count integer;
  v_sort_order integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_actor_user_id <> p_effective_user_id and not exists (
    select 1 from public.user_roles ur join public.app_roles ar on ar.id = ur.role_id
    where ur.user_id = p_actor_user_id and ar.code = 'superadmin'
  ) then raise exception 'debug_actor_forbidden'; end if;
  if not exists (
    select 1 from public.coaches coach
    where coach.id = p_coach_id and coach.user_id = p_effective_user_id and coach.is_active = true
  ) then raise exception 'coach_link_invalid'; end if;
  if not public.can_manage_competition_squad_schedule(p_coach_id, p_competition_roster_squad_id) then
    raise exception 'coach_squad_forbidden';
  end if;
  if not exists (
    select 1 from public.competition_roster_squads squad
    join public.competition_roster_squad_groups source_group on source_group.squad_id = squad.id
    join public.training_groups training_group on training_group.id = source_group.training_group_id
    where squad.id = p_competition_roster_squad_id
      and squad.tournament_id = p_tournament_id
      and squad.status <> 'archived'
      and source_group.training_group_id = p_training_group_id
      and training_group.status = 'active'
  ) then raise exception 'invalid_schedule_squad'; end if;
  if extract(isodow from p_week_start) <> 1 then raise exception 'week_must_start_monday'; end if;
  if p_notes is not null and char_length(p_notes) > 500 then raise exception 'notes_too_long'; end if;
  if jsonb_typeof(coalesce(p_games, '[]'::jsonb)) <> 'array' then raise exception 'invalid_games'; end if;
  v_game_count := jsonb_array_length(coalesce(p_games, '[]'::jsonb));
  if v_game_count > 3 or (not p_is_rest and v_game_count < 1) or (p_is_rest and v_game_count <> 0) then
    raise exception 'invalid_game_count';
  end if;

  insert into public.coach_weekly_schedule_reports (
    week_start, training_group_id, competition_roster_squad_id, tournament_id,
    coach_id, is_rest, notes, created_by, updated_by
  ) values (
    p_week_start, p_training_group_id, p_competition_roster_squad_id, p_tournament_id,
    p_coach_id, p_is_rest, nullif(trim(coalesce(p_notes, '')), ''), p_actor_user_id, p_actor_user_id
  )
  on conflict (week_start, competition_roster_squad_id) where competition_roster_squad_id is not null
  do update set
    training_group_id = excluded.training_group_id,
    tournament_id = excluded.tournament_id,
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
      begin v_game_id := (v_game ->> 'id')::uuid;
      exception when invalid_text_representation then raise exception 'invalid_game_id'; end;
    else v_game_id := null; end if;
    if (v_game ->> 'squad_id')::uuid <> p_competition_roster_squad_id then
      raise exception 'invalid_game_squad';
    end if;
    if (v_game ->> 'match_date')::date < p_week_start
      or (v_game ->> 'match_date')::date > p_week_start + 6
      or nullif(v_game ->> 'arrival_time', '') is null
      or char_length(trim(coalesce(v_game ->> 'venue', ''))) not between 1 and 160
      or char_length(trim(coalesce(v_game ->> 'opponent', ''))) not between 1 and 160
    then raise exception 'invalid_game'; end if;

    v_players := coalesce(v_game -> 'players', '[]'::jsonb);
    if jsonb_typeof(v_players) <> 'array' then raise exception 'invalid_game_players'; end if;
    v_player_count := jsonb_array_length(v_players);
    select count(*) into v_squad_member_count
    from public.competition_roster_squad_members member
    where member.squad_id = p_competition_roster_squad_id;
    if v_player_count <> v_squad_member_count or v_player_count = 0 then raise exception 'game_roster_changed'; end if;
    if exists (
      select 1 from jsonb_array_elements(v_players) player
      where coalesce(player ->> 'roster_status', '') not in ('included', 'excluded')
         or nullif(player ->> 'enrollment_id', '') is null
    ) or exists (
      select 1 from jsonb_array_elements(v_players) player
      left join public.competition_roster_squad_members member
        on member.squad_id = p_competition_roster_squad_id
       and member.enrollment_id = (player ->> 'enrollment_id')::uuid
      where member.id is null
    ) or exists (
      select player ->> 'enrollment_id' from jsonb_array_elements(v_players) player
      group by player ->> 'enrollment_id' having count(*) > 1
    ) or not exists (
      select 1 from jsonb_array_elements(v_players) player where player ->> 'roster_status' = 'included'
    ) then raise exception 'invalid_game_players'; end if;

    if v_game_id is null then
      insert into public.coach_weekly_schedule_games (
        report_id, competition_roster_squad_id, match_date, arrival_time, venue, opponent, sort_order
      ) values (
        v_report_id, p_competition_roster_squad_id, (v_game ->> 'match_date')::date,
        (v_game ->> 'arrival_time')::time, trim(v_game ->> 'venue'),
        trim(v_game ->> 'opponent'), v_sort_order
      ) returning id into v_game_id;
    else
      update public.coach_weekly_schedule_games set
        competition_roster_squad_id = p_competition_roster_squad_id,
        match_date = (v_game ->> 'match_date')::date,
        arrival_time = (v_game ->> 'arrival_time')::time,
        venue = trim(v_game ->> 'venue'), opponent = trim(v_game ->> 'opponent'),
        sort_order = v_sort_order, updated_at = now()
      where id = v_game_id and report_id = v_report_id;
      if not found then raise exception 'invalid_game_id'; end if;
    end if;

    delete from public.coach_weekly_schedule_game_players where game_id = v_game_id;
    insert into public.coach_weekly_schedule_game_players (
      game_id, competition_roster_squad_id, enrollment_id, player_id,
      player_name_snapshot, roster_status
    )
    select v_game_id, p_competition_roster_squad_id, enrollment.id, enrollment.player_id,
      btrim(concat_ws(' ', player.first_name, player.last_name)), roster.roster_status
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

revoke all on function public.save_coach_weekly_schedule_report_v3(
  uuid, uuid, uuid, date, uuid, uuid, uuid, boolean, text, jsonb
) from public, anon, authenticated;
grant execute on function public.save_coach_weekly_schedule_report_v3(
  uuid, uuid, uuid, date, uuid, uuid, uuid, boolean, text, jsonb
) to service_role;

comment on column public.coach_weekly_schedule_reports.competition_roster_squad_id is
  'Specific Azul, Blanco, combined, or ordinary competition squad whose weekly games are reported.';
comment on column public.weekly_callup_categories.competition_roster_squad_id is
  'Live competition squad represented by this weekly category; roster snapshots remain immutable.';

commit;
