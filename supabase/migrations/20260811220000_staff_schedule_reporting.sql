begin;

create or replace function public.save_staff_weekly_schedule_report_v1(
  p_actor_user_id uuid,
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
  v_campus_id uuid;
  v_coach_user_id uuid;
  v_existing_report_id uuid;
  v_report_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select tournament.campus_id
  into v_campus_id
  from public.competition_roster_squads squad
  join public.tournaments tournament on tournament.id = squad.tournament_id
  join public.competition_roster_squad_groups source_group on source_group.squad_id = squad.id
  where squad.id = p_competition_roster_squad_id
    and squad.tournament_id = p_tournament_id
    and squad.status <> 'archived'
    and source_group.training_group_id = p_training_group_id
  limit 1;

  if v_campus_id is null then
    raise exception 'invalid_schedule_squad';
  end if;

  if not exists (
    select 1
    from public.user_roles user_role
    join public.app_roles app_role on app_role.id = user_role.role_id
    where user_role.user_id = p_actor_user_id
      and (
        app_role.code in ('superadmin', 'director_admin')
        or (
          app_role.code = 'director_deportivo'
          and (user_role.campus_id = v_campus_id or user_role.campus_id is null)
        )
      )
  ) then
    raise exception 'staff_schedule_forbidden';
  end if;

  select coach.user_id
  into v_coach_user_id
  from public.coaches coach
  where coach.id = p_coach_id
    and coach.is_active = true;

  if v_coach_user_id is null
    or not public.can_manage_competition_squad_schedule(p_coach_id, p_competition_roster_squad_id)
  then
    raise exception 'coach_squad_forbidden';
  end if;

  select report.id
  into v_existing_report_id
  from public.coach_weekly_schedule_reports report
  where report.week_start = p_week_start
    and report.competition_roster_squad_id = p_competition_roster_squad_id;

  v_report_id := public.save_coach_weekly_schedule_report_v3(
    v_coach_user_id,
    v_coach_user_id,
    p_coach_id,
    p_week_start,
    p_training_group_id,
    p_competition_roster_squad_id,
    p_tournament_id,
    p_is_rest,
    p_notes,
    p_games
  );

  update public.coach_weekly_schedule_reports
  set updated_by = p_actor_user_id,
      created_by = case when v_existing_report_id is null then p_actor_user_id else created_by end
  where id = v_report_id;

  return v_report_id;
end;
$$;

revoke all on function public.save_staff_weekly_schedule_report_v1(
  uuid, uuid, date, uuid, uuid, uuid, boolean, text, jsonb
) from public, anon, authenticated;
grant execute on function public.save_staff_weekly_schedule_report_v1(
  uuid, uuid, date, uuid, uuid, uuid, boolean, text, jsonb
) to service_role;

comment on function public.save_staff_weekly_schedule_report_v1(
  uuid, uuid, date, uuid, uuid, uuid, boolean, text, jsonb
) is 'Allows campus-scoped directors to complete or correct a squad weekly schedule through the same validations used by its assigned professor.';

commit;
