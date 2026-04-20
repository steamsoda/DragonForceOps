-- Nutrition measurements v1
-- Adds a campus-scoped nutritionist role plus a historical measurement-session table.

insert into public.app_roles (code, name)
values ('nutritionist', 'Nutricionista')
on conflict (code) do update
set name = excluded.name;

create or replace function public.is_nutritionist()
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
      and ar.code = 'nutritionist'
  );
$$;

grant execute on function public.is_nutritionist() to authenticated, anon;

create or replace function public.can_access_nutrition_campus(p_campus_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_director_admin()
    or exists (
      select 1
      from public.user_roles ur
      join public.app_roles ar on ar.id = ur.role_id
      where ur.user_id = auth.uid()
        and ar.code = 'nutritionist'
        and (ur.campus_id = p_campus_id or ur.campus_id is null)
    );
$$;

grant execute on function public.can_access_nutrition_campus(uuid) to authenticated, anon;

create or replace function public.current_user_can_access_nutrition_player(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.player_id = p_player_id
      and public.can_access_nutrition_campus(e.campus_id)
  );
$$;

grant execute on function public.current_user_can_access_nutrition_player(uuid) to authenticated, anon;

create or replace function public.current_user_can_access_nutrition_enrollment(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.id = p_enrollment_id
      and public.can_access_nutrition_campus(e.campus_id)
  );
$$;

grant execute on function public.current_user_can_access_nutrition_enrollment(uuid) to authenticated, anon;

create table if not exists public.player_measurement_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  measured_at timestamptz not null,
  recorded_by_user_id uuid not null references auth.users(id) on delete restrict default auth.uid(),
  source text not null,
  weight_kg numeric(6,2) not null,
  height_cm numeric(6,2) not null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source in ('initial_intake', 'follow_up')),
  check (weight_kg > 0),
  check (height_cm > 0)
);

create index if not exists idx_player_measurement_sessions_player_measured_at
  on public.player_measurement_sessions(player_id, measured_at desc);

create index if not exists idx_player_measurement_sessions_enrollment
  on public.player_measurement_sessions(enrollment_id);

create index if not exists idx_player_measurement_sessions_campus_measured_at
  on public.player_measurement_sessions(campus_id, measured_at desc);

alter table public.player_measurement_sessions enable row level security;

drop policy if exists director_admin_all_player_measurement_sessions on public.player_measurement_sessions;
create policy director_admin_all_player_measurement_sessions on public.player_measurement_sessions
  for all to authenticated
  using (public.is_director_admin())
  with check (public.is_director_admin());

drop policy if exists nutritionist_read_campuses on public.campuses;
create policy nutritionist_read_campuses on public.campuses
  for select to authenticated
  using (public.is_nutritionist() and public.can_access_nutrition_campus(id));

drop policy if exists nutritionist_read_players on public.players;
create policy nutritionist_read_players on public.players
  for select to authenticated
  using (public.is_nutritionist() and public.current_user_can_access_nutrition_player(id));

drop policy if exists nutritionist_read_enrollments on public.enrollments;
create policy nutritionist_read_enrollments on public.enrollments
  for select to authenticated
  using (public.is_nutritionist() and public.can_access_nutrition_campus(campus_id));

drop policy if exists nutritionist_read_player_measurement_sessions on public.player_measurement_sessions;
create policy nutritionist_read_player_measurement_sessions on public.player_measurement_sessions
  for select to authenticated
  using (
    public.is_nutritionist()
    and public.current_user_can_access_nutrition_player(player_id)
    and public.current_user_can_access_nutrition_enrollment(enrollment_id)
    and public.can_access_nutrition_campus(campus_id)
  );

drop policy if exists nutritionist_insert_player_measurement_sessions on public.player_measurement_sessions;
create policy nutritionist_insert_player_measurement_sessions on public.player_measurement_sessions
  for insert to authenticated
  with check (
    public.is_nutritionist()
    and public.current_user_can_access_nutrition_player(player_id)
    and public.current_user_can_access_nutrition_enrollment(enrollment_id)
    and public.can_access_nutrition_campus(campus_id)
    and recorded_by_user_id = auth.uid()
  );

comment on table public.player_measurement_sessions is
  'Historical body-measurement sessions captured by nutrition staff per player and enrollment.';
