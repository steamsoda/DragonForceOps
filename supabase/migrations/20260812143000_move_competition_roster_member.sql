-- Move one existing competition-roster membership without changing the
-- player's tournament registration, training group, finance, or snapshots.

create or replace function public.move_competition_roster_member(
  p_tournament_id uuid,
  p_program text,
  p_source_squad_id uuid,
  p_destination_squad_id uuid,
  p_enrollment_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_source_squad public.competition_roster_squads%rowtype;
  v_destination_squad public.competition_roster_squads%rowtype;
  v_member public.competition_roster_squad_members%rowtype;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'competition_roster_move_auth_required';
  end if;

  if p_source_squad_id = p_destination_squad_id then
    raise exception 'competition_roster_move_same_squad';
  end if;

  if p_program not in ('futbol_para_todos', 'selectivo', 'little_dragons') then
    raise exception 'competition_roster_move_invalid_program';
  end if;

  select *
  into v_tournament
  from public.tournaments
  where id = p_tournament_id
  for update;

  if not found or not v_tournament.is_active then
    raise exception 'competition_roster_move_tournament_inactive';
  end if;

  if not public.can_access_sports_campus(v_tournament.campus_id) then
    raise exception 'competition_roster_move_manager_required';
  end if;

  -- Always acquire both squad locks in UUID order so simultaneous opposite
  -- moves cannot deadlock by locking source/destination in reverse order.
  perform 1
  from public.competition_roster_squads
  where id in (p_source_squad_id, p_destination_squad_id)
  order by id
  for update;

  select *
  into v_source_squad
  from public.competition_roster_squads
  where id = p_source_squad_id;

  select *
  into v_destination_squad
  from public.competition_roster_squads
  where id = p_destination_squad_id;

  if v_source_squad.id is null or v_destination_squad.id is null then
    raise exception 'competition_roster_move_squad_not_found';
  end if;

  if v_source_squad.tournament_id <> p_tournament_id
     or v_destination_squad.tournament_id <> p_tournament_id
     or v_source_squad.program is distinct from p_program
     or v_destination_squad.program is distinct from p_program
     or v_source_squad.status = 'archived'
     or v_destination_squad.status = 'archived' then
    raise exception 'competition_roster_move_scope_mismatch';
  end if;

  select *
  into v_member
  from public.competition_roster_squad_members
  where squad_id = p_source_squad_id
    and enrollment_id = p_enrollment_id
  for update;

  if v_member.id is null then
    raise exception 'competition_roster_move_source_not_found';
  end if;

  if exists (
    select 1
    from public.competition_roster_squad_members
    where squad_id = p_destination_squad_id
      and enrollment_id = p_enrollment_id
  ) then
    raise exception 'competition_roster_move_destination_duplicate';
  end if;

  delete from public.competition_roster_squad_members
  where id = v_member.id;

  insert into public.competition_roster_squad_members (
    squad_id,
    enrollment_id,
    source,
    reason,
    added_by,
    created_at,
    updated_at
  ) values (
    p_destination_squad_id,
    p_enrollment_id,
    v_member.source,
    v_member.reason,
    v_member.added_by,
    v_member.created_at,
    now()
  );

  update public.competition_roster_squads
  set updated_by = v_actor_id,
      updated_at = now()
  where id in (p_source_squad_id, p_destination_squad_id);

  insert into public.competition_roster_events (
    tournament_id,
    squad_id,
    enrollment_id,
    event_type,
    details,
    actor_id
  ) values (
    p_tournament_id,
    p_destination_squad_id,
    p_enrollment_id,
    'squad.member_moved',
    jsonb_build_object(
      'source_squad_id', p_source_squad_id,
      'destination_squad_id', p_destination_squad_id,
      'membership_source', v_member.source,
      'membership_reason', v_member.reason
    ),
    v_actor_id
  );

  return jsonb_build_object(
    'tournament_id', p_tournament_id,
    'enrollment_id', p_enrollment_id,
    'source_squad_id', p_source_squad_id,
    'destination_squad_id', p_destination_squad_id,
    'membership_source', v_member.source
  );
end;
$$;

revoke all on function public.move_competition_roster_member(uuid, text, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.move_competition_roster_member(uuid, text, uuid, uuid, uuid)
  to authenticated;

comment on function public.move_competition_roster_member(uuid, text, uuid, uuid, uuid) is
  'Moves one existing live squad membership inside the same active tournament/campus/program, preserving membership provenance and writing an audit event without changing registrations, finance, training groups, or snapshots.';
