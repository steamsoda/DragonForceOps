-- Attendance correction role widening and Contry 2016/2017 B1 split support.
--
-- Data portion:
-- - Splits Contry Futbol Para Todos Intermedio B1 2016/2017 into one 2016 group
--   and one 2017 group.
-- - Moves active assignments by player birth year.
-- - Copies coaches and recurring attendance templates.
-- - Clones already-generated future scheduled sessions to both new groups and
--   cancels the old scheduled copies, preserving completed history.

do $$
declare
  v_campus_id uuid;
  v_old_group_id uuid;
  v_group_2016_id uuid;
  v_group_2017_id uuid;
  v_split_date date := (now() at time zone 'America/Monterrey')::date;
  v_assignment_end date;
  v_target_group_id uuid;
  v_row record;
begin
  select id
  into v_campus_id
  from public.campuses
  where lower(name) = 'contry'
     or lower(code) = 'contry'
  order by name
  limit 1;

  if v_campus_id is null then
    return;
  end if;

  select id
  into v_old_group_id
  from public.training_groups
  where campus_id = v_campus_id
    and program = 'futbol_para_todos'
    and group_code = 'B1'
    and gender = 'mixed'
    and birth_year_min = 2016
    and birth_year_max = 2017
    and status = 'active'
  order by created_at
  limit 1;

  if v_old_group_id is null then
    return;
  end if;

  select id
  into v_group_2016_id
  from public.training_groups
  where campus_id = v_campus_id
    and name = 'Intermedio B1'
    and program = 'futbol_para_todos'
    and group_code = 'B1'
    and gender = 'mixed'
    and birth_year_min = 2016
    and birth_year_max = 2016
  order by created_at
  limit 1;

  if v_group_2016_id is null then
    insert into public.training_groups (
      campus_id,
      name,
      program,
      level_label,
      group_code,
      gender,
      birth_year_min,
      birth_year_max,
      start_time,
      end_time,
      status,
      notes
    )
    select
      campus_id,
      name,
      program,
      level_label,
      group_code,
      gender,
      2016,
      2016,
      start_time,
      end_time,
      'active',
      'Created by Contry 2016/2017 B1 split migration.'
    from public.training_groups
    where id = v_old_group_id
    returning id into v_group_2016_id;
  else
    update public.training_groups
    set status = 'active',
        updated_at = now()
    where id = v_group_2016_id;
  end if;

  select id
  into v_group_2017_id
  from public.training_groups
  where campus_id = v_campus_id
    and name = 'Intermedio B1'
    and program = 'futbol_para_todos'
    and group_code = 'B1'
    and gender = 'mixed'
    and birth_year_min = 2017
    and birth_year_max = 2017
  order by created_at
  limit 1;

  if v_group_2017_id is null then
    insert into public.training_groups (
      campus_id,
      name,
      program,
      level_label,
      group_code,
      gender,
      birth_year_min,
      birth_year_max,
      start_time,
      end_time,
      status,
      notes
    )
    select
      campus_id,
      name,
      program,
      level_label,
      group_code,
      gender,
      2017,
      2017,
      start_time,
      end_time,
      'active',
      'Created by Contry 2016/2017 B1 split migration.'
    from public.training_groups
    where id = v_old_group_id
    returning id into v_group_2017_id;
  else
    update public.training_groups
    set status = 'active',
        updated_at = now()
    where id = v_group_2017_id;
  end if;

  insert into public.training_group_coaches (training_group_id, coach_id, is_primary)
  select target_group_id, source.coach_id, source.is_primary
  from public.training_group_coaches source
  cross join (
    values (v_group_2016_id), (v_group_2017_id)
  ) as targets(target_group_id)
  where source.training_group_id = v_old_group_id
    and not exists (
      select 1
      from public.training_group_coaches existing
      where existing.training_group_id = targets.target_group_id
        and existing.coach_id = source.coach_id
    );

  insert into public.attendance_schedule_templates (
    team_id,
    training_group_id,
    campus_id,
    day_of_week,
    start_time,
    end_time,
    effective_start,
    effective_end,
    is_active,
    created_by
  )
  select
    null,
    targets.target_group_id,
    source.campus_id,
    source.day_of_week,
    source.start_time,
    source.end_time,
    v_split_date,
    null,
    true,
    source.created_by
  from public.attendance_schedule_templates source
  cross join (
    values (v_group_2016_id), (v_group_2017_id)
  ) as targets(target_group_id)
  where source.training_group_id = v_old_group_id
    and source.is_active = true
    and (source.effective_end is null or source.effective_end >= v_split_date)
    and not exists (
      select 1
      from public.attendance_schedule_templates existing
      where existing.training_group_id = targets.target_group_id
        and existing.campus_id = source.campus_id
        and existing.day_of_week = source.day_of_week
        and existing.start_time = source.start_time
        and existing.end_time = source.end_time
        and existing.is_active = true
        and (existing.effective_end is null or existing.effective_end >= v_split_date)
    );

  for v_row in
    select
      tga.id,
      tga.enrollment_id,
      tga.player_id,
      tga.start_date,
      extract(year from p.birth_date)::int as birth_year
    from public.training_group_assignments tga
    join public.players p on p.id = tga.player_id
    where tga.training_group_id = v_old_group_id
      and tga.end_date is null
      and extract(year from p.birth_date)::int in (2016, 2017)
  loop
    v_target_group_id := case
      when v_row.birth_year = 2016 then v_group_2016_id
      when v_row.birth_year = 2017 then v_group_2017_id
      else null
    end;

    if v_target_group_id is null then
      continue;
    end if;

    v_assignment_end := case
      when v_split_date > v_row.start_date then v_split_date - 1
      else v_row.start_date
    end;

    update public.training_group_assignments
    set end_date = v_assignment_end,
        updated_at = now()
    where id = v_row.id
      and end_date is null;

    insert into public.training_group_assignments (
      training_group_id,
      enrollment_id,
      player_id,
      start_date,
      assigned_by
    )
    select
      v_target_group_id,
      v_row.enrollment_id,
      v_row.player_id,
      v_split_date,
      null
    where not exists (
      select 1
      from public.training_group_assignments existing
      where existing.enrollment_id = v_row.enrollment_id
        and existing.training_group_id = v_target_group_id
        and existing.start_date = v_split_date
    )
    and not exists (
      select 1
      from public.training_group_assignments active_existing
      where active_existing.enrollment_id = v_row.enrollment_id
        and active_existing.end_date is null
    );
  end loop;

  insert into public.attendance_sessions (
    campus_id,
    team_id,
    training_group_id,
    schedule_template_id,
    session_type,
    status,
    session_date,
    start_time,
    end_time,
    opponent_name,
    notes,
    created_by
  )
  select
    source.campus_id,
    null,
    targets.target_group_id,
    target_template.id,
    source.session_type,
    'scheduled',
    source.session_date,
    source.start_time,
    source.end_time,
    source.opponent_name,
    source.notes,
    source.created_by
  from public.attendance_sessions source
  cross join (
    values (v_group_2016_id), (v_group_2017_id)
  ) as targets(target_group_id)
  left join lateral (
    select template.id
    from public.attendance_schedule_templates template
    where template.training_group_id = targets.target_group_id
      and template.day_of_week = extract(isodow from source.session_date)::int
      and template.start_time = source.start_time
      and template.end_time = source.end_time
      and template.is_active = true
    order by template.created_at desc
    limit 1
  ) target_template on true
  where source.training_group_id = v_old_group_id
    and source.status = 'scheduled'
    and source.session_date >= v_split_date
    and not exists (
      select 1
      from public.attendance_sessions existing
      where existing.training_group_id = targets.target_group_id
        and existing.session_date = source.session_date
        and existing.start_time = source.start_time
        and existing.session_type = source.session_type
    );

  update public.attendance_sessions source
  set status = 'cancelled',
      cancelled_reason_code = 'other',
      cancelled_reason = 'Replaced by Contry 2016/2017 B1 split groups.',
      updated_at = now()
  where source.training_group_id = v_old_group_id
    and source.status = 'scheduled'
    and source.session_date >= v_split_date
    and not exists (
      select 1
      from public.attendance_records records
      where records.session_id = source.id
    );

  update public.attendance_schedule_templates source
  set is_active = false,
      effective_end = greatest(source.effective_start, v_split_date - 1),
      updated_at = now()
  where source.training_group_id = v_old_group_id
    and source.is_active = true
    and (source.effective_end is null or source.effective_end >= v_split_date);

  update public.training_groups
  set status = 'inactive',
      notes = concat_ws(E'\n', nullif(notes, ''), 'Inactive after Contry 2016/2017 B1 split migration.'),
      updated_at = now()
  where id = v_old_group_id;
end $$;
