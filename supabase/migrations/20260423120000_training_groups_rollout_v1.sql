-- Training groups rollout v1.
-- Adds first-class training groups, guided assignment support, and migrates
-- attendance toward training-group-based practice rosters while preserving
-- the existing competition/team workflow.

create table if not exists public.training_groups (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete restrict,
  name text not null,
  program text not null check (program in ('little_dragons', 'futbol_para_todos', 'selectivo')),
  level_label text null,
  group_code text null,
  gender text not null default 'mixed' check (gender in ('male', 'female', 'mixed')),
  birth_year_min int null,
  birth_year_max int null,
  start_time time null,
  end_time time null,
  status text not null default 'active' check (status in ('active', 'projected', 'inactive')),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  ),
  check (birth_year_min is null or birth_year_max is null or birth_year_max >= birth_year_min)
);

create index if not exists idx_training_groups_campus_status
  on public.training_groups(campus_id, status, program, start_time);

create index if not exists idx_training_groups_years
  on public.training_groups(campus_id, birth_year_min, birth_year_max);

create table if not exists public.training_group_coaches (
  id uuid primary key default gen_random_uuid(),
  training_group_id uuid not null references public.training_groups(id) on delete cascade,
  coach_id uuid not null references public.coaches(id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (training_group_id, coach_id)
);

create index if not exists idx_training_group_coaches_group
  on public.training_group_coaches(training_group_id);

create table if not exists public.training_group_assignments (
  id uuid primary key default gen_random_uuid(),
  training_group_id uuid not null references public.training_groups(id) on delete restrict,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  start_date date not null,
  end_date date null,
  assigned_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  unique (enrollment_id, training_group_id, start_date)
);

create unique index if not exists uq_training_group_assignments_active_enrollment
  on public.training_group_assignments(enrollment_id)
  where end_date is null;

create index if not exists idx_training_group_assignments_group_active
  on public.training_group_assignments(training_group_id, start_date desc)
  where end_date is null;

create index if not exists idx_training_group_assignments_player_active
  on public.training_group_assignments(player_id, start_date desc)
  where end_date is null;

alter table public.training_groups enable row level security;
alter table public.training_group_coaches enable row level security;
alter table public.training_group_assignments enable row level security;

drop policy if exists training_groups_select on public.training_groups;
create policy training_groups_select on public.training_groups
  for select to authenticated
  using (public.can_read_attendance_campus(campus_id));

drop policy if exists training_groups_manage on public.training_groups;
create policy training_groups_manage on public.training_groups
  for all to authenticated
  using (public.is_director_admin() or public.can_access_sports_campus(campus_id))
  with check (public.is_director_admin() or public.can_access_sports_campus(campus_id));

drop policy if exists training_group_coaches_select on public.training_group_coaches;
create policy training_group_coaches_select on public.training_group_coaches
  for select to authenticated
  using (
    exists (
      select 1
      from public.training_groups g
      where g.id = training_group_id
        and public.can_read_attendance_campus(g.campus_id)
    )
  );

drop policy if exists training_group_coaches_manage on public.training_group_coaches;
create policy training_group_coaches_manage on public.training_group_coaches
  for all to authenticated
  using (
    exists (
      select 1
      from public.training_groups g
      where g.id = training_group_id
        and (public.is_director_admin() or public.can_access_sports_campus(g.campus_id))
    )
  )
  with check (
    exists (
      select 1
      from public.training_groups g
      where g.id = training_group_id
        and (public.is_director_admin() or public.can_access_sports_campus(g.campus_id))
    )
  );

drop policy if exists training_group_assignments_select on public.training_group_assignments;
create policy training_group_assignments_select on public.training_group_assignments
  for select to authenticated
  using (
    exists (
      select 1
      from public.training_groups g
      where g.id = training_group_id
        and public.can_read_attendance_campus(g.campus_id)
    )
  );

drop policy if exists training_group_assignments_manage on public.training_group_assignments;
create policy training_group_assignments_manage on public.training_group_assignments
  for all to authenticated
  using (
    exists (
      select 1
      from public.training_groups g
      where g.id = training_group_id
        and (public.is_director_admin() or public.can_access_sports_campus(g.campus_id))
    )
  )
  with check (
    exists (
      select 1
      from public.training_groups g
      where g.id = training_group_id
        and (public.is_director_admin() or public.can_access_sports_campus(g.campus_id))
    )
  );

-- Ensure all coach names referenced by the confirmed training-groups guide exist.
with coach_rows as (
  select *
  from (
    values
      ('Linda Vista', 'Alex'),
      ('Linda Vista', 'Felipe'),
      ('Linda Vista', 'Johan'),
      ('Linda Vista', 'Osmar'),
      ('Linda Vista', 'Merino'),
      ('Linda Vista', 'David'),
      ('Linda Vista', 'Nelson'),
      ('Linda Vista', 'Arturo'),
      ('Linda Vista', 'Villalba'),
      ('Contry', 'Ailin'),
      ('Contry', 'Angel'),
      ('Contry', 'Sebastian'),
      ('Contry', 'Daniel'),
      ('Contry', 'Joel')
  ) as rows(campus_name, coach_name)
)
insert into public.coaches (first_name, campus_id, is_active)
select coach_rows.coach_name, campuses.id, true
from coach_rows
join public.campuses on campuses.name = coach_rows.campus_name
where not exists (
  select 1
  from public.coaches c
  where c.campus_id = campuses.id
    and lower(translate(c.first_name, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = lower(translate(coach_rows.coach_name, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))
);

with group_rows as (
  select *
  from (
    values
      ('Linda Vista', 'Little Dragons', 'little_dragons', 'Little Dragons', null, 'mixed', 2020, 2023, '15:00'::time, '16:00'::time, 'active', null),
      ('Linda Vista', 'Basico B1', 'futbol_para_todos', 'Basico', 'B1', 'mixed', 2020, 2020, '17:20'::time, '18:30'::time, 'active', null),
      ('Linda Vista', 'Basico B1', 'futbol_para_todos', 'Basico', 'B1', 'mixed', 2019, 2019, '17:20'::time, '18:30'::time, 'active', null),
      ('Linda Vista', 'Basico B1', 'futbol_para_todos', 'Basico', 'B1', 'mixed', 2018, 2018, '17:20'::time, '18:30'::time, 'active', null),
      ('Linda Vista', 'Intermedio B1', 'futbol_para_todos', 'Intermedio', 'B1', 'mixed', 2017, 2017, '17:20'::time, '18:30'::time, 'active', null),
      ('Linda Vista', 'Intermedio B1', 'futbol_para_todos', 'Intermedio', 'B1', 'mixed', 2016, 2016, '17:20'::time, '18:30'::time, 'active', null),
      ('Linda Vista', 'Avanzado B1', 'futbol_para_todos', 'Avanzado', 'B1', 'male', 2015, 2015, '17:20'::time, '18:30'::time, 'active', null),
      ('Linda Vista', 'Avanzado B1', 'futbol_para_todos', 'Avanzado', 'B1', 'male', 2014, 2014, '17:20'::time, '18:30'::time, 'active', null),
      ('Linda Vista', 'Expert B1', 'futbol_para_todos', 'Expert', 'B1', 'male', 2013, 2013, '18:40'::time, '19:50'::time, 'active', null),
      ('Linda Vista', 'Expert B1', 'futbol_para_todos', 'Expert', 'B1', 'male', 2012, 2012, '18:40'::time, '19:50'::time, 'active', null),
      ('Linda Vista', 'Expert B2', 'futbol_para_todos', 'Expert', 'B2', 'male', 2012, 2013, '18:40'::time, '19:50'::time, 'active', null),
      ('Linda Vista', 'PreJuvenil B1', 'futbol_para_todos', 'PreJuvenil', 'B1', 'male', 2011, 2011, '20:00'::time, '21:10'::time, 'active', null),
      ('Linda Vista', 'PreJuvenil B1', 'futbol_para_todos', 'PreJuvenil', 'B1', 'male', 2010, 2010, '20:00'::time, '21:10'::time, 'active', null),
      ('Linda Vista', 'Avanzado B2 Femenil', 'futbol_para_todos', 'Avanzado', 'B2', 'female', 2014, 2015, '18:40'::time, '19:50'::time, 'active', null),
      ('Linda Vista', 'Expert B3 Femenil', 'futbol_para_todos', 'Expert', 'B3', 'female', 2012, 2013, '18:40'::time, '19:50'::time, 'active', null),
      ('Linda Vista', 'PreJuvenil B2 Femenil', 'futbol_para_todos', 'PreJuvenil', 'B2', 'female', 2010, 2011, '18:40'::time, '19:50'::time, 'active', null),
      ('Linda Vista', 'Selectivo 2018', 'selectivo', 'Selectivo', 'Selectivo', 'male', 2018, 2018, '16:00'::time, '17:10'::time, 'active', null),
      ('Linda Vista', 'Selectivo 2017', 'selectivo', 'Selectivo', 'Selectivo', 'male', 2017, 2017, '16:00'::time, '17:10'::time, 'active', null),
      ('Linda Vista', 'Selectivo 2016', 'selectivo', 'Selectivo', 'Selectivo', 'male', 2016, 2016, '16:00'::time, '17:10'::time, 'active', null),
      ('Linda Vista', 'Selectivo 2015', 'selectivo', 'Selectivo', 'Selectivo', 'male', 2015, 2015, '16:00'::time, '17:10'::time, 'active', null),
      ('Linda Vista', 'Selectivo 2014', 'selectivo', 'Selectivo', 'Selectivo', 'male', 2014, 2014, '16:00'::time, '17:10'::time, 'active', null),
      ('Linda Vista', 'Selectivo 2008/2009', 'selectivo', 'Selectivo', 'Selectivo', 'male', 2008, 2009, '20:00'::time, '21:10'::time, 'active', null),
      ('Linda Vista', 'Selectivo 2013', 'selectivo', 'Selectivo', 'Selectivo', 'male', 2013, 2013, null, null, 'projected', 'Grupo proyectado sin jugadores actualmente.'),
      ('Linda Vista', 'Selectivo 2012', 'selectivo', 'Selectivo', 'Selectivo', 'male', 2012, 2012, null, null, 'projected', 'Grupo proyectado sin jugadores actualmente.'),
      ('Linda Vista', 'Selectivo 2011', 'selectivo', 'Selectivo', 'Selectivo', 'male', 2011, 2011, null, null, 'projected', 'Grupo proyectado sin jugadores actualmente.'),
      ('Linda Vista', 'Selectivo 2010', 'selectivo', 'Selectivo', 'Selectivo', 'male', 2010, 2010, null, null, 'projected', 'Grupo proyectado sin jugadores actualmente.'),
      ('Contry', 'Iniciacion B1', 'futbol_para_todos', 'Iniciacion', 'B1', 'mixed', 2020, 2021, '17:20'::time, '18:30'::time, 'active', null),
      ('Contry', 'Basico B1', 'futbol_para_todos', 'Basico', 'B1', 'mixed', 2018, 2019, '17:20'::time, '18:30'::time, 'active', null),
      ('Contry', 'Intermedio B1', 'futbol_para_todos', 'Intermedio', 'B1', 'mixed', 2016, 2017, '17:20'::time, '18:30'::time, 'active', null),
      ('Contry', 'Avanzado B1', 'futbol_para_todos', 'Avanzado', 'B1', 'male', 2015, 2015, '17:20'::time, '18:30'::time, 'active', null),
      ('Contry', 'Avanzado B1', 'futbol_para_todos', 'Avanzado', 'B1', 'male', 2014, 2014, '18:40'::time, '19:50'::time, 'active', null),
      ('Contry', 'Expert B1', 'futbol_para_todos', 'Expert', 'B1', 'male', 2012, 2013, '20:00'::time, '21:10'::time, 'active', null),
      ('Contry', 'PreJuvenil B1', 'futbol_para_todos', 'PreJuvenil', 'B1', 'male', 2010, 2011, '20:00'::time, '21:10'::time, 'active', null),
      ('Contry', 'Avanzado B2 Femenil', 'futbol_para_todos', 'Avanzado', 'B2', 'female', 2014, 2015, '18:40'::time, '19:50'::time, 'active', null),
      ('Contry', 'Expert B2 Femenil', 'futbol_para_todos', 'Expert', 'B2', 'female', 2012, 2013, '18:40'::time, '19:50'::time, 'active', null),
      ('Contry', 'PreJuvenil B2 Femenil', 'futbol_para_todos', 'PreJuvenil', 'B2', 'female', 2010, 2011, '18:40'::time, '19:50'::time, 'active', null),
      ('Contry', 'Selectivo 2016', 'selectivo', 'Selectivo', 'Selectivo', 'male', 2016, 2016, '16:00'::time, '17:10'::time, 'active', null),
      ('Contry', 'Selectivo 2015', 'selectivo', 'Selectivo', 'Selectivo', 'male', 2015, 2015, '16:00'::time, '17:10'::time, 'active', null),
      ('Contry', 'Selectivo 2014', 'selectivo', 'Selectivo', 'Selectivo', 'male', 2014, 2014, '16:00'::time, '17:10'::time, 'active', null),
      ('Contry', 'Selectivo 2012/2013', 'selectivo', 'Selectivo', 'Selectivo', 'male', 2012, 2013, '20:00'::time, '21:10'::time, 'active', null),
      ('Contry', 'Selectivo 2010/2011', 'selectivo', 'Selectivo', 'Selectivo', 'male', 2010, 2011, '20:00'::time, '21:10'::time, 'active', null)
  ) as rows(campus_name, name, program, level_label, group_code, gender, birth_year_min, birth_year_max, start_time, end_time, status, notes)
)
insert into public.training_groups (
  campus_id,
  name,
  program,
  level_label,
  group_code,
  gender,
  birth_year_min,
  birth_year_max,
  start_time,
  end_time,
  status,
  notes
)
select
  campuses.id,
  rows.name,
  rows.program,
  rows.level_label,
  rows.group_code,
  rows.gender,
  rows.birth_year_min,
  rows.birth_year_max,
  rows.start_time,
  rows.end_time,
  rows.status,
  rows.notes
from group_rows rows
join public.campuses on campuses.name = rows.campus_name
where not exists (
  select 1
  from public.training_groups g
  where g.campus_id = campuses.id
    and g.name = rows.name
    and g.program = rows.program
    and g.gender = rows.gender
    and coalesce(g.birth_year_min, -1) = coalesce(rows.birth_year_min, -1)
    and coalesce(g.birth_year_max, -1) = coalesce(rows.birth_year_max, -1)
);

with group_coach_rows as (
  select *
  from (
    values
      ('Linda Vista', 'Little Dragons', 'little_dragons', 'mixed', 2020, 2023, 'Alex', true),
      ('Linda Vista', 'Little Dragons', 'little_dragons', 'mixed', 2020, 2023, 'Felipe', false),
      ('Linda Vista', 'Little Dragons', 'little_dragons', 'mixed', 2020, 2023, 'Johan', false),
      ('Linda Vista', 'Basico B1', 'futbol_para_todos', 'mixed', 2020, 2020, 'Felipe', true),
      ('Linda Vista', 'Basico B1', 'futbol_para_todos', 'mixed', 2019, 2019, 'Osmar', true),
      ('Linda Vista', 'Basico B1', 'futbol_para_todos', 'mixed', 2018, 2018, 'Johan', true),
      ('Linda Vista', 'Intermedio B1', 'futbol_para_todos', 'mixed', 2017, 2017, 'Merino', true),
      ('Linda Vista', 'Intermedio B1', 'futbol_para_todos', 'mixed', 2016, 2016, 'David', true),
      ('Linda Vista', 'Avanzado B1', 'futbol_para_todos', 'male', 2015, 2015, 'Nelson', true),
      ('Linda Vista', 'Avanzado B1', 'futbol_para_todos', 'male', 2014, 2014, 'Arturo', true),
      ('Linda Vista', 'Expert B1', 'futbol_para_todos', 'male', 2013, 2013, 'Alex', true),
      ('Linda Vista', 'Expert B1', 'futbol_para_todos', 'male', 2012, 2012, 'Villalba', true),
      ('Linda Vista', 'Expert B2', 'futbol_para_todos', 'male', 2012, 2013, 'Nelson', true),
      ('Linda Vista', 'PreJuvenil B1', 'futbol_para_todos', 'male', 2011, 2011, 'Villalba', true),
      ('Linda Vista', 'PreJuvenil B1', 'futbol_para_todos', 'male', 2011, 2011, 'Johan', false),
      ('Linda Vista', 'PreJuvenil B1', 'futbol_para_todos', 'male', 2010, 2010, 'Alex', true),
      ('Linda Vista', 'Avanzado B2 Femenil', 'futbol_para_todos', 'female', 2014, 2015, 'Osmar', true),
      ('Linda Vista', 'Expert B3 Femenil', 'futbol_para_todos', 'female', 2012, 2013, 'David', true),
      ('Linda Vista', 'PreJuvenil B2 Femenil', 'futbol_para_todos', 'female', 2010, 2011, 'Felipe', true),
      ('Linda Vista', 'Selectivo 2018', 'selectivo', 'male', 2018, 2018, 'Johan', true),
      ('Linda Vista', 'Selectivo 2017', 'selectivo', 'male', 2017, 2017, 'Arturo', true),
      ('Linda Vista', 'Selectivo 2016', 'selectivo', 'male', 2016, 2016, 'Alex', true),
      ('Linda Vista', 'Selectivo 2016', 'selectivo', 'male', 2016, 2016, 'David', false),
      ('Linda Vista', 'Selectivo 2015', 'selectivo', 'male', 2015, 2015, 'Felipe', true),
      ('Linda Vista', 'Selectivo 2014', 'selectivo', 'male', 2014, 2014, 'Merino', true),
      ('Linda Vista', 'Selectivo 2008/2009', 'selectivo', 'male', 2008, 2009, 'David', true),
      ('Linda Vista', 'Selectivo 2008/2009', 'selectivo', 'male', 2008, 2009, 'Arturo', false),
      ('Linda Vista', 'Selectivo 2013', 'selectivo', 'male', 2013, 2013, 'Villalba', true),
      ('Linda Vista', 'Selectivo 2012', 'selectivo', 'male', 2012, 2012, 'Merino', true),
      ('Contry', 'Iniciacion B1', 'futbol_para_todos', 'mixed', 2020, 2021, 'Ailin', true),
      ('Contry', 'Basico B1', 'futbol_para_todos', 'mixed', 2018, 2019, 'Angel', true),
      ('Contry', 'Intermedio B1', 'futbol_para_todos', 'mixed', 2016, 2017, 'Sebastian', true),
      ('Contry', 'Intermedio B1', 'futbol_para_todos', 'mixed', 2016, 2017, 'Daniel', false),
      ('Contry', 'Avanzado B1', 'futbol_para_todos', 'male', 2015, 2015, 'Joel', true),
      ('Contry', 'Avanzado B1', 'futbol_para_todos', 'male', 2014, 2014, 'Sebastian', true),
      ('Contry', 'Avanzado B1', 'futbol_para_todos', 'male', 2014, 2014, 'Daniel', false),
      ('Contry', 'Expert B1', 'futbol_para_todos', 'male', 2012, 2013, 'Ailin', true),
      ('Contry', 'PreJuvenil B1', 'futbol_para_todos', 'male', 2010, 2011, 'Joel', true),
      ('Contry', 'PreJuvenil B1', 'futbol_para_todos', 'male', 2010, 2011, 'Daniel', false),
      ('Contry', 'Avanzado B2 Femenil', 'futbol_para_todos', 'female', 2014, 2015, 'Ailin', true),
      ('Contry', 'Expert B2 Femenil', 'futbol_para_todos', 'female', 2012, 2013, 'Joel', true),
      ('Contry', 'PreJuvenil B2 Femenil', 'futbol_para_todos', 'female', 2010, 2011, 'Angel', true),
      ('Contry', 'Selectivo 2016', 'selectivo', 'male', 2016, 2016, 'Ailin', true),
      ('Contry', 'Selectivo 2015', 'selectivo', 'male', 2015, 2015, 'Joel', true),
      ('Contry', 'Selectivo 2014', 'selectivo', 'male', 2014, 2014, 'Sebastian', true),
      ('Contry', 'Selectivo 2014', 'selectivo', 'male', 2014, 2014, 'Daniel', false),
      ('Contry', 'Selectivo 2012/2013', 'selectivo', 'male', 2012, 2013, 'Angel', true),
      ('Contry', 'Selectivo 2010/2011', 'selectivo', 'male', 2010, 2011, 'Joel', true),
      ('Contry', 'Selectivo 2010/2011', 'selectivo', 'male', 2010, 2011, 'Daniel', false)
  ) as rows(campus_name, group_name, program, gender, birth_year_min, birth_year_max, coach_name, is_primary)
)
insert into public.training_group_coaches (training_group_id, coach_id, is_primary)
select
  g.id,
  c.id,
  rows.is_primary
from group_coach_rows rows
join public.campuses campus on campus.name = rows.campus_name
join public.training_groups g
  on g.campus_id = campus.id
 and g.name = rows.group_name
 and g.program = rows.program
 and g.gender = rows.gender
 and coalesce(g.birth_year_min, -1) = coalesce(rows.birth_year_min, -1)
 and coalesce(g.birth_year_max, -1) = coalesce(rows.birth_year_max, -1)
join public.coaches c
  on c.campus_id = campus.id
 and lower(translate(c.first_name, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) = lower(translate(rows.coach_name, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'))
where not exists (
  select 1
  from public.training_group_coaches tgc
  where tgc.training_group_id = g.id
    and tgc.coach_id = c.id
);

alter table public.attendance_schedule_templates
  add column if not exists training_group_id uuid null references public.training_groups(id) on delete restrict;

alter table public.attendance_schedule_templates
  alter column team_id drop not null;

alter table public.attendance_sessions
  add column if not exists training_group_id uuid null references public.training_groups(id) on delete restrict;

alter table public.attendance_sessions
  alter column team_id drop not null;

alter table public.attendance_records
  add column if not exists training_group_assignment_id uuid null references public.training_group_assignments(id) on delete restrict;

alter table public.attendance_records
  alter column team_assignment_id drop not null;

drop index if exists uq_attendance_sessions_idempotent;

create unique index if not exists uq_attendance_sessions_team_idempotent
  on public.attendance_sessions(team_id, session_date, start_time, session_type)
  where team_id is not null;

create unique index if not exists uq_attendance_sessions_training_group_idempotent
  on public.attendance_sessions(training_group_id, session_date, start_time, session_type)
  where training_group_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.attendance_schedule_templates'::regclass
      and conname = 'attendance_schedule_templates_source_check'
  ) then
    alter table public.attendance_schedule_templates
      add constraint attendance_schedule_templates_source_check
      check (
        (training_group_id is not null and team_id is null)
        or (training_group_id is null and team_id is not null)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.attendance_sessions'::regclass
      and conname = 'attendance_sessions_source_check'
  ) then
    alter table public.attendance_sessions
      add constraint attendance_sessions_source_check
      check (
        (session_type = 'training' and (
          (training_group_id is not null and team_id is null)
          or (training_group_id is null and team_id is not null)
        ))
        or (session_type in ('match', 'special') and team_id is not null and training_group_id is null)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.attendance_records'::regclass
      and conname = 'attendance_records_assignment_source_check'
  ) then
    alter table public.attendance_records
      add constraint attendance_records_assignment_source_check
      check (
        (training_group_assignment_id is not null and team_assignment_id is null)
        or (training_group_assignment_id is null and team_assignment_id is not null)
      );
  end if;
end $$;

create or replace function public.validate_attendance_schedule_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team record;
  v_group record;
begin
  if new.training_group_id is not null then
    select id, campus_id, status
    into v_group
    from public.training_groups
    where id = new.training_group_id;

    if v_group.id is null then
      raise exception 'attendance schedule training group not found';
    end if;

    if v_group.campus_id <> new.campus_id then
      raise exception 'attendance schedule campus mismatch';
    end if;

    if v_group.status <> 'active' then
      raise exception 'attendance training schedules require active training groups';
    end if;
  elsif new.team_id is not null then
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
      raise exception 'legacy attendance schedules require active class teams';
    end if;
  else
    raise exception 'attendance schedule requires a source roster';
  end if;

  new.updated_at := now();
  return new;
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
   and t.training_group_id is not null
   and t.effective_start <= d::date
   and (t.effective_end is null or t.effective_end >= d::date)
   and t.day_of_week = extract(isodow from d)::int
  join public.training_groups g
    on g.id = t.training_group_id
   and g.status = 'active'
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

comment on table public.training_groups is
  'Daily training groups used for attendance and sports operations, separate from competition teams.';

comment on table public.training_group_assignments is
  'Current and historical player-to-training-group membership by active enrollment.';

comment on column public.attendance_schedule_templates.training_group_id is
  'Primary source roster for recurring training sessions. Replaces class-team coupling for new schedules.';

comment on column public.attendance_sessions.training_group_id is
  'Training-group roster source for practice attendance. Match and special sessions continue using team_id.';

comment on column public.attendance_records.training_group_assignment_id is
  'Roster membership used for group-based training attendance rows.';
