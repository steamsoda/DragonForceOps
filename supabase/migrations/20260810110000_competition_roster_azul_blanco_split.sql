-- Transactional Azul/Blanco editor for the ordinary one-source-group case.
-- Paid tournament entries remain eligibility truth. This function only
-- reorganizes competition-roster references and audit events.

create or replace function public.create_or_sync_split_competition_squads(
  p_tournament_id uuid,
  p_training_group_id uuid,
  p_program text,
  p_blanco_enrollment_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_tournament_campus_id uuid;
  v_group_campus_id uuid;
  v_group_name text;
  v_group_gender text;
  v_group_program text;
  v_birth_year_min integer;
  v_birth_year_max integer;
  v_category_label text;
  v_eligible_ids uuid[] := '{}'::uuid[];
  v_blanco_ids uuid[] := '{}'::uuid[];
  v_azul_ids uuid[] := '{}'::uuid[];
  v_linked_count integer := 0;
  v_single_id uuid;
  v_azul_id uuid;
  v_blanco_id uuid;
  v_azul_name text;
  v_blanco_name text;
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
    training_group.gender,
    training_group.program,
    training_group.birth_year_min,
    training_group.birth_year_max
  into
    v_group_campus_id,
    v_group_name,
    v_group_gender,
    v_group_program,
    v_birth_year_min,
    v_birth_year_max
  from public.training_groups training_group
  where training_group.id = p_training_group_id
    and training_group.status = 'active'
  for update;

  if v_group_campus_id is null then
    raise exception 'competition_roster_group_not_found';
  end if;
  if v_group_campus_id <> v_tournament_campus_id then
    raise exception 'competition_roster_campus_mismatch';
  end if;
  if v_group_program is distinct from p_program then
    raise exception 'competition_roster_program_mismatch';
  end if;

  v_category_label := case
    when v_birth_year_min is null and v_birth_year_max is null then null
    when v_birth_year_min is distinct from v_birth_year_max then
      concat_ws('/', v_birth_year_min::text, v_birth_year_max::text)
    else coalesce(v_birth_year_min, v_birth_year_max)::text
  end;

  select coalesce(array_agg(distinct entry.enrollment_id), '{}'::uuid[])
    into v_eligible_ids
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
    );

  if cardinality(v_eligible_ids) < 2 then
    raise exception 'competition_roster_split_needs_two_players';
  end if;

  select coalesce(array_agg(distinct selected.enrollment_id), '{}'::uuid[])
    into v_blanco_ids
  from unnest(coalesce(p_blanco_enrollment_ids, '{}'::uuid[])) selected(enrollment_id);

  if exists (
    select 1
    from unnest(v_blanco_ids) selected(enrollment_id)
    where not (selected.enrollment_id = any(v_eligible_ids))
  ) then
    raise exception 'competition_roster_split_invalid_player';
  end if;

  select coalesce(array_agg(eligible.enrollment_id), '{}'::uuid[])
    into v_azul_ids
  from unnest(v_eligible_ids) eligible(enrollment_id)
  where not (eligible.enrollment_id = any(v_blanco_ids));

  if cardinality(v_blanco_ids) = 0 or cardinality(v_azul_ids) = 0 then
    raise exception 'competition_roster_split_requires_both_teams';
  end if;

  select
    count(*)::integer,
    max(squad.id) filter (where squad.squad_kind = 'single'),
    max(squad.id) filter (where squad.squad_kind = 'azul'),
    max(squad.id) filter (where squad.squad_kind = 'blanco')
  into v_linked_count, v_single_id, v_azul_id, v_blanco_id
  from public.competition_roster_squads squad
  join public.competition_roster_squad_groups source_group
    on source_group.squad_id = squad.id
  where squad.tournament_id = p_tournament_id
    and source_group.training_group_id = p_training_group_id
    and squad.status <> 'archived';

  if v_linked_count not in (0, 1, 2)
    or (v_linked_count = 1 and v_single_id is null)
    or (v_linked_count = 2 and (v_azul_id is null or v_blanco_id is null)) then
    raise exception 'competition_roster_advanced_squad_requires_editor';
  end if;

  if exists (
    select 1
    from public.competition_roster_squads squad
    join public.competition_roster_squad_groups source_group
      on source_group.squad_id = squad.id
    where squad.tournament_id = p_tournament_id
      and source_group.training_group_id = p_training_group_id
      and squad.status <> 'archived'
      and (
        select count(*)
        from public.competition_roster_squad_groups all_sources
        where all_sources.squad_id = squad.id
      ) <> 1
  ) then
    raise exception 'competition_roster_advanced_squad_requires_editor';
  end if;

  if exists (
    select 1
    from public.competition_roster_squad_members member
    join public.competition_roster_squads squad on squad.id = member.squad_id
    where squad.tournament_id = p_tournament_id
      and squad.status <> 'archived'
      and member.enrollment_id = any(v_eligible_ids)
      and not exists (
        select 1
        from public.competition_roster_squad_groups source_group
        where source_group.squad_id = squad.id
          and source_group.training_group_id = p_training_group_id
      )
  ) then
    raise exception 'competition_roster_advanced_squad_requires_editor';
  end if;

  if exists (
    select 1
    from public.competition_roster_squad_members member
    where member.source = 'manual'
      and member.squad_id = any(array_remove(array[v_single_id, v_azul_id, v_blanco_id], null))
  ) then
    raise exception 'competition_roster_advanced_squad_requires_editor';
  end if;

  v_azul_name := coalesce(nullif(trim(v_group_name), ''), 'Equipo') || ' Azul';
  v_blanco_name := coalesce(nullif(trim(v_group_name), ''), 'Equipo') || ' Blanco';

  if v_single_id is not null then
    v_azul_id := v_single_id;
    if exists (
      select 1 from public.competition_roster_squads squad
      where squad.tournament_id = p_tournament_id
        and squad.name = v_azul_name
        and squad.id <> v_azul_id
    ) then
      v_azul_name := v_azul_name || ' ' || left(p_training_group_id::text, 4);
    end if;
    update public.competition_roster_squads
    set name = v_azul_name,
        squad_kind = 'azul',
        program = p_program,
        category_label = v_category_label,
        gender = v_group_gender,
        updated_by = v_actor_id,
        updated_at = now()
    where id = v_azul_id;
  elsif v_azul_id is null then
    if exists (
      select 1 from public.competition_roster_squads squad
      where squad.tournament_id = p_tournament_id and squad.name = v_azul_name
    ) then
      v_azul_name := v_azul_name || ' ' || left(p_training_group_id::text, 4);
    end if;
    insert into public.competition_roster_squads (
      tournament_id, name, squad_kind, program, category_label, gender, status, sort_order, created_by, updated_by
    ) values (
      p_tournament_id, v_azul_name, 'azul', p_program, v_category_label, v_group_gender, 'planning', 0, v_actor_id, v_actor_id
    ) returning id into v_azul_id;
  end if;

  if v_blanco_id is null then
    if exists (
      select 1 from public.competition_roster_squads squad
      where squad.tournament_id = p_tournament_id and squad.name = v_blanco_name
    ) then
      v_blanco_name := v_blanco_name || ' ' || left(p_training_group_id::text, 4);
    end if;
    insert into public.competition_roster_squads (
      tournament_id, name, squad_kind, program, category_label, gender, status, sort_order, created_by, updated_by
    ) values (
      p_tournament_id, v_blanco_name, 'blanco', p_program, v_category_label, v_group_gender, 'planning', 1, v_actor_id, v_actor_id
    ) returning id into v_blanco_id;
  end if;

  insert into public.competition_roster_squad_groups (squad_id, training_group_id, created_by)
  values
    (v_azul_id, p_training_group_id, v_actor_id),
    (v_blanco_id, p_training_group_id, v_actor_id)
  on conflict do nothing;

  delete from public.competition_roster_squad_members member
  where member.squad_id = any(array[v_azul_id, v_blanco_id])
    and member.source = 'paid';

  insert into public.competition_roster_squad_members (squad_id, enrollment_id, source, added_by)
  select v_azul_id, selected.enrollment_id, 'paid', v_actor_id
  from unnest(v_azul_ids) selected(enrollment_id)
  on conflict on constraint competition_roster_squad_members_squad_id_enrollment_id_key do nothing;

  insert into public.competition_roster_squad_members (squad_id, enrollment_id, source, added_by)
  select v_blanco_id, selected.enrollment_id, 'paid', v_actor_id
  from unnest(v_blanco_ids) selected(enrollment_id)
  on conflict on constraint competition_roster_squad_members_squad_id_enrollment_id_key do nothing;

  update public.competition_roster_squads
  set updated_by = v_actor_id, updated_at = now()
  where id = any(array[v_azul_id, v_blanco_id]);

  insert into public.competition_roster_events (
    tournament_id, event_type, details, actor_id
  ) values (
    p_tournament_id,
    'squad.split_synced',
    jsonb_build_object(
      'training_group_id', p_training_group_id,
      'azul_squad_id', v_azul_id,
      'blanco_squad_id', v_blanco_id,
      'azul_count', cardinality(v_azul_ids),
      'blanco_count', cardinality(v_blanco_ids)
    ),
    v_actor_id
  );

  return jsonb_build_object(
    'azul_squad_id', v_azul_id,
    'blanco_squad_id', v_blanco_id,
    'azul_count', cardinality(v_azul_ids),
    'blanco_count', cardinality(v_blanco_ids)
  );
end;
$$;

revoke all on function public.create_or_sync_split_competition_squads(uuid, uuid, text, uuid[]) from public, anon;
grant execute on function public.create_or_sync_split_competition_squads(uuid, uuid, text, uuid[]) to authenticated;

comment on function public.create_or_sync_split_competition_squads(uuid, uuid, text, uuid[]) is
  'Creates or resynchronizes an Azul/Blanco competition split for one source training group without mutating finance, registrations, attendance, enrollments, or training assignments.';
