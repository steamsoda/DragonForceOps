-- Finalize a tournament without deleting its financial or sporting history.
-- Current operational squads are archived; members, reports, games, entries,
-- payments, and immutable snapshots remain intact.

create or replace function public.finalize_sports_signup_tournament(
  p_actor_user_id uuid,
  p_tournament_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_archived_squad_count integer := 0;
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
    raise exception 'superadmin_required';
  end if;

  select *
  into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'tournament_not_found';
  end if;

  update public.tournaments
  set is_active = false,
      updated_at = now()
  where id = p_tournament_id;

  update public.competition_roster_squads
  set status = 'archived',
      updated_by = p_actor_user_id,
      updated_at = now()
  where tournament_id = p_tournament_id
    and status <> 'archived';

  get diagnostics v_archived_squad_count = row_count;

  insert into public.competition_roster_events (
    tournament_id,
    squad_id,
    event_type,
    details,
    actor_id
  ) values (
    p_tournament_id,
    null,
    'tournament_finalized',
    jsonb_build_object(
      'archived_squad_count', v_archived_squad_count,
      'was_active', v_tournament.is_active
    ),
    p_actor_user_id
  );

  return jsonb_build_object(
    'tournament_id', p_tournament_id,
    'archived_squad_count', v_archived_squad_count,
    'was_active', v_tournament.is_active
  );
end;
$$;

revoke all on function public.finalize_sports_signup_tournament(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finalize_sports_signup_tournament(uuid, uuid) to service_role;

comment on function public.finalize_sports_signup_tournament(uuid, uuid) is
  'Super Admin lifecycle transition: hides a tournament from current operations and archives its squads while preserving registrations, payments, members, reports, games, and snapshots.';

create or replace function public.reject_inactive_coach_schedule_tournament()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.tournaments tournament
    where tournament.id = new.tournament_id
      and tournament.is_active = true
  ) then
    raise exception 'tournament_not_active';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reject_inactive_coach_schedule_tournament
  on public.coach_weekly_schedule_reports;
create trigger trg_reject_inactive_coach_schedule_tournament
before insert or update on public.coach_weekly_schedule_reports
for each row execute function public.reject_inactive_coach_schedule_tournament();

comment on function public.reject_inactive_coach_schedule_tournament() is
  'Prevents new or edited weekly reports from targeting a finalized tournament while leaving historical rows readable.';
