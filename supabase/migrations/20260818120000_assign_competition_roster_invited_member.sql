-- Convert an exceptional paid tournament registration into one reviewed,
-- durable invited squad placement without changing finance, enrollment,
-- attendance, or the player's training-group assignment.

create or replace function public.assign_competition_roster_invited_member(
  p_tournament_id uuid,
  p_squad_id uuid,
  p_enrollment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_campus_id uuid;
  v_program text;
  v_reason text := trim(coalesce(p_reason, ''));
  v_previous_memberships jsonb := '[]'::jsonb;
begin
  if v_actor_id is null then
    raise exception 'competition_roster_auth_required';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 240 then
    raise exception 'competition_roster_exception_invalid_reason';
  end if;

  select tournament.campus_id, squad.program
    into v_campus_id, v_program
  from public.competition_roster_squads squad
  join public.tournaments tournament
    on tournament.id = squad.tournament_id
   and tournament.is_active = true
  join public.enrollments enrollment
    on enrollment.id = p_enrollment_id
   and enrollment.campus_id = tournament.campus_id
   and enrollment.status = 'active'
  where squad.id = p_squad_id
    and squad.tournament_id = p_tournament_id
    and squad.status <> 'archived'
  for update of squad, tournament, enrollment;

  if v_campus_id is null or v_program is null then
    raise exception 'competition_roster_invited_scope_not_found';
  end if;
  if not public.can_access_sports_campus(v_campus_id) then
    raise exception 'competition_roster_manager_required';
  end if;
  if exists (
    select 1
    from public.competition_roster_exclusions exclusion
    where exclusion.tournament_id = p_tournament_id
      and exclusion.enrollment_id = p_enrollment_id
  ) then
    raise exception 'competition_roster_member_is_excluded';
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'squad_id', member.squad_id,
      'source', member.source,
      'reason', member.reason
    ) order by member.created_at),
    '[]'::jsonb
  )
    into v_previous_memberships
  from public.competition_roster_squad_members member
  join public.competition_roster_squads squad on squad.id = member.squad_id
  where squad.tournament_id = p_tournament_id
    and squad.status <> 'archived'
    and member.enrollment_id = p_enrollment_id;

  delete from public.competition_roster_squad_members member
  using public.competition_roster_squads squad
  where squad.id = member.squad_id
    and squad.tournament_id = p_tournament_id
    and squad.status <> 'archived'
    and member.enrollment_id = p_enrollment_id;

  insert into public.competition_roster_squad_members (
    squad_id,
    enrollment_id,
    source,
    reason,
    added_by
  ) values (
    p_squad_id,
    p_enrollment_id,
    'manual',
    v_reason,
    v_actor_id
  );

  update public.competition_roster_squads
  set updated_by = v_actor_id,
      updated_at = now()
  where id = p_squad_id;

  insert into public.competition_roster_events (
    tournament_id,
    squad_id,
    enrollment_id,
    event_type,
    details,
    actor_id
  ) values (
    p_tournament_id,
    p_squad_id,
    p_enrollment_id,
    'member.invited_assigned',
    jsonb_build_object(
      'reason', v_reason,
      'program', v_program,
      'previous_memberships', v_previous_memberships
    ),
    v_actor_id
  );

  return jsonb_build_object(
    'tournament_id', p_tournament_id,
    'squad_id', p_squad_id,
    'enrollment_id', p_enrollment_id,
    'membership_source', 'manual',
    'previous_memberships', v_previous_memberships
  );
end;
$$;

revoke all on function public.assign_competition_roster_invited_member(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.assign_competition_roster_invited_member(uuid, uuid, uuid, text)
  to authenticated;

comment on function public.assign_competition_roster_invited_member(uuid, uuid, uuid, text) is
  'Atomically replaces provisional tournament memberships with one audited manual invited placement, preserving finance, enrollment, attendance, and training-group truth.';
