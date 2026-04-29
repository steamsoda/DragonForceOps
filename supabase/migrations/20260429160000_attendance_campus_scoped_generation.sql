-- Attendance campus-scoped session generation.
-- Keeps the existing global pg_cron function unchanged, while giving the app
-- a safer per-campus generation path for directors / sports directors.

create or replace function public.generate_attendance_sessions_for_campus(
  p_start_date date,
  p_end_date date,
  p_campus_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date or p_campus_id is null then
    return jsonb_build_object('error', 'invalid_range_or_campus', 'created', 0);
  end if;

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
    created_by
  )
  select
    t.campus_id,
    null,
    t.training_group_id,
    t.id,
    'training',
    'scheduled',
    d::date,
    t.start_time,
    t.end_time,
    null
  from generate_series(p_start_date, p_end_date, interval '1 day') d
  join public.attendance_schedule_templates t
    on t.is_active = true
   and t.campus_id = p_campus_id
   and t.training_group_id is not null
   and t.effective_start <= d::date
   and (t.effective_end is null or t.effective_end >= d::date)
   and t.day_of_week = extract(isodow from d)::int
  join public.training_groups g
    on g.id = t.training_group_id
   and g.status = 'active'
   and g.campus_id = p_campus_id
  where not exists (
    select 1
    from public.attendance_sessions s
    where s.training_group_id = t.training_group_id
      and s.session_date = d::date
      and s.start_time = t.start_time
      and s.session_type = 'training'
  );

  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'created', v_inserted,
    'campus_id', p_campus_id::text,
    'start_date', p_start_date::text,
    'end_date', p_end_date::text
  );
end;
$$;

revoke execute on function public.generate_attendance_sessions_for_campus(date, date, uuid) from public;
grant execute on function public.generate_attendance_sessions_for_campus(date, date, uuid) to service_role;

-- The app also has a superadmin/director fallback that may still call the
-- original global generator in older deployments; make service-role execution
-- explicit without changing anon/authenticated exposure.
grant execute on function public.generate_attendance_sessions(date, date) to service_role;

comment on function public.generate_attendance_sessions_for_campus(date, date, uuid) is
  'Idempotently generates scheduled training attendance sessions for one campus/date range from active training-group schedule templates.';
