-- Batch recent attendance lookup for player-heavy operational screens.
-- Keeps last-N attendance chips out of N+1 query paths.

create or replace function public.get_recent_player_attendance(
  p_player_ids uuid[],
  p_limit integer default 5
)
returns table (
  player_id uuid,
  session_id uuid,
  session_date date,
  session_type text,
  status text
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
  ranked_records as (
    select
      records.player_id,
      records.session_id,
      sessions.session_date,
      sessions.session_type,
      records.status,
      row_number() over (
        partition by records.player_id
        order by sessions.session_date desc, sessions.start_time desc, records.recorded_at desc
      ) as row_number
    from public.attendance_records records
    join requested_players requested on requested.player_id = records.player_id
    join public.attendance_sessions sessions on sessions.id = records.session_id
    where sessions.status <> 'cancelled'
  )
  select
    ranked_records.player_id,
    ranked_records.session_id,
    ranked_records.session_date,
    ranked_records.session_type,
    ranked_records.status
  from ranked_records
  where ranked_records.row_number <= greatest(1, least(coalesce(p_limit, 5), 10))
  order by ranked_records.player_id, ranked_records.session_date desc;
$$;

revoke execute on function public.get_recent_player_attendance(uuid[], integer) from public, anon;
grant execute on function public.get_recent_player_attendance(uuid[], integer) to authenticated;
