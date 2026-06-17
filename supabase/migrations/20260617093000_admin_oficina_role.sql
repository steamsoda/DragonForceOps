-- Admin Oficina: global player/contact + attendance role without finance access.

insert into public.app_roles (code, name)
values ('admin_oficina', 'Admin Oficina')
on conflict (code) do update
set name = excluded.name;

create or replace function public.is_office_admin()
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
      and ar.code = 'admin_oficina'
  );
$$;

revoke execute on function public.is_office_admin() from public, anon;
grant execute on function public.is_office_admin() to authenticated;

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
     or exists (
       select 1
       from role_rows rr
       where rr.code = 'admin_oficina'
     )

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

revoke execute on function public.current_user_attendance_write_campuses() from public, anon;
grant execute on function public.current_user_attendance_write_campuses() to authenticated;

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

revoke execute on function public.current_user_attendance_read_campuses() from public, anon;
grant execute on function public.current_user_attendance_read_campuses() to authenticated;

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

revoke execute on function public.can_read_attendance_campus(uuid) from public, anon;
grant execute on function public.can_read_attendance_campus(uuid) to authenticated;

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

revoke execute on function public.can_write_attendance_campus(uuid) from public, anon;
grant execute on function public.can_write_attendance_campus(uuid) to authenticated;

drop policy if exists office_admin_read_app_roles on public.app_roles;
create policy office_admin_read_app_roles on public.app_roles
  for select to authenticated
  using (public.is_office_admin());

drop policy if exists office_admin_read_own_user_roles on public.user_roles;
create policy office_admin_read_own_user_roles on public.user_roles
  for select to authenticated
  using (public.is_office_admin() and user_id = auth.uid());

drop policy if exists office_admin_read_campuses on public.campuses;
create policy office_admin_read_campuses on public.campuses
  for select to authenticated
  using (public.is_office_admin());

drop policy if exists office_admin_read_players on public.players;
create policy office_admin_read_players on public.players
  for select to authenticated
  using (
    public.is_office_admin()
    and exists (
      select 1
      from public.enrollments e
      where e.player_id = players.id
    )
  );

drop policy if exists office_admin_read_enrollments on public.enrollments;
create policy office_admin_read_enrollments on public.enrollments
  for select to authenticated
  using (public.is_office_admin());

drop policy if exists office_admin_read_guardians on public.guardians;
create policy office_admin_read_guardians on public.guardians
  for select to authenticated
  using (
    public.is_office_admin()
    and exists (
      select 1
      from public.player_guardians pg
      join public.enrollments e on e.player_id = pg.player_id
      where pg.guardian_id = guardians.id
    )
  );

drop policy if exists office_admin_guardians_update on public.guardians;
create policy office_admin_guardians_update on public.guardians
  for update to authenticated
  using (
    public.is_office_admin()
    and exists (
      select 1
      from public.player_guardians pg
      join public.enrollments e on e.player_id = pg.player_id
      where pg.guardian_id = guardians.id
    )
  )
  with check (
    public.is_office_admin()
    and exists (
      select 1
      from public.player_guardians pg
      join public.enrollments e on e.player_id = pg.player_id
      where pg.guardian_id = guardians.id
    )
  );

drop policy if exists office_admin_guardians_insert on public.guardians;
create policy office_admin_guardians_insert on public.guardians
  for insert to authenticated
  with check (public.is_office_admin());

drop policy if exists office_admin_read_player_guardians on public.player_guardians;
create policy office_admin_read_player_guardians on public.player_guardians
  for select to authenticated
  using (
    public.is_office_admin()
    and exists (
      select 1
      from public.enrollments e
      where e.player_id = player_guardians.player_id
    )
  );

drop policy if exists office_admin_player_guardians_insert on public.player_guardians;
create policy office_admin_player_guardians_insert on public.player_guardians
  for insert to authenticated
  with check (
    public.is_office_admin()
    and exists (
      select 1
      from public.enrollments e
      where e.player_id = player_guardians.player_id
    )
  );

drop policy if exists office_admin_read_teams on public.teams;
create policy office_admin_read_teams on public.teams
  for select to authenticated
  using (public.is_office_admin());

drop policy if exists office_admin_read_coaches on public.coaches;
create policy office_admin_read_coaches on public.coaches
  for select to authenticated
  using (public.is_office_admin());

drop policy if exists office_admin_read_training_groups on public.training_groups;
create policy office_admin_read_training_groups on public.training_groups
  for select to authenticated
  using (public.is_office_admin());

drop policy if exists office_admin_read_training_group_assignments on public.training_group_assignments;
create policy office_admin_read_training_group_assignments on public.training_group_assignments
  for select to authenticated
  using (
    public.is_office_admin()
    and exists (
      select 1
      from public.enrollments e
      where e.id = training_group_assignments.enrollment_id
    )
  );

drop policy if exists office_admin_read_team_assignments on public.team_assignments;
create policy office_admin_read_team_assignments on public.team_assignments
  for select to authenticated
  using (
    public.is_office_admin()
    and exists (
      select 1
      from public.enrollments e
      where e.id = team_assignments.enrollment_id
    )
  );

drop policy if exists office_admin_read_enrollment_incidents on public.enrollment_incidents;
create policy office_admin_read_enrollment_incidents on public.enrollment_incidents
  for select to authenticated
  using (
    public.is_office_admin()
    and exists (
      select 1
      from public.enrollments e
      where e.id = enrollment_incidents.enrollment_id
    )
  );

drop policy if exists office_admin_insert_audit_logs on public.audit_logs;
create policy office_admin_insert_audit_logs on public.audit_logs
  for insert to authenticated
  with check (public.is_office_admin());
