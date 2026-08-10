-- Assign one later confirmed registration into an existing Azul/Blanco split.
-- This changes only the competition-roster layer and records an audit event.

create or replace function public.assign_pending_competition_roster_split_member(
  p_tournament_id uuid,
  p_enrollment_id uuid,
  p_squad_id uuid
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
  v_squad_kind text;
  v_training_group_id uuid;
  v_source_count integer;
  v_split_count integer;
  v_split_kind_count integer;
begin
  if v_actor_id is null then
    raise exception 'competition_roster_auth_required';
  end if;

  select
    tournament.campus_id,
    squad.program,
    squad.squad_kind,
    source_group.training_group_id,
    source_counts.source_count
  into
    v_campus_id,
    v_program,
    v_squad_kind,
    v_training_group_id,
    v_source_count
  from public.competition_roster_squads squad
  join public.tournaments tournament
    on tournament.id = squad.tournament_id
   and tournament.is_active = true
  join public.competition_roster_squad_groups source_group
    on source_group.squad_id = squad.id
  join lateral (
    select count(*)::integer as source_count
    from public.competition_roster_squad_groups all_sources
    where all_sources.squad_id = squad.id
  ) source_counts on true
  where squad.id = p_squad_id
    and squad.tournament_id = p_tournament_id
    and squad.status <> 'archived'
  for update of squad, tournament;

  if v_campus_id is null or v_training_group_id is null then
    raise exception 'competition_roster_split_destination_not_found';
  end if;
  if v_squad_kind not in ('azul', 'blanco') or v_source_count <> 1 then
    raise exception 'competition_roster_split_destination_invalid';
  end if;
  if not public.can_access_sports_campus(v_campus_id) then
    raise exception 'competition_roster_manager_required';
  end if;

  select
    count(*)::integer,
    count(distinct sibling.squad_kind)::integer
    into v_split_count, v_split_kind_count
  from public.competition_roster_squads sibling
  join public.competition_roster_squad_groups sibling_source
    on sibling_source.squad_id = sibling.id
   and sibling_source.training_group_id = v_training_group_id
  where sibling.tournament_id = p_tournament_id
    and sibling.program = v_program
    and sibling.status <> 'archived'
    and sibling.squad_kind in ('azul', 'blanco')
    and (
      select count(*)
      from public.competition_roster_squad_groups all_sources
      where all_sources.squad_id = sibling.id
    ) = 1;

  if v_split_count <> 2 or v_split_kind_count <> 2 then
    raise exception 'competition_roster_split_structure_invalid';
  end if;

  perform 1
  from public.tournament_player_entries entry
  join public.enrollments enrollment
    on enrollment.id = entry.enrollment_id
   and enrollment.status = 'active'
   and enrollment.campus_id = v_campus_id
  join public.training_group_assignments assignment
    on assignment.enrollment_id = enrollment.id
   and assignment.training_group_id = v_training_group_id
   and assignment.end_date is null
  where entry.tournament_id = p_tournament_id
    and entry.enrollment_id = p_enrollment_id
    and entry.entry_status = 'confirmed'
    and not exists (
      select 1
      from public.competition_roster_exclusions exclusion
      where exclusion.tournament_id = p_tournament_id
        and exclusion.enrollment_id = p_enrollment_id
    )
  for update of entry, enrollment, assignment;

  if not found then
    raise exception 'competition_roster_pending_player_not_found';
  end if;

  if exists (
    select 1
    from public.competition_roster_squad_members member
    join public.competition_roster_squads squad on squad.id = member.squad_id
    where squad.tournament_id = p_tournament_id
      and squad.status <> 'archived'
      and member.enrollment_id = p_enrollment_id
  ) then
    raise exception 'competition_roster_player_already_assigned';
  end if;

  insert into public.competition_roster_squad_members (
    squad_id,
    enrollment_id,
    source,
    reason,
    added_by
  ) values (
    p_squad_id,
    p_enrollment_id,
    'paid',
    'Asignacion manual pendiente Azul/Blanco',
    v_actor_id
  );

  update public.competition_roster_squads
  set status = 'ready',
      updated_by = v_actor_id,
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
    'member.split_assigned',
    jsonb_build_object(
      'training_group_id', v_training_group_id,
      'squad_kind', v_squad_kind
    ),
    v_actor_id
  );

  return jsonb_build_object(
    'tournament_id', p_tournament_id,
    'squad_id', p_squad_id,
    'enrollment_id', p_enrollment_id,
    'squad_kind', v_squad_kind
  );
end;
$$;

revoke all on function public.assign_pending_competition_roster_split_member(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.assign_pending_competition_roster_split_member(uuid, uuid, uuid)
  to authenticated;

comment on function public.assign_pending_competition_roster_split_member(uuid, uuid, uuid) is
  'Assigns one confirmed, active, currently unassigned registration to an existing one-group Azul/Blanco squad without changing finance, registration, enrollment, training-group, or attendance data.';
