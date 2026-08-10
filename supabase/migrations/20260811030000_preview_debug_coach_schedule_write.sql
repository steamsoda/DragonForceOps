-- Preview debug impersonation remains read-only everywhere except the narrowly
-- scoped coach schedule test action. This service-role-only RPC validates both
-- the real Super Admin actor and the explicitly linked coach account.

create or replace function public.save_debug_coach_weekly_schedule_report(
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
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if not exists (
    select 1
    from public.user_roles ur
    join public.app_roles ar on ar.id = ur.role_id
    where ur.user_id = p_actor_user_id
      and ar.code = 'superadmin'
  ) then
    raise exception 'debug_actor_forbidden';
  end if;
  if not exists (
    select 1
    from public.coaches c
    where c.id = p_coach_id
      and c.user_id = p_effective_user_id
      and c.is_active = true
  ) then
    raise exception 'debug_coach_link_invalid';
  end if;
  if not exists (
    select 1
    from public.training_group_coaches tgc
    join public.training_groups tg on tg.id = tgc.training_group_id
    where tgc.coach_id = p_coach_id
      and tgc.training_group_id = p_training_group_id
      and tg.status = 'active'
  ) then
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

revoke all on function public.save_debug_coach_weekly_schedule_report(uuid, uuid, uuid, date, uuid, uuid, boolean, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_debug_coach_weekly_schedule_report(uuid, uuid, uuid, date, uuid, uuid, boolean, text, jsonb)
  to service_role;

comment on function public.save_debug_coach_weekly_schedule_report(uuid, uuid, uuid, date, uuid, uuid, boolean, text, jsonb) is
  'Service-role-only Preview test helper for Super Admin coach impersonation; application code must also enforce Preview-only use.';
