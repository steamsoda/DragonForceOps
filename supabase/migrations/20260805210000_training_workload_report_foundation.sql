-- Training workload report foundation.
-- Freezes coach assignments on attendance sessions and exposes one aggregated,
-- campus-scoped rolling 30-day data contract for the upcoming report UI.

alter table public.attendance_sessions
  add column if not exists coach_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists coach_snapshot_captured_at timestamptz null,
  add column if not exists coach_snapshot_source text null;

alter table public.attendance_sessions
  drop constraint if exists attendance_sessions_coach_snapshot_source_check;

alter table public.attendance_sessions
  add constraint attendance_sessions_coach_snapshot_source_check
  check (
    coach_snapshot_source is null
    or coach_snapshot_source in ('creation', 'completion', 'legacy_backfill_current_assignment')
  );

create or replace function public.current_training_group_coach_snapshot(
  p_training_group_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'coach_id', coaches.id,
        'name', nullif(trim(concat_ws(' ', coaches.first_name, coaches.last_name)), ''),
        'is_primary', links.is_primary
      )
      order by links.is_primary desc, coaches.first_name, coaches.last_name, coaches.id
    ),
    '[]'::jsonb
  )
  from public.training_group_coaches links
  join public.coaches coaches on coaches.id = links.coach_id
  where links.training_group_id = p_training_group_id
    and coalesce(coaches.is_active, true);
$$;

revoke all on function public.current_training_group_coach_snapshot(uuid) from public;
revoke all on function public.current_training_group_coach_snapshot(uuid) from anon;
revoke all on function public.current_training_group_coach_snapshot(uuid) from authenticated;
grant execute on function public.current_training_group_coach_snapshot(uuid) to service_role;

create or replace function public.capture_attendance_session_coach_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_should_capture boolean := false;
begin
  if new.training_group_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_should_capture := true;
  elsif new.training_group_id is distinct from old.training_group_id then
    v_should_capture := true;
  elsif new.status = 'completed' and old.status is distinct from 'completed' then
    v_should_capture := true;
  end if;

  if v_should_capture then
    new.coach_snapshot := public.current_training_group_coach_snapshot(new.training_group_id);
    new.coach_snapshot_captured_at := now();
    new.coach_snapshot_source := case
      when new.status = 'completed' then 'completion'
      else 'creation'
    end;
  end if;

  return new;
end;
$$;

revoke all on function public.capture_attendance_session_coach_snapshot() from public;
revoke all on function public.capture_attendance_session_coach_snapshot() from anon;
revoke all on function public.capture_attendance_session_coach_snapshot() from authenticated;

drop trigger if exists trg_attendance_sessions_coach_snapshot on public.attendance_sessions;
create trigger trg_attendance_sessions_coach_snapshot
before insert or update of training_group_id, status
on public.attendance_sessions
for each row
execute function public.capture_attendance_session_coach_snapshot();

-- Historical sessions did not capture coach assignments. Preserve that truth in
-- the source marker: these rows use the current group assignment as a best-effort
-- legacy baseline and must not be presented as exact historical attribution.
update public.attendance_sessions sessions
set
  coach_snapshot = public.current_training_group_coach_snapshot(sessions.training_group_id),
  coach_snapshot_captured_at = now(),
  coach_snapshot_source = 'legacy_backfill_current_assignment'
where sessions.training_group_id is not null
  and sessions.coach_snapshot_source is null;

create or replace function public.get_training_workload_30d(
  p_campus_id uuid,
  p_as_of timestamptz default now()
)
returns table (
  campus_id uuid,
  campus_name text,
  training_group_id uuid,
  training_group_name text,
  birth_year_min integer,
  birth_year_max integer,
  session_id uuid,
  session_date date,
  start_time time,
  end_time time,
  session_status text,
  coach_snapshot jsonb,
  coach_snapshot_source text,
  official_attended_count bigint,
  tryout_count bigint,
  total_served_count bigint,
  completed_session_count bigint,
  unregistered_session_count bigint,
  official_attendance_average numeric,
  tryout_average numeric,
  total_served_average numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with params as (
    select
      (p_as_of at time zone 'America/Monterrey')::date as local_date,
      (p_as_of at time zone 'America/Monterrey')::time as local_time
  ),
  eligible_sessions as (
    select
      sessions.id,
      sessions.campus_id,
      campuses.name as campus_name,
      sessions.training_group_id,
      groups.name as training_group_name,
      groups.birth_year_min,
      groups.birth_year_max,
      sessions.session_date,
      sessions.start_time,
      sessions.end_time,
      sessions.status,
      sessions.coach_snapshot,
      sessions.coach_snapshot_source
    from public.attendance_sessions sessions
    join public.training_groups groups on groups.id = sessions.training_group_id
    join public.campuses campuses on campuses.id = sessions.campus_id
    cross join params
    where sessions.campus_id = p_campus_id
      and sessions.training_group_id is not null
      and sessions.session_type = 'training'
      and sessions.status <> 'cancelled'
      and sessions.session_date between (params.local_date - 29) and params.local_date
      and (
        sessions.session_date < params.local_date
        or sessions.start_time <= params.local_time
      )
  ),
  official_counts as (
    select
      records.session_id,
      count(*) filter (where records.status = 'present')::bigint as official_attended_count
    from public.attendance_records records
    join eligible_sessions sessions on sessions.id = records.session_id
    group by records.session_id
  ),
  tryout_counts as (
    select
      visits.attendance_session_id as session_id,
      count(*)::bigint as tryout_count
    from public.trial_visits visits
    join eligible_sessions sessions on sessions.id = visits.attendance_session_id
    group by visits.attendance_session_id
  ),
  session_counts as (
    select
      sessions.*,
      case
        when sessions.status = 'completed' then coalesce(official.official_attended_count, 0)
        else 0
      end::bigint as official_attended_count,
      coalesce(tryouts.tryout_count, 0)::bigint as tryout_count
    from eligible_sessions sessions
    left join official_counts official on official.session_id = sessions.id
    left join tryout_counts tryouts on tryouts.session_id = sessions.id
  )
  select
    counts.campus_id,
    counts.campus_name,
    counts.training_group_id,
    counts.training_group_name,
    counts.birth_year_min,
    counts.birth_year_max,
    counts.id as session_id,
    counts.session_date,
    counts.start_time,
    counts.end_time,
    counts.status as session_status,
    counts.coach_snapshot,
    counts.coach_snapshot_source,
    counts.official_attended_count,
    counts.tryout_count,
    (counts.official_attended_count + counts.tryout_count)::bigint as total_served_count,
    count(*) filter (where counts.status = 'completed')
      over (partition by counts.training_group_id)::bigint as completed_session_count,
    count(*) filter (where counts.status <> 'completed')
      over (partition by counts.training_group_id)::bigint as unregistered_session_count,
    round(
      avg(counts.official_attended_count) filter (where counts.status = 'completed')
        over (partition by counts.training_group_id),
      1
    ) as official_attendance_average,
    round(
      avg(counts.tryout_count) filter (where counts.status = 'completed')
        over (partition by counts.training_group_id),
      1
    ) as tryout_average,
    round(
      avg(counts.official_attended_count + counts.tryout_count) filter (where counts.status = 'completed')
        over (partition by counts.training_group_id),
      1
    ) as total_served_average
  from session_counts counts
  order by counts.start_time, counts.training_group_name, counts.session_date, counts.id;
$$;

revoke all on function public.get_training_workload_30d(uuid, timestamptz) from public;
revoke all on function public.get_training_workload_30d(uuid, timestamptz) from anon;
grant execute on function public.get_training_workload_30d(uuid, timestamptz) to authenticated;
grant execute on function public.get_training_workload_30d(uuid, timestamptz) to service_role;

comment on function public.get_training_workload_30d(uuid, timestamptz) is
  'Read-only rolling 30 Monterrey-day training workload rows. Official, tryout, and combined averages use completed sessions only; past unregistered sessions remain visible separately.';
