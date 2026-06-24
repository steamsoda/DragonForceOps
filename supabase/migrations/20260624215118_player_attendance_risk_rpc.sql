-- Batch derived attendance-risk lookup for player-heavy operational screens.
-- Missing records are not counted; only completed sessions with explicit records are considered.

create or replace function public.get_player_attendance_risk(
  p_player_ids uuid[],
  p_today date default current_date
)
returns table (
  player_id uuid,
  enrollment_id uuid,
  absence_streak integer,
  days_since_last_attendance integer,
  last_absent_date date,
  last_attendance_date date,
  recent_statuses text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with requested_players as (
    select distinct player_id
    from unnest(coalesce(p_player_ids, array[]::uuid[])) as player_id
    where player_id is not null
  ),
  active_enrollments as (
    select distinct on (e.player_id)
      e.player_id,
      e.id as enrollment_id
    from public.enrollments e
    join requested_players requested on requested.player_id = e.player_id
    where e.status = 'active'
    order by e.player_id, e.start_date desc nulls last, e.created_at desc
  ),
  ranked_records as (
    select
      records.player_id,
      records.enrollment_id,
      sessions.session_date,
      sessions.start_time,
      records.status,
      row_number() over (
        partition by records.player_id
        order by sessions.session_date desc, sessions.start_time desc, records.recorded_at desc
      ) as row_number
    from public.attendance_records records
    join requested_players requested on requested.player_id = records.player_id
    join public.attendance_sessions sessions on sessions.id = records.session_id
    where sessions.status = 'completed'
  ),
  record_bounds as (
    select
      ranked_records.player_id,
      min(ranked_records.row_number) filter (where ranked_records.status <> 'absent') as first_non_absent_row_number,
      max(ranked_records.session_date) filter (where ranked_records.status = 'absent') as last_absent_date,
      max(ranked_records.session_date) filter (where ranked_records.status in ('present', 'injury', 'justified')) as last_attendance_date
    from ranked_records
    group by ranked_records.player_id
  ),
  streaks as (
    select
      ranked_records.player_id,
      count(*) filter (
        where ranked_records.status = 'absent'
          and (
            record_bounds.first_non_absent_row_number is null
            or ranked_records.row_number < record_bounds.first_non_absent_row_number
          )
      )::integer as absence_streak
    from ranked_records
    join record_bounds on record_bounds.player_id = ranked_records.player_id
    group by ranked_records.player_id
  ),
  recent_statuses as (
    select
      ranked_records.player_id,
      array_agg(ranked_records.status order by ranked_records.row_number) filter (where ranked_records.row_number <= 5) as recent_statuses
    from ranked_records
    group by ranked_records.player_id
  ),
  latest_record_enrollments as (
    select distinct on (ranked_records.player_id)
      ranked_records.player_id,
      ranked_records.enrollment_id
    from ranked_records
    order by ranked_records.player_id, ranked_records.row_number
  )
  select
    requested.player_id,
    coalesce(active_enrollments.enrollment_id, latest_record_enrollments.enrollment_id) as enrollment_id,
    coalesce(streaks.absence_streak, 0) as absence_streak,
    case
      when record_bounds.last_attendance_date is null then null
      else greatest((coalesce(p_today, current_date) - record_bounds.last_attendance_date)::integer, 0)
    end as days_since_last_attendance,
    record_bounds.last_absent_date,
    record_bounds.last_attendance_date,
    coalesce(recent_statuses.recent_statuses, array[]::text[]) as recent_statuses
  from requested_players requested
  left join active_enrollments on active_enrollments.player_id = requested.player_id
  left join latest_record_enrollments on latest_record_enrollments.player_id = requested.player_id
  left join record_bounds on record_bounds.player_id = requested.player_id
  left join streaks on streaks.player_id = requested.player_id
  left join recent_statuses on recent_statuses.player_id = requested.player_id
  order by requested.player_id;
$$;

revoke execute on function public.get_player_attendance_risk(uuid[], date) from public, anon;
grant execute on function public.get_player_attendance_risk(uuid[], date) to authenticated;
