-- Transactional editor for one competition squad fed by several training groups.
-- Confirmed tournament entries remain registration truth. Ordinary source squads
-- are archived for audit; finance, attendance, enrollments, and training groups
-- are never mutated.

create or replace function public.create_or_sync_combined_competition_squad(
  p_tournament_id uuid,
  p_squad_id uuid,
  p_training_group_ids uuid[],
  p_program text,
  p_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_tournament_campus_id uuid;
  v_group_ids uuid[] := '{}'::uuid[];
  v_group_count integer := 0;
  v_target_id uuid := p_squad_id;
  v_target_source_count integer := 0;
  v_absorbed_ids uuid[] := '{}'::uuid[];
  v_eligible_ids uuid[] := '{}'::uuid[];
  v_category_label text;
  v_gender text;
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_actor_id is null then
    raise exception 'competition_roster_auth_required';
  end if;
  if p_program not in ('futbol_para_todos', 'selectivo', 'little_dragons') then
    raise exception 'competition_roster_invalid_program';
  end if;
  if char_length(v_name) < 3 or char_length(v_name) > 80 then
    raise exception 'competition_roster_combined_invalid_name';
  end if;

  select coalesce(array_agg(distinct selected.group_id order by selected.group_id), '{}'::uuid[])
    into v_group_ids
  from unnest(coalesce(p_training_group_ids, '{}'::uuid[])) selected(group_id);

  if cardinality(v_group_ids) < 2 then
    raise exception 'competition_roster_combined_needs_two_groups';
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

  select count(*)::integer
    into v_group_count
  from public.training_groups training_group
  where training_group.id = any(v_group_ids)
    and training_group.campus_id = v_tournament_campus_id
    and training_group.program = p_program
    and training_group.status = 'active';

  if v_group_count <> cardinality(v_group_ids) then
    raise exception 'competition_roster_combined_invalid_group';
  end if;

  perform 1
  from public.training_groups training_group
  where training_group.id = any(v_group_ids)
  for update;

  if v_target_id is not null then
    select count(*)::integer
      into v_target_source_count
    from public.competition_roster_squads squad
    join public.competition_roster_squad_groups source_group on source_group.squad_id = squad.id
    where squad.id = v_target_id
      and squad.tournament_id = p_tournament_id
      and squad.squad_kind = 'single'
      and squad.program = p_program
      and squad.status <> 'archived';

    if v_target_source_count < 2 then
      raise exception 'competition_roster_combined_target_not_found';
    end if;
  end if;

  if exists (
    select 1
    from public.competition_roster_squads squad
    join public.competition_roster_squad_groups source_group on source_group.squad_id = squad.id
    where squad.tournament_id = p_tournament_id
      and squad.status <> 'archived'
      and source_group.training_group_id = any(v_group_ids)
      and squad.id is distinct from v_target_id
      and (
        squad.squad_kind <> 'single'
        or (select count(*) from public.competition_roster_squad_groups all_sources where all_sources.squad_id = squad.id) <> 1
      )
  ) then
    raise exception 'competition_roster_advanced_squad_requires_editor';
  end if;

  select coalesce(array_agg(distinct squad.id), '{}'::uuid[])
    into v_absorbed_ids
  from public.competition_roster_squads squad
  join public.competition_roster_squad_groups source_group on source_group.squad_id = squad.id
  where squad.tournament_id = p_tournament_id
    and squad.status <> 'archived'
    and squad.squad_kind = 'single'
    and source_group.training_group_id = any(v_group_ids)
    and squad.id is distinct from v_target_id;

  if exists (
    select 1
    from public.competition_roster_squad_members member
    where member.source = 'manual'
      and member.squad_id = any(array_append(v_absorbed_ids, v_target_id))
  ) then
    raise exception 'competition_roster_advanced_squad_requires_editor';
  end if;

  if v_target_id is null then
    select squad.id
      into v_target_id
    from public.competition_roster_squads squad
    where squad.id = any(v_absorbed_ids)
    order by squad.created_at, squad.id
    limit 1;

    if v_target_id is not null then
      v_absorbed_ids := array_remove(v_absorbed_ids, v_target_id);
    else
      insert into public.competition_roster_squads (
        tournament_id, name, squad_kind, program, status, created_by, updated_by
      ) values (
        p_tournament_id, v_name, 'single', p_program, 'planning', v_actor_id, v_actor_id
      ) returning id into v_target_id;
    end if;
  end if;

  if exists (
    select 1
    from public.competition_roster_squads squad
    where squad.tournament_id = p_tournament_id
      and squad.name = v_name
      and squad.id <> v_target_id
  ) then
    raise exception 'competition_roster_combined_name_conflict';
  end if;

  select
    case
      when min(training_group.birth_year_min) is null and max(training_group.birth_year_max) is null then null
      when min(training_group.birth_year_min) = max(training_group.birth_year_max) then min(training_group.birth_year_min)::text
      else concat_ws('/', min(training_group.birth_year_min)::text, max(training_group.birth_year_max)::text)
    end,
    case
      when count(distinct training_group.gender) = 0 then null
      when count(distinct training_group.gender) = 1 then min(training_group.gender)
      else 'mixed'
    end
  into v_category_label, v_gender
  from public.training_groups training_group
  where training_group.id = any(v_group_ids);

  update public.competition_roster_squads
  set name = v_name,
      squad_kind = 'single',
      program = p_program,
      category_label = v_category_label,
      gender = v_gender,
      updated_by = v_actor_id,
      updated_at = now()
  where id = v_target_id;

  delete from public.competition_roster_squad_groups source_group
  where source_group.squad_id = v_target_id
    and not (source_group.training_group_id = any(v_group_ids));

  insert into public.competition_roster_squad_groups (squad_id, training_group_id, created_by)
  select v_target_id, selected.group_id, v_actor_id
  from unnest(v_group_ids) selected(group_id)
  on conflict do nothing;

  select coalesce(array_agg(distinct entry.enrollment_id), '{}'::uuid[])
    into v_eligible_ids
  from public.tournament_player_entries entry
  join public.enrollments enrollment
    on enrollment.id = entry.enrollment_id
   and enrollment.status = 'active'
   and enrollment.campus_id = v_tournament_campus_id
  join public.training_group_assignments assignment
    on assignment.enrollment_id = enrollment.id
   and assignment.training_group_id = any(v_group_ids)
   and assignment.end_date is null
  where entry.tournament_id = p_tournament_id
    and entry.entry_status = 'confirmed'
    and not exists (
      select 1 from public.competition_roster_exclusions exclusion
      where exclusion.tournament_id = p_tournament_id
        and exclusion.enrollment_id = entry.enrollment_id
    );

  if cardinality(v_eligible_ids) = 0 then
    raise exception 'competition_roster_combined_no_players';
  end if;

  if exists (
    select 1
    from public.competition_roster_squad_members member
    join public.competition_roster_squads squad on squad.id = member.squad_id
    where member.enrollment_id = any(v_eligible_ids)
      and squad.tournament_id = p_tournament_id
      and squad.status <> 'archived'
      and squad.id <> v_target_id
      and not (squad.id = any(v_absorbed_ids))
  ) then
    raise exception 'competition_roster_combined_player_conflict';
  end if;

  delete from public.competition_roster_squad_members member
  where member.squad_id = v_target_id
    and member.source = 'paid';

  insert into public.competition_roster_squad_members (squad_id, enrollment_id, source, added_by)
  select v_target_id, selected.enrollment_id, 'paid', v_actor_id
  from unnest(v_eligible_ids) selected(enrollment_id)
  on conflict on constraint competition_roster_squad_members_squad_id_enrollment_id_key do nothing;

  update public.competition_roster_squads
  set status = 'archived', updated_by = v_actor_id, updated_at = now()
  where id = any(v_absorbed_ids);

  insert into public.competition_roster_events (tournament_id, squad_id, event_type, details, actor_id)
  values (
    p_tournament_id,
    v_target_id,
    'squad.groups_combined',
    jsonb_build_object(
      'training_group_ids', v_group_ids,
      'absorbed_squad_ids', v_absorbed_ids,
      'member_count', cardinality(v_eligible_ids),
      'name', v_name
    ),
    v_actor_id
  );

  return jsonb_build_object(
    'squad_id', v_target_id,
    'training_group_count', cardinality(v_group_ids),
    'member_count', cardinality(v_eligible_ids),
    'absorbed_squad_count', cardinality(v_absorbed_ids)
  );
end;
$$;

revoke all on function public.create_or_sync_combined_competition_squad(uuid, uuid, uuid[], text, text) from public, anon;
grant execute on function public.create_or_sync_combined_competition_squad(uuid, uuid, uuid[], text, text) to authenticated;

comment on function public.create_or_sync_combined_competition_squad(uuid, uuid, uuid[], text, text) is
  'Creates or resynchronizes one tournament squad from several active source training groups without mutating finance, registration, attendance, enrollment, or training assignments.';
