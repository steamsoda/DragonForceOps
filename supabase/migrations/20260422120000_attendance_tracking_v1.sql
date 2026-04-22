-- Attendance tracking v1.
-- Additive only: creates attendance-specific role, tables, RLS helpers, and
-- weekly pg_cron generation without rewriting existing operational data.

insert into public.app_roles (code, name)
values ('attendance_admin', 'Admin de Campo')
on conflict (code) do update
set name = excluded.name;

create or replace function public.is_attendance_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.app_roles ar on ar.id = ur.role_id
    where ur.user_id = auth.uid()
      and ar.code = 'attendance_admin'
      and ur.campus_id is not null
  );
$$;

grant execute on function public.is_attendance_admin() to authenticated, anon;

create or replace function public.current_user_attendance_write_campuses()
returns table (campus_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  with role_rows as (
    select ur.campus_id, ar.code
    from public.user_roles ur
    join public.app_roles ar on ar.id = ur.role_id
    where ur.user_id = auth.uid()
  ),
  all_active as (
    select c.id as campus_id
    from public.campuses c
    where c.is_active = true
  )
  select campus_id
  from all_active
  where public.is_director_admin()

  union

  select campus_id
  from all_active
  where exists (
    select 1
    from role_rows rr
    where rr.code = 'director_deportivo'
      and rr.campus_id is null
  )

  union

  select distinct rr.campus_id
  from role_rows rr
  where rr.code in ('director_deportivo', 'attendance_admin')
    and rr.campus_id is not null;
$$;

grant execute on function public.current_user_attendance_write_campuses() to authenticated, anon;

create or replace function public.current_user_attendance_read_campuses()
returns table (campus_id uuid)
language sql
security definer
stable
set search_path = public
as $$
  select campus_id
  from public.current_user_attendance_write_campuses()

  union

  select campus_id
  from public.current_user_allowed_campuses()
  where public.is_front_desk();
$$;

grant execute on function public.current_user_attendance_read_campuses() to authenticated, anon;

create or replace function public.can_read_attendance_campus(p_campus_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.current_user_attendance_read_campuses() allowed
    where allowed.campus_id = p_campus_id
  );
$$;

grant execute on function public.can_read_attendance_campus(uuid) to authenticated, anon;

create or replace function public.can_write_attendance_campus(p_campus_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.current_user_attendance_write_campuses() allowed
    where allowed.campus_id = p_campus_id
  );
$$;

grant execute on function public.can_write_attendance_campus(uuid) to authenticated, anon;

create table if not exists public.attendance_schedule_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete restrict,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  day_of_week int not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  effective_start date not null default current_date,
  effective_end date null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  check (effective_end is null or effective_end >= effective_start)
);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  schedule_template_id uuid null references public.attendance_schedule_templates(id) on delete set null,
  session_type text not null check (session_type in ('training', 'match', 'special')),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  session_date date not null,
  start_time time not null,
  end_time time not null,
  opponent_name text null,
  notes text null,
  cancelled_reason_code text null check (cancelled_reason_code is null or cancelled_reason_code in ('rain', 'holiday', 'other')),
  cancelled_reason text null,
  completed_by uuid null references auth.users(id) on delete restrict,
  completed_at timestamptz null,
  created_by uuid null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create unique index if not exists uq_attendance_sessions_idempotent
  on public.attendance_sessions(team_id, session_date, start_time, session_type);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  team_assignment_id uuid not null references public.team_assignments(id) on delete restrict,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete restrict,
  status text not null check (status in ('present', 'absent', 'injury', 'justified')),
  source text not null default 'default' check (source in ('default', 'incident', 'manual', 'correction')),
  incident_id uuid null references public.enrollment_incidents(id) on delete set null,
  note text null,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_attendance_records_session_enrollment
  on public.attendance_records(session_id, enrollment_id);

create table if not exists public.attendance_record_audit (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null references public.attendance_records(id) on delete cascade,
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  before_status text null,
  after_status text null,
  before_source text null,
  after_source text null,
  before_note text null,
  after_note text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_attendance_templates_campus_day
  on public.attendance_schedule_templates(campus_id, day_of_week, start_time)
  where is_active = true;

create index if not exists idx_attendance_sessions_campus_date
  on public.attendance_sessions(campus_id, session_date, start_time);

create index if not exists idx_attendance_sessions_team_date
  on public.attendance_sessions(team_id, session_date desc);

create index if not exists idx_attendance_records_player_recorded
  on public.attendance_records(player_id, recorded_at desc);

create index if not exists idx_attendance_records_session
  on public.attendance_records(session_id);

create or replace function public.validate_attendance_schedule_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team record;
begin
  select id, campus_id, type, is_active
  into v_team
  from public.teams
  where id = new.team_id;

  if v_team.id is null then
    raise exception 'attendance schedule team not found';
  end if;

  if v_team.campus_id <> new.campus_id then
    raise exception 'attendance schedule campus mismatch';
  end if;

  if v_team.type <> 'class' or v_team.is_active is not true then
    raise exception 'attendance training schedules require active class teams';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_attendance_schedule_template on public.attendance_schedule_templates;
create trigger trg_validate_attendance_schedule_template
before insert or update on public.attendance_schedule_templates
for each row execute function public.validate_attendance_schedule_template();

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
    t.team_id,
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
   and t.effective_start <= d::date
   and (t.effective_end is null or t.effective_end >= d::date)
   and t.day_of_week = extract(isodow from d)::int
  join public.teams team on team.id = t.team_id and team.is_active = true and team.type = 'class'
  on conflict (team_id, session_date, start_time, session_type) do nothing;

  get diagnostics v_inserted = row_count;

  return jsonb_build_object(
    'created', v_inserted,
    'start_date', p_start_date::text,
    'end_date', p_end_date::text
  );
end;
$$;

revoke execute on function public.generate_attendance_sessions(date, date) from public;

do $$
begin
  perform cron.unschedule('generate-attendance-sessions');
exception
  when others then null;
end $$;

select cron.schedule(
  'generate-attendance-sessions',
  '0 6 * * 0',
  $cron$
    select public.generate_attendance_sessions(
      (date_trunc('week', current_date + interval '1 week'))::date,
      ((date_trunc('week', current_date + interval '1 week'))::date + 6)
    )
  $cron$
);

alter table public.attendance_schedule_templates enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_record_audit enable row level security;

drop policy if exists attendance_templates_select on public.attendance_schedule_templates;
create policy attendance_templates_select on public.attendance_schedule_templates
  for select to authenticated
  using (public.can_read_attendance_campus(campus_id));

drop policy if exists attendance_templates_manage on public.attendance_schedule_templates;
create policy attendance_templates_manage on public.attendance_schedule_templates
  for all to authenticated
  using (public.is_director_admin() or (public.can_write_attendance_campus(campus_id) and not public.is_attendance_admin()))
  with check (public.is_director_admin() or (public.can_write_attendance_campus(campus_id) and not public.is_attendance_admin()));

drop policy if exists attendance_sessions_select on public.attendance_sessions;
create policy attendance_sessions_select on public.attendance_sessions
  for select to authenticated
  using (public.can_read_attendance_campus(campus_id));

drop policy if exists attendance_sessions_manage on public.attendance_sessions;
create policy attendance_sessions_manage on public.attendance_sessions
  for all to authenticated
  using (public.can_write_attendance_campus(campus_id))
  with check (public.can_write_attendance_campus(campus_id));

drop policy if exists attendance_records_select on public.attendance_records;
create policy attendance_records_select on public.attendance_records
  for select to authenticated
  using (
    exists (
      select 1
      from public.attendance_sessions s
      where s.id = attendance_records.session_id
        and public.can_read_attendance_campus(s.campus_id)
    )
  );

drop policy if exists attendance_records_manage on public.attendance_records;
create policy attendance_records_manage on public.attendance_records
  for all to authenticated
  using (
    exists (
      select 1
      from public.attendance_sessions s
      where s.id = attendance_records.session_id
        and public.can_write_attendance_campus(s.campus_id)
    )
  )
  with check (
    exists (
      select 1
      from public.attendance_sessions s
      where s.id = attendance_records.session_id
        and public.can_write_attendance_campus(s.campus_id)
    )
  );

drop policy if exists attendance_record_audit_select_director on public.attendance_record_audit;
create policy attendance_record_audit_select_director on public.attendance_record_audit
  for select to authenticated
  using (public.is_director_admin());

drop policy if exists attendance_record_audit_insert_director on public.attendance_record_audit;
create policy attendance_record_audit_insert_director on public.attendance_record_audit
  for insert to authenticated
  with check (public.is_director_admin());

drop policy if exists attendance_admin_read_app_roles on public.app_roles;
create policy attendance_admin_read_app_roles on public.app_roles
  for select to authenticated
  using (public.is_attendance_admin());

drop policy if exists attendance_admin_read_own_user_roles on public.user_roles;
create policy attendance_admin_read_own_user_roles on public.user_roles
  for select to authenticated
  using (public.is_attendance_admin() and user_id = auth.uid());

comment on table public.attendance_schedule_templates is
  'Weekly recurring training schedule templates. Only active class teams are valid for generated training sessions.';

comment on table public.attendance_sessions is
  'Concrete dated attendance sessions for training, matches, and special sessions.';

comment on table public.attendance_records is
  'One attendance status per player/enrollment per session.';
