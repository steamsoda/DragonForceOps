-- Atomic default-squad organizer action.
-- Confirmed tournament entries remain registration truth; this function only
-- synchronizes the ordinary one-training-group / one-competition-team case.

create or replace function public.create_or_sync_default_competition_squad(
  p_tournament_id uuid,
  p_training_group_id uuid,
  p_program text
)
returns table (
  squad_id uuid,
  squad_name text,
  added_count integer,
  removed_count integer,
  member_count integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_tournament_campus_id uuid;
  v_group_campus_id uuid;
  v_group_name text;
  v_group_program text;
  v_group_gender text;
  v_birth_year_min integer;
  v_birth_year_max integer;
  v_squad_id uuid;
  v_squad_name text;
  v_added_count integer := 0;
  v_removed_count integer := 0;
  v_member_count integer := 0;
  v_source_group_count integer := 0;
  v_linked_squad_count integer := 0;
  v_non_single_squad_count integer := 0;
begin
  if v_actor_id is null then
    raise exception 'competition_roster_auth_required';
  end if;

  if p_program not in ('futbol_para_todos', 'selectivo', 'little_dragons') then
    raise exception 'competition_roster_invalid_program';
  end if;

  select tournament.campus_id
    into v_tournament_campus_id
  from public.tournaments tournament
  where tournament.id = p_tournament_id
    and tournament.is_active = true
  for update;

  if v_tournament_campus_id is null then
    raise exception 'competition_roster_tournament_not_found';
  end if;

  if not public.can_access_sports_campus(v_tournament_campus_id) then
    raise exception 'competition_roster_manager_required';
  end if;

  select
    training_group.campus_id,
    training_group.name,
    training_group.program,
    training_group.gender,
    training_group.birth_year_min,
    training_group.birth_year_max
  into
    v_group_campus_id,
    v_group_name,
    v_group_program,
    v_group_gender,
    v_birth_year_min,
    v_birth_year_max
  from public.training_groups training_group
  where training_group.id = p_training_group_id
    and training_group.status = 'active';

  if v_group_campus_id is null then
    raise exception 'competition_roster_group_not_found';
  end if;

  if v_group_campus_id <> v_tournament_campus_id then
    raise exception 'competition_roster_campus_mismatch';
  end if;

  if v_group_program is distinct from p_program then
    raise exception 'competition_roster_program_mismatch';
  end if;

  select
    count(distinct squad.id)::integer,
    count(distinct squad.id) filter (where squad.squad_kind <> 'single')::integer
  into v_linked_squad_count, v_non_single_squad_count
  from public.competition_roster_squads squad
  join public.competition_roster_squad_groups source_group
    on source_group.squad_id = squad.id
  where squad.tournament_id = p_tournament_id
    and source_group.training_group_id = p_training_group_id
    and squad.status <> 'archived';

  if v_linked_squad_count > 1 or v_non_single_squad_count > 0 then
    raise exception 'competition_roster_advanced_squad_requires_editor';
  end if;

  select squad.id, squad.name
    into v_squad_id, v_squad_name
  from public.competition_roster_squads squad
  join public.competition_roster_squad_groups source_group
    on source_group.squad_id = squad.id
  where squad.tournament_id = p_tournament_id
    and source_group.training_group_id = p_training_group_id
    and squad.squad_kind = 'single'
    and squad.status <> 'archived'
  order by squad.created_at
  limit 1;

  if v_squad_id is null then
    v_squad_name := coalesce(nullif(trim(v_group_name), ''), 'Equipo unico');
    if exists (
      select 1
      from public.competition_roster_squads squad
      where squad.tournament_id = p_tournament_id
        and squad.name = v_squad_name
    ) then
      v_squad_name := v_squad_name || ' - Equipo unico ' || left(p_training_group_id::text, 4);
    end if;

    insert into public.competition_roster_squads (
      tournament_id,
      name,
      squad_kind,
      program,
      category_label,
      gender,
      status,
      created_by,
      updated_by
    )
    values (
      p_tournament_id,
      v_squad_name,
      'single',
      p_program,
      case
        when v_birth_year_min is null and v_birth_year_max is null then null
        when v_birth_year_min is distinct from v_birth_year_max then
          concat_ws('/', v_birth_year_min::text, v_birth_year_max::text)
        else coalesce(v_birth_year_min, v_birth_year_max)::text
      end,
      v_group_gender,
      'planning',
      v_actor_id,
      v_actor_id
    )
    returning id into v_squad_id;

    insert into public.competition_roster_squad_groups (
      squad_id,
      training_group_id,
      created_by
    )
    values (v_squad_id, p_training_group_id, v_actor_id);

    insert into public.competition_roster_events (
      tournament_id,
      squad_id,
      event_type,
      details,
      actor_id
    )
    values (
      p_tournament_id,
      v_squad_id,
      'squad.created',
      jsonb_build_object(
        'squad_kind', 'single',
        'training_group_id', p_training_group_id,
        'program', p_program
      ),
      v_actor_id
    );
  else
    select count(*)::integer
      into v_source_group_count
    from public.competition_roster_squad_groups source_group
    where source_group.squad_id = v_squad_id;

    if v_source_group_count <> 1 then
      raise exception 'competition_roster_advanced_squad_requires_editor';
    end if;
  end if;

  with inserted as (
    insert into public.competition_roster_squad_members (
      squad_id,
      enrollment_id,
      source,
      added_by
    )
    select distinct
      v_squad_id,
      entry.enrollment_id,
      'paid',
      v_actor_id
    from public.tournament_player_entries entry
    join public.enrollments enrollment
      on enrollment.id = entry.enrollment_id
     and enrollment.status = 'active'
     and enrollment.campus_id = v_tournament_campus_id
    join public.training_group_assignments assignment
      on assignment.enrollment_id = enrollment.id
     and assignment.training_group_id = p_training_group_id
     and assignment.end_date is null
    where entry.tournament_id = p_tournament_id
      and entry.entry_status = 'confirmed'
      and not exists (
        select 1
        from public.competition_roster_exclusions exclusion
        where exclusion.tournament_id = p_tournament_id
          and exclusion.enrollment_id = entry.enrollment_id
      )
    on conflict (squad_id, enrollment_id) do nothing
    returning 1
  )
  select count(*)::integer into v_added_count from inserted;

  with removed as (
    delete from public.competition_roster_squad_members member
    where member.squad_id = v_squad_id
      and member.source = 'paid'
      and not exists (
        select 1
        from public.tournament_player_entries entry
        join public.enrollments enrollment
          on enrollment.id = entry.enrollment_id
         and enrollment.status = 'active'
         and enrollment.campus_id = v_tournament_campus_id
        join public.training_group_assignments assignment
          on assignment.enrollment_id = enrollment.id
         and assignment.training_group_id = p_training_group_id
         and assignment.end_date is null
        where entry.tournament_id = p_tournament_id
          and entry.enrollment_id = member.enrollment_id
          and entry.entry_status = 'confirmed'
          and not exists (
            select 1
            from public.competition_roster_exclusions exclusion
            where exclusion.tournament_id = p_tournament_id
              and exclusion.enrollment_id = entry.enrollment_id
          )
      )
    returning 1
  )
  select count(*)::integer into v_removed_count from removed;

  update public.competition_roster_squads
  set updated_by = v_actor_id,
      updated_at = now()
  where id = v_squad_id;

  select count(*)::integer
    into v_member_count
  from public.competition_roster_squad_members member
  where member.squad_id = v_squad_id;

  insert into public.competition_roster_events (
    tournament_id,
    squad_id,
    event_type,
    details,
    actor_id
  )
  values (
    p_tournament_id,
    v_squad_id,
    'squad.members_synced',
    jsonb_build_object(
      'training_group_id', p_training_group_id,
      'added_count', v_added_count,
      'removed_count', v_removed_count,
      'member_count', v_member_count
    ),
    v_actor_id
  );

  return query
  select v_squad_id, v_squad_name, v_added_count, v_removed_count, v_member_count;
end;
$$;

revoke all on function public.create_or_sync_default_competition_squad(uuid, uuid, text) from public, anon;
grant execute on function public.create_or_sync_default_competition_squad(uuid, uuid, text) to authenticated;

comment on function public.create_or_sync_default_competition_squad(uuid, uuid, text) is
  'Creates or synchronizes the ordinary single competition squad for one active source training group. Does not mutate registrations, finance, attendance, or training assignments.';
