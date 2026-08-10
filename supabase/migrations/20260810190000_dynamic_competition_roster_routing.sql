-- Dynamic competition-roster routing.
-- Confirmed tournament entries remain registration truth. Registration writes
-- enqueue independent sporting work so a routing failure cannot roll back a
-- payment, allocation, tournament entry, enrollment, or training assignment.

create table if not exists public.competition_roster_sync_queue (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  requested_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  last_attempt_at timestamptz null,
  last_error text null,
  primary key (tournament_id, enrollment_id)
);

create index if not exists idx_competition_roster_sync_queue_requested
  on public.competition_roster_sync_queue(requested_at, attempt_count);

alter table public.competition_roster_sync_queue enable row level security;
revoke all on public.competition_roster_sync_queue from public, anon, authenticated;

comment on table public.competition_roster_sync_queue is
  'Private retry queue that keeps paid tournament-entry writes independent from dynamic competition-roster routing.';

create or replace function public.enqueue_competition_roster_sync(
  p_tournament_id uuid,
  p_enrollment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tournament_id is null or p_enrollment_id is null then
    return;
  end if;

  insert into public.competition_roster_sync_queue (
    tournament_id,
    enrollment_id,
    requested_at,
    attempt_count,
    last_attempt_at,
    last_error
  )
  values (p_tournament_id, p_enrollment_id, now(), 0, null, null)
  on conflict (tournament_id, enrollment_id) do update
  set requested_at = excluded.requested_at,
      attempt_count = 0,
      last_attempt_at = null,
      last_error = null;
end;
$$;

revoke all on function public.enqueue_competition_roster_sync(uuid, uuid) from public, anon, authenticated;

create or replace function public.sync_competition_roster_entry(
  p_tournament_id uuid,
  p_enrollment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_campus_id uuid;
  v_tournament_active boolean := false;
  v_enrollment_campus_id uuid;
  v_enrollment_status text;
  v_has_confirmed_entry boolean := false;
  v_is_excluded boolean := false;
  v_group_count integer := 0;
  v_group_id uuid;
  v_group_name text;
  v_group_program text;
  v_group_gender text;
  v_birth_year_min integer;
  v_birth_year_max integer;
  v_destination_ids uuid[] := '{}'::uuid[];
  v_existing_paid_ids uuid[] := '{}'::uuid[];
  v_destination_id uuid;
  v_squad_name text;
  v_removed_count integer := 0;
  v_added_count integer := 0;
begin
  select tournament.campus_id, tournament.is_active
    into v_tournament_campus_id, v_tournament_active
  from public.tournaments tournament
  where tournament.id = p_tournament_id;

  if v_tournament_campus_id is null then
    return jsonb_build_object('status', 'tournament_missing');
  end if;

  select enrollment.campus_id, enrollment.status
    into v_enrollment_campus_id, v_enrollment_status
  from public.enrollments enrollment
  where enrollment.id = p_enrollment_id;

  select exists (
    select 1
    from public.tournament_player_entries entry
    where entry.tournament_id = p_tournament_id
      and entry.enrollment_id = p_enrollment_id
      and entry.entry_status = 'confirmed'
  ) into v_has_confirmed_entry;

  select exists (
    select 1
    from public.competition_roster_exclusions exclusion
    where exclusion.tournament_id = p_tournament_id
      and exclusion.enrollment_id = p_enrollment_id
  ) into v_is_excluded;

  if not v_has_confirmed_entry
    or v_enrollment_campus_id is null
    or v_enrollment_campus_id <> v_tournament_campus_id
    or v_enrollment_status <> 'active'
    or v_is_excluded then
    with removed as (
      delete from public.competition_roster_squad_members member
      using public.competition_roster_squads squad
      where member.squad_id = squad.id
        and squad.tournament_id = p_tournament_id
        and squad.status <> 'archived'
        and member.enrollment_id = p_enrollment_id
        and member.source = 'paid'
      returning member.squad_id
    )
    select count(*)::integer into v_removed_count from removed;

    if v_removed_count > 0 then
      insert into public.competition_roster_events (
        tournament_id,
        enrollment_id,
        event_type,
        details
      ) values (
        p_tournament_id,
        p_enrollment_id,
        'squad.member_auto_removed',
        jsonb_build_object(
          'removed_count', v_removed_count,
          'confirmed_entry', v_has_confirmed_entry,
          'enrollment_status', v_enrollment_status,
          'excluded', v_is_excluded
        )
      );
    end if;

    return jsonb_build_object('status', 'ineligible', 'removed_count', v_removed_count);
  end if;

  if not v_tournament_active then
    return jsonb_build_object('status', 'tournament_inactive');
  end if;

  select
    count(*)::integer,
    (array_agg(assignment.training_group_id order by assignment.training_group_id::text))[1],
    (array_agg(training_group.name order by assignment.training_group_id::text))[1],
    (array_agg(training_group.program order by assignment.training_group_id::text))[1],
    (array_agg(training_group.gender order by assignment.training_group_id::text))[1],
    (array_agg(training_group.birth_year_min order by assignment.training_group_id::text))[1],
    (array_agg(training_group.birth_year_max order by assignment.training_group_id::text))[1]
  into
    v_group_count,
    v_group_id,
    v_group_name,
    v_group_program,
    v_group_gender,
    v_birth_year_min,
    v_birth_year_max
  from public.training_group_assignments assignment
  join public.training_groups training_group
    on training_group.id = assignment.training_group_id
   and training_group.status = 'active'
  where assignment.enrollment_id = p_enrollment_id
    and assignment.end_date is null;

  if v_group_count <> 1
    or v_group_program is null
    or v_group_program not in ('futbol_para_todos', 'selectivo', 'little_dragons') then
    insert into public.competition_roster_events (
      tournament_id,
      enrollment_id,
      event_type,
      details
    ) values (
      p_tournament_id,
      p_enrollment_id,
      'squad.member_routing_pending',
      jsonb_build_object('reason', 'training_group_unavailable', 'active_group_count', v_group_count)
    );
    return jsonb_build_object('status', 'pending_training_group', 'active_group_count', v_group_count);
  end if;

  select coalesce(array_agg(distinct member.squad_id), '{}'::uuid[])
    into v_existing_paid_ids
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
    and squad.program = v_group_program
    and source_group.training_group_id = v_group_id;

  -- Existing tournament assignments remain stable when a player changes
  -- training groups. A director can review the mismatch instead of the system
  -- silently moving a player between competition teams mid-tournament.
  if cardinality(v_existing_paid_ids) > 0 then
    if not (v_existing_paid_ids && v_destination_ids) then
      insert into public.competition_roster_events (
        tournament_id,
        enrollment_id,
        event_type,
        details
      ) values (
        p_tournament_id,
        p_enrollment_id,
        'squad.member_group_review_required',
        jsonb_build_object(
          'training_group_id', v_group_id,
          'current_squad_ids', v_existing_paid_ids,
          'destination_squad_ids', v_destination_ids
        )
      );
      return jsonb_build_object('status', 'group_change_review', 'squad_ids', v_existing_paid_ids);
    end if;

    return jsonb_build_object('status', 'already_assigned', 'squad_ids', v_existing_paid_ids);
  end if;

  -- Serialize first-time routing for this tournament/group pair so concurrent
  -- payments cannot create duplicate default squads.
  perform pg_advisory_xact_lock(hashtextextended(p_tournament_id::text || ':' || v_group_id::text, 0));

  select coalesce(array_agg(distinct squad.id), '{}'::uuid[])
    into v_destination_ids
  from public.competition_roster_squads squad
  join public.competition_roster_squad_groups source_group on source_group.squad_id = squad.id
  where squad.tournament_id = p_tournament_id
    and squad.status <> 'archived'
    and squad.program = v_group_program
    and source_group.training_group_id = v_group_id;

  if cardinality(v_destination_ids) = 0 then
    v_squad_name := coalesce(nullif(trim(v_group_name), ''), 'Equipo');
    if exists (
      select 1
      from public.competition_roster_squads squad
      where squad.tournament_id = p_tournament_id
        and squad.name = v_squad_name
    ) then
      v_squad_name := v_squad_name || ' - ' || left(v_group_id::text, 4);
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
      null,
      null
    ) returning id into v_destination_id;

    insert into public.competition_roster_squad_groups (squad_id, training_group_id, created_by)
    values (v_destination_id, v_group_id, null);

    v_destination_ids := array[v_destination_id];

    insert into public.competition_roster_events (
      tournament_id,
      squad_id,
      event_type,
      details
    ) values (
      p_tournament_id,
      v_destination_id,
      'squad.auto_created',
      jsonb_build_object('training_group_id', v_group_id, 'program', v_group_program)
    );
  end if;

  if cardinality(v_destination_ids) > 1 then
    insert into public.competition_roster_events (
      tournament_id,
      enrollment_id,
      event_type,
      details
    ) values (
      p_tournament_id,
      p_enrollment_id,
      'squad.member_routing_pending',
      jsonb_build_object(
        'reason', 'multiple_destination_squads',
        'training_group_id', v_group_id,
        'destination_squad_ids', v_destination_ids
      )
    );
    return jsonb_build_object(
      'status', 'pending_split_assignment',
      'training_group_id', v_group_id,
      'destination_squad_ids', v_destination_ids
    );
  end if;

  v_destination_id := v_destination_ids[1];
  insert into public.competition_roster_squad_members (
    squad_id,
    enrollment_id,
    source,
    added_by
  ) values (
    v_destination_id,
    p_enrollment_id,
    'paid',
    null
  )
  on conflict on constraint competition_roster_squad_members_squad_id_enrollment_id_key do nothing;
  get diagnostics v_added_count = row_count;

  if v_added_count > 0 then
    update public.competition_roster_squads
    set status = 'ready', updated_at = now()
    where id = v_destination_id;

    insert into public.competition_roster_events (
      tournament_id,
      squad_id,
      enrollment_id,
      event_type,
      details
    ) values (
      p_tournament_id,
      v_destination_id,
      p_enrollment_id,
      'squad.member_auto_added',
      jsonb_build_object('training_group_id', v_group_id, 'program', v_group_program)
    );
  end if;

  return jsonb_build_object(
    'status', case when v_added_count > 0 then 'assigned' else 'already_assigned' end,
    'squad_id', v_destination_id,
    'added_count', v_added_count
  );
end;
$$;

revoke all on function public.sync_competition_roster_entry(uuid, uuid) from public, anon, authenticated;

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
      perform public.sync_competition_roster_entry(v_item.tournament_id, v_item.enrollment_id);
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

revoke all on function public.process_competition_roster_sync_queue(integer, uuid) from public, anon, authenticated;
grant execute on function public.process_competition_roster_sync_queue(integer, uuid) to service_role;

comment on function public.process_competition_roster_sync_queue(integer, uuid) is
  'Processes independent dynamic squad routing. Exactly one destination auto-assigns; multiple destinations remain pending for sporting review.';

create or replace function public.queue_competition_roster_entry_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.enqueue_competition_roster_sync(old.tournament_id, old.enrollment_id);
    return old;
  end if;

  if tg_op = 'UPDATE'
    and (old.tournament_id, old.enrollment_id) is distinct from (new.tournament_id, new.enrollment_id) then
    perform public.enqueue_competition_roster_sync(old.tournament_id, old.enrollment_id);
  end if;
  perform public.enqueue_competition_roster_sync(new.tournament_id, new.enrollment_id);
  return new;
end;
$$;

revoke all on function public.queue_competition_roster_entry_change() from public, anon, authenticated;

drop trigger if exists queue_competition_roster_entry_change on public.tournament_player_entries;
create trigger queue_competition_roster_entry_change
  after insert or update of tournament_id, enrollment_id, entry_status or delete
  on public.tournament_player_entries
  for each row execute function public.queue_competition_roster_entry_change();

create or replace function public.queue_competition_rosters_for_enrollment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment_id uuid;
begin
  v_enrollment_id := new.id;
  insert into public.competition_roster_sync_queue (tournament_id, enrollment_id, requested_at)
  select entry.tournament_id, entry.enrollment_id, now()
  from public.tournament_player_entries entry
  where entry.enrollment_id = v_enrollment_id
  on conflict (tournament_id, enrollment_id) do update
  set requested_at = excluded.requested_at,
      attempt_count = 0,
      last_attempt_at = null,
      last_error = null;
  return new;
end;
$$;

revoke all on function public.queue_competition_rosters_for_enrollment_change() from public, anon, authenticated;

drop trigger if exists queue_competition_rosters_for_enrollment_status on public.enrollments;
create trigger queue_competition_rosters_for_enrollment_status
  after update of status on public.enrollments
  for each row
  when (old.status is distinct from new.status)
  execute function public.queue_competition_rosters_for_enrollment_change();

create or replace function public.queue_competition_rosters_for_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment_id uuid;
begin
  if tg_op = 'DELETE' then
    v_enrollment_id := old.enrollment_id;
  else
    v_enrollment_id := new.enrollment_id;
  end if;
  insert into public.competition_roster_sync_queue (tournament_id, enrollment_id, requested_at)
  select entry.tournament_id, entry.enrollment_id, now()
  from public.tournament_player_entries entry
  where entry.enrollment_id = v_enrollment_id
    and entry.entry_status = 'confirmed'
  on conflict (tournament_id, enrollment_id) do update
  set requested_at = excluded.requested_at,
      attempt_count = 0,
      last_attempt_at = null,
      last_error = null;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.queue_competition_rosters_for_assignment_change() from public, anon, authenticated;

drop trigger if exists queue_competition_rosters_for_assignment_change on public.training_group_assignments;
create trigger queue_competition_rosters_for_assignment_change
  after insert or update of training_group_id, enrollment_id, end_date or delete
  on public.training_group_assignments
  for each row execute function public.queue_competition_rosters_for_assignment_change();

create or replace function public.queue_competition_roster_exclusion_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.enqueue_competition_roster_sync(old.tournament_id, old.enrollment_id);
    return old;
  end if;
  perform public.enqueue_competition_roster_sync(new.tournament_id, new.enrollment_id);
  return new;
end;
$$;

revoke all on function public.queue_competition_roster_exclusion_change() from public, anon, authenticated;

drop trigger if exists queue_competition_roster_exclusion_change on public.competition_roster_exclusions;
create trigger queue_competition_roster_exclusion_change
  after insert or delete on public.competition_roster_exclusions
  for each row execute function public.queue_competition_roster_exclusion_change();

-- Seed only active tournaments. The queue/processor is idempotent and does not
-- modify tournament registration, finance, attendance, enrollment, or groups.
insert into public.competition_roster_sync_queue (tournament_id, enrollment_id, requested_at)
select entry.tournament_id, entry.enrollment_id, now()
from public.tournament_player_entries entry
join public.tournaments tournament on tournament.id = entry.tournament_id
where entry.entry_status = 'confirmed'
  and tournament.is_active = true
on conflict (tournament_id, enrollment_id) do update
set requested_at = excluded.requested_at,
    attempt_count = 0,
    last_attempt_at = null,
    last_error = null;

do $$
begin
  perform cron.unschedule('sync-competition-rosters');
exception when others then
  null;
end $$;

select cron.schedule(
  'sync-competition-rosters',
  '* * * * *',
  $cron$select public.process_competition_roster_sync_queue(100, null);$cron$
);
