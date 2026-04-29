-- Attendance operational closures.
-- Adds planned rain/holiday/vacation/event closures and makes session
-- generation create affected sessions as cancelled instead of omitting them.

create table if not exists public.attendance_closures (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid null references public.campuses(id) on delete restrict,
  starts_on date not null,
  ends_on date not null,
  reason_code text not null check (reason_code in ('rain', 'holiday', 'vacation', 'event', 'other')),
  title text not null,
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index if not exists idx_attendance_closures_campus_dates
  on public.attendance_closures(campus_id, starts_on, ends_on);

create index if not exists idx_attendance_closures_dates
  on public.attendance_closures(starts_on, ends_on);

alter table public.attendance_closures enable row level security;

drop policy if exists attendance_closures_select on public.attendance_closures;
create policy attendance_closures_select on public.attendance_closures
  for select to authenticated
  using (
    campus_id is null
    or public.can_read_attendance_campus(campus_id)
  );

drop policy if exists attendance_closures_manage on public.attendance_closures;
create policy attendance_closures_manage on public.attendance_closures
  for all to authenticated
  using (
    public.is_director_admin()
    or (
      campus_id is not null
      and public.can_access_sports_campus(campus_id)
    )
  )
  with check (
    public.is_director_admin()
    or (
      campus_id is not null
      and public.can_access_sports_campus(campus_id)
    )
  );

create or replace function public.attendance_session_cancel_code_from_closure(p_reason_code text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_reason_code
    when 'rain' then 'rain'
    when 'holiday' then 'holiday'
    when 'vacation' then 'holiday'
    else 'other'
  end;
$$;

create or replace function public.generate_attendance_sessions(
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
begin
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    return jsonb_build_object('error', 'invalid_range', 'created', 0);
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
    cancelled_reason_code,
    cancelled_reason,
    created_by
  )
  select
    t.campus_id,
    null,
    t.training_group_id,
    t.id,
    'training',
    case when closure.id is null then 'scheduled' else 'cancelled' end,
    d::date,
    t.start_time,
    t.end_time,
    case
      when closure.id is null then null
      else public.attendance_session_cancel_code_from_closure(closure.reason_code)
    end,
    case
      when closure.id is null then null
      else concat_ws(' - ', closure.title, nullif(closure.notes, ''))
    end,
    null
  from generate_series(p_start_date, p_end_date, interval '1 day') d
  join public.attendance_schedule_templates t
    on t.is_active = true
   and t.training_group_id is not null
   and t.effective_start <= d::date
   and (t.effective_end is null or t.effective_end >= d::date)
   and t.day_of_week = extract(isodow from d)::int
  join public.training_groups g
    on g.id = t.training_group_id
   and g.status = 'active'
  left join lateral (
    select c.id, c.reason_code, c.title, c.notes, c.campus_id
    from public.attendance_closures c
    where (c.campus_id is null or c.campus_id = t.campus_id)
      and c.starts_on <= d::date
      and c.ends_on >= d::date
    order by (c.campus_id is null), c.created_at desc
    limit 1
  ) closure on true
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
    'start_date', p_start_date::text,
    'end_date', p_end_date::text
  );
end;
$$;

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
    cancelled_reason_code,
    cancelled_reason,
    created_by
  )
  select
    t.campus_id,
    null,
    t.training_group_id,
    t.id,
    'training',
    case when closure.id is null then 'scheduled' else 'cancelled' end,
    d::date,
    t.start_time,
    t.end_time,
    case
      when closure.id is null then null
      else public.attendance_session_cancel_code_from_closure(closure.reason_code)
    end,
    case
      when closure.id is null then null
      else concat_ws(' - ', closure.title, nullif(closure.notes, ''))
    end,
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
  left join lateral (
    select c.id, c.reason_code, c.title, c.notes, c.campus_id
    from public.attendance_closures c
    where (c.campus_id is null or c.campus_id = t.campus_id)
      and c.starts_on <= d::date
      and c.ends_on >= d::date
    order by (c.campus_id is null), c.created_at desc
    limit 1
  ) closure on true
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

revoke execute on function public.generate_attendance_sessions(date, date) from public;
revoke execute on function public.generate_attendance_sessions_for_campus(date, date, uuid) from public;
grant execute on function public.generate_attendance_sessions(date, date) to service_role;
grant execute on function public.generate_attendance_sessions_for_campus(date, date, uuid) to service_role;

comment on table public.attendance_closures is
  'Planned attendance closures such as rain days, holidays, vacation periods, and special events. Future generated sessions in a closure are created as cancelled for operational visibility.';

comment on function public.generate_attendance_sessions(date, date) is
  'Idempotently generates training attendance sessions from active training-group schedule templates. Sessions inside planned closures are created as cancelled.';

comment on function public.generate_attendance_sessions_for_campus(date, date, uuid) is
  'Idempotently generates training attendance sessions for one campus/date range. Sessions inside planned closures are created as cancelled.';
