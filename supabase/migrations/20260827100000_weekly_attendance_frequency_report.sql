-- Read-only weekly attendance-frequency report.
-- Uses completed training-session records as the historical evaluated roster,
-- preserving group and professor snapshots without touching attendance data.

create or replace function public.get_weekly_attendance_frequency_v1(
  p_campus_id uuid,
  p_week_count integer default 8,
  p_as_of timestamptz default now()
)
returns table (
  campus_id uuid,
  campus_name text,
  training_group_id uuid,
  training_group_name text,
  birth_year_min integer,
  birth_year_max integer,
  week_start date,
  week_end date,
  coach_ids text[],
  coach_names text,
  sessions_offered bigint,
  player_weeks bigint,
  bucket_0 bigint,
  bucket_1 bigint,
  bucket_2 bigint,
  bucket_3 bigint,
  bucket_4_plus bigint,
  attended_session_records bigint,
  opportunity_records bigint,
  average_sessions_attended numeric,
  attendance_rate numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with params as (
    select
      greatest(1, least(coalesce(p_week_count, 8), 12)) as week_count,
      (p_as_of at time zone 'America/Monterrey')::date as local_date
  ),
  bounds as (
    select
      (local_date - (extract(isodow from local_date)::integer - 1))::date as current_week_start,
      week_count
    from params
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
      date_trunc('week', sessions.session_date::timestamp)::date as week_start,
      sessions.coach_snapshot
    from public.attendance_sessions sessions
    join public.training_groups groups on groups.id = sessions.training_group_id
    join public.campuses campuses on campuses.id = sessions.campus_id
    cross join bounds
    where sessions.campus_id = p_campus_id
      and sessions.training_group_id is not null
      and sessions.session_type = 'training'
      and sessions.status = 'completed'
      and sessions.session_date >= bounds.current_week_start - (bounds.week_count * 7)
      and sessions.session_date < bounds.current_week_start
  ),
  group_weeks as (
    select
      sessions.campus_id,
      sessions.campus_name,
      sessions.training_group_id,
      sessions.training_group_name,
      sessions.birth_year_min,
      sessions.birth_year_max,
      sessions.week_start,
      count(distinct sessions.id)::bigint as sessions_offered
    from eligible_sessions sessions
    group by
      sessions.campus_id,
      sessions.campus_name,
      sessions.training_group_id,
      sessions.training_group_name,
      sessions.birth_year_min,
      sessions.birth_year_max,
      sessions.week_start
  ),
  session_coaches as (
    select distinct
      sessions.training_group_id,
      sessions.week_start,
      nullif(coach.value ->> 'coach_id', '') as coach_id,
      nullif(trim(coach.value ->> 'name'), '') as coach_name
    from eligible_sessions sessions
    cross join lateral jsonb_array_elements(coalesce(sessions.coach_snapshot, '[]'::jsonb)) coach(value)
  ),
  coach_rollup as (
    select
      coaches.training_group_id,
      coaches.week_start,
      array_agg(coaches.coach_id order by coaches.coach_name, coaches.coach_id)
        filter (where coaches.coach_id is not null) as coach_ids,
      string_agg(coaches.coach_name, ', ' order by coaches.coach_name)
        filter (where coaches.coach_name is not null) as coach_names
    from session_coaches coaches
    group by coaches.training_group_id, coaches.week_start
  ),
  player_week_counts as (
    select
      sessions.training_group_id,
      sessions.week_start,
      records.player_id,
      count(distinct records.session_id) filter (where records.status = 'present')::integer as attended_count,
      count(distinct records.session_id)::integer as opportunity_count
    from eligible_sessions sessions
    join public.attendance_records records on records.session_id = sessions.id
    where records.player_id is not null
    group by sessions.training_group_id, sessions.week_start, records.player_id
  ),
  distributions as (
    select
      counts.training_group_id,
      counts.week_start,
      count(*)::bigint as player_weeks,
      count(*) filter (where counts.attended_count = 0)::bigint as bucket_0,
      count(*) filter (where counts.attended_count = 1)::bigint as bucket_1,
      count(*) filter (where counts.attended_count = 2)::bigint as bucket_2,
      count(*) filter (where counts.attended_count = 3)::bigint as bucket_3,
      count(*) filter (where counts.attended_count >= 4)::bigint as bucket_4_plus,
      sum(counts.attended_count)::bigint as attended_session_records,
      sum(counts.opportunity_count)::bigint as opportunity_records
    from player_week_counts counts
    group by counts.training_group_id, counts.week_start
  )
  select
    weeks.campus_id,
    weeks.campus_name,
    weeks.training_group_id,
    weeks.training_group_name,
    weeks.birth_year_min,
    weeks.birth_year_max,
    weeks.week_start,
    (weeks.week_start + 6)::date as week_end,
    coalesce(coaches.coach_ids, array[]::text[]) as coach_ids,
    coalesce(coaches.coach_names, 'Sin profesor') as coach_names,
    weeks.sessions_offered,
    coalesce(distributions.player_weeks, 0)::bigint,
    coalesce(distributions.bucket_0, 0)::bigint,
    coalesce(distributions.bucket_1, 0)::bigint,
    coalesce(distributions.bucket_2, 0)::bigint,
    coalesce(distributions.bucket_3, 0)::bigint,
    coalesce(distributions.bucket_4_plus, 0)::bigint,
    coalesce(distributions.attended_session_records, 0)::bigint,
    coalesce(distributions.opportunity_records, 0)::bigint,
    round(
      coalesce(distributions.attended_session_records, 0)::numeric
        / nullif(distributions.player_weeks, 0),
      2
    ) as average_sessions_attended,
    round(
      100 * coalesce(distributions.attended_session_records, 0)::numeric
        / nullif(distributions.opportunity_records, 0),
      1
    ) as attendance_rate
  from group_weeks weeks
  left join coach_rollup coaches
    on coaches.training_group_id = weeks.training_group_id
   and coaches.week_start = weeks.week_start
  left join distributions
    on distributions.training_group_id = weeks.training_group_id
   and distributions.week_start = weeks.week_start
  order by weeks.week_start, weeks.campus_name, weeks.training_group_name, weeks.training_group_id;
$$;

revoke all on function public.get_weekly_attendance_frequency_v1(uuid, integer, timestamptz) from public;
revoke all on function public.get_weekly_attendance_frequency_v1(uuid, integer, timestamptz) from anon;
grant execute on function public.get_weekly_attendance_frequency_v1(uuid, integer, timestamptz) to authenticated;
grant execute on function public.get_weekly_attendance_frequency_v1(uuid, integer, timestamptz) to service_role;

comment on function public.get_weekly_attendance_frequency_v1(uuid, integer, timestamptz) is
  'Read-only distribution of physical attendance frequency across complete Monterrey Monday-Sunday weeks. Uses completed training sessions and recorded players; excludes tryouts and cancelled/unregistered sessions.';
