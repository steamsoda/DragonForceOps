-- Add the historical official-roster denominator used by the rolling
-- attendance-rate report. This remains read-only and finance-free.

drop function if exists public.get_training_workload_30d(uuid, timestamptz);

create function public.get_training_workload_30d(
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
  official_roster_count bigint,
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
      count(*) filter (where records.status = 'present')::bigint as official_attended_count,
      count(*)::bigint as official_roster_count
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
      case
        when sessions.status = 'completed' then coalesce(official.official_roster_count, 0)
        else 0
      end::bigint as official_roster_count,
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
    counts.official_roster_count,
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
revoke all on function public.get_training_workload_30d(uuid, timestamptz) from authenticated;
grant execute on function public.get_training_workload_30d(uuid, timestamptz) to service_role;

comment on function public.get_training_workload_30d(uuid, timestamptz) is
  'Read-only rolling 30 Monterrey-day training workload rows. Official roster counts come from the complete saved attendance record set for each completed session.';
