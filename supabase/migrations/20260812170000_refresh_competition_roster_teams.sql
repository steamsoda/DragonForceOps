-- Reconcile paid tournament squads after training-group changes.
-- Deterministic one-destination changes move automatically; split destinations
-- remain pending for sporting review.

create or replace function public.reconcile_competition_roster_entry(
  p_tournament_id uuid,
  p_enrollment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_existing_ids uuid[] := '{}'::uuid[];
  v_destination_ids uuid[] := '{}'::uuid[];
  v_source_id uuid;
  v_destination_id uuid;
  v_group_id uuid;
  v_group_name text;
  v_group_program text;
  v_group_gender text;
  v_birth_year_min integer;
  v_birth_year_max integer;
  v_assignment_created_at timestamptz;
  v_latest_manual_move_at timestamptz;
  v_squad_name text;
  v_member public.competition_roster_squad_members%rowtype;
begin
  v_result := public.sync_competition_roster_entry(p_tournament_id, p_enrollment_id);
  if coalesce(v_result ->> 'status', '') <> 'group_change_review' then
    return v_result;
  end if;

  select
    assignment.training_group_id,
    training_group.name,
    training_group.program,
    training_group.gender,
    training_group.birth_year_min,
    training_group.birth_year_max,
    assignment.created_at
    into
      v_group_id,
      v_group_name,
      v_group_program,
      v_group_gender,
      v_birth_year_min,
      v_birth_year_max,
      v_assignment_created_at
  from public.training_group_assignments assignment
  join public.training_groups training_group
    on training_group.id = assignment.training_group_id
   and training_group.status = 'active'
  where assignment.enrollment_id = p_enrollment_id
    and assignment.end_date is null
  order by assignment.start_date desc, assignment.id
  limit 1;

  select coalesce(array_agg(distinct member.squad_id), '{}'::uuid[])
    into v_existing_ids
  from public.competition_roster_squad_members member
  join public.competition_roster_squads squad on squad.id = member.squad_id
  where squad.tournament_id = p_tournament_id
    and squad.status <> 'archived'
    and member.enrollment_id = p_enrollment_id
    and member.source = 'paid';

  select coalesce(array_agg(distinct squad.id), '{}'::uuid[])
    into v_destination_ids
  from public.competition_roster_squads squad
  join public.competition_roster_squad_groups source_group on source_group.squad_id = squad.id
  where squad.tournament_id = p_tournament_id
    and squad.status <> 'archived'
    and source_group.training_group_id = v_group_id;

  select max(event.created_at)
    into v_latest_manual_move_at
  from public.competition_roster_events event
  where event.tournament_id = p_tournament_id
    and event.enrollment_id = p_enrollment_id
    and event.event_type = 'squad.member_moved';

  -- A director's explicit team move wins until the player's training group is
  -- changed again. This prevents a bulk refresh from undoing Azul/Blanco edits.
  if v_latest_manual_move_at is not null
     and v_assignment_created_at is not null
     and v_latest_manual_move_at >= v_assignment_created_at then
    return jsonb_build_object('status', 'manual_assignment_preserved', 'squad_ids', v_existing_ids);
  end if;

  if cardinality(v_existing_ids) = 1 and cardinality(v_destination_ids) = 0 then
    perform pg_advisory_xact_lock(hashtextextended(p_tournament_id::text || ':' || v_group_id::text, 0));

    select coalesce(array_agg(distinct squad.id), '{}'::uuid[])
      into v_destination_ids
    from public.competition_roster_squads squad
    join public.competition_roster_squad_groups source_group on source_group.squad_id = squad.id
    where squad.tournament_id = p_tournament_id
      and squad.status <> 'archived'
      and source_group.training_group_id = v_group_id;

    if cardinality(v_destination_ids) = 0 then
      v_squad_name := coalesce(nullif(trim(v_group_name), ''), 'Equipo');
      if exists (
        select 1 from public.competition_roster_squads squad
        where squad.tournament_id = p_tournament_id
          and squad.name = v_squad_name
      ) then
        v_squad_name := v_squad_name || ' - ' || left(v_group_id::text, 4);
      end if;

      insert into public.competition_roster_squads (
        tournament_id, name, squad_kind, program, category_label, gender,
        status, created_by, updated_by
      ) values (
        p_tournament_id,
        v_squad_name,
        'single',
        v_group_program,
        case
          when v_birth_year_min is null and v_birth_year_max is null then null
          when v_birth_year_min is distinct from v_birth_year_max then concat_ws('/', v_birth_year_min::text, v_birth_year_max::text)
          else coalesce(v_birth_year_min, v_birth_year_max)::text
        end,
        v_group_gender,
        'ready',
        auth.uid(),
        auth.uid()
      ) returning id into v_destination_id;

      insert into public.competition_roster_squad_groups (squad_id, training_group_id, created_by)
      values (v_destination_id, v_group_id, auth.uid());
      v_destination_ids := array[v_destination_id];

      insert into public.competition_roster_events (
        tournament_id, squad_id, event_type, details, actor_id
      ) values (
        p_tournament_id,
        v_destination_id,
        'squad.auto_created',
        jsonb_build_object('training_group_id', v_group_id, 'program', v_group_program),
        auth.uid()
      );
    end if;
  end if;

  if cardinality(v_existing_ids) <> 1 or cardinality(v_destination_ids) <> 1 then
    return jsonb_build_object(
      'status', 'group_change_review',
      'current_squad_ids', v_existing_ids,
      'destination_squad_ids', v_destination_ids
    );
  end if;

  v_source_id := v_existing_ids[1];
  v_destination_id := v_destination_ids[1];
  if v_source_id = v_destination_id then
    return jsonb_build_object('status', 'already_assigned', 'squad_id', v_source_id);
  end if;

  perform 1
  from public.competition_roster_squads
  where id in (v_source_id, v_destination_id)
  order by id
  for update;

  select *
    into v_member
  from public.competition_roster_squad_members
  where squad_id = v_source_id
    and enrollment_id = p_enrollment_id
    and source = 'paid'
  for update;

  if v_member.id is null then
    return jsonb_build_object('status', 'group_change_review');
  end if;

  if exists (
    select 1
    from public.competition_roster_squad_members
    where squad_id = v_destination_id
      and enrollment_id = p_enrollment_id
  ) then
    delete from public.competition_roster_squad_members where id = v_member.id;
  else
    update public.competition_roster_squad_members
    set squad_id = v_destination_id,
        updated_at = now()
    where id = v_member.id;
  end if;

  update public.competition_roster_squads
  set updated_at = now()
  where id in (v_source_id, v_destination_id);

  insert into public.competition_roster_events (
    tournament_id,
    squad_id,
    enrollment_id,
    event_type,
    details,
    actor_id
  ) values (
    p_tournament_id,
    v_destination_id,
    p_enrollment_id,
    'squad.member_training_group_reassigned',
    jsonb_build_object(
      'source_squad_id', v_source_id,
      'destination_squad_id', v_destination_id,
      'training_group_id', v_group_id
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'status', 'training_group_reassigned',
    'source_squad_id', v_source_id,
    'destination_squad_id', v_destination_id
  );
end;
$$;

revoke all on function public.reconcile_competition_roster_entry(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.refresh_competition_roster_teams(
  p_tournament_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament public.tournaments%rowtype;
  v_entry record;
  v_result jsonb;
  v_checked integer := 0;
  v_moved integer := 0;
  v_pending integer := 0;
  v_failed integer := 0;
begin
  if auth.uid() is null then
    raise exception 'competition_roster_refresh_auth_required';
  end if;

  select * into v_tournament
  from public.tournaments
  where id = p_tournament_id;

  if v_tournament.id is null or not v_tournament.is_active then
    raise exception 'competition_roster_refresh_tournament_inactive';
  end if;
  if not public.can_access_sports_campus(v_tournament.campus_id) then
    raise exception 'competition_roster_refresh_manager_required';
  end if;

  for v_entry in
    select distinct entry.enrollment_id
    from public.tournament_player_entries entry
    where entry.tournament_id = p_tournament_id
      and entry.entry_status = 'confirmed'
    order by entry.enrollment_id
  loop
    begin
      v_result := public.reconcile_competition_roster_entry(p_tournament_id, v_entry.enrollment_id);
      v_checked := v_checked + 1;
      if v_result ->> 'status' = 'training_group_reassigned' then
        v_moved := v_moved + 1;
      elsif v_result ->> 'status' in ('group_change_review', 'pending_split_assignment', 'pending_training_group') then
        v_pending := v_pending + 1;
      end if;
    exception when others then
      v_checked := v_checked + 1;
      v_failed := v_failed + 1;
    end;
  end loop;

  if v_failed = 0 then
    delete from public.competition_roster_sync_queue queue
    where queue.tournament_id = p_tournament_id;
  end if;

  insert into public.competition_roster_events (
    tournament_id,
    event_type,
    details,
    actor_id
  ) values (
    p_tournament_id,
    'squad.bulk_refreshed',
    jsonb_build_object(
      'checked', v_checked,
      'moved', v_moved,
      'pending_review', v_pending,
      'failed', v_failed
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'checked', v_checked,
    'moved', v_moved,
    'pending_review', v_pending,
    'failed', v_failed
  );
end;
$$;

revoke all on function public.refresh_competition_roster_teams(uuid) from public, anon;
grant execute on function public.refresh_competition_roster_teams(uuid) to authenticated;

comment on function public.refresh_competition_roster_teams(uuid) is
  'Reconciles all confirmed tournament entries with current training groups. Unique destinations move automatically; split or ambiguous destinations remain pending. Does not mutate finance, registrations, enrollments, attendance, or training assignments.';

create or replace function public.process_competition_roster_sync_queue(
  p_limit integer default 100,
  p_enrollment_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_processed integer := 0;
  v_failed integer := 0;
  v_error text;
begin
  for v_item in
    select queue.tournament_id, queue.enrollment_id, queue.requested_at
    from public.competition_roster_sync_queue queue
    where p_enrollment_id is null or queue.enrollment_id = p_enrollment_id
    order by queue.requested_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    begin
      perform public.reconcile_competition_roster_entry(v_item.tournament_id, v_item.enrollment_id);
      delete from public.competition_roster_sync_queue queue
      where queue.tournament_id = v_item.tournament_id
        and queue.enrollment_id = v_item.enrollment_id
        and queue.requested_at <= v_item.requested_at;
      v_processed := v_processed + 1;
    exception when others then
      get stacked diagnostics v_error = message_text;
      update public.competition_roster_sync_queue queue
      set attempt_count = queue.attempt_count + 1,
          last_attempt_at = now(),
          last_error = left(v_error, 1000)
      where queue.tournament_id = v_item.tournament_id
        and queue.enrollment_id = v_item.enrollment_id;
      v_failed := v_failed + 1;
    end;
  end loop;

  return jsonb_build_object('processed', v_processed, 'failed', v_failed);
end;
$$;

revoke all on function public.process_competition_roster_sync_queue(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.process_competition_roster_sync_queue(integer, uuid)
  to service_role;

comment on function public.process_competition_roster_sync_queue(integer, uuid) is
  'Processes dynamic squad routing and deterministic training-group reassignments. Split destinations remain pending for sporting review.';
