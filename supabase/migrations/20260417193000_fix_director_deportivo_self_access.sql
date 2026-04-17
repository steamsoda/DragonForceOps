-- Allow director_deportivo users to read the minimal auth/reference data
-- needed to resolve their own access scope during login and protected layout
-- bootstrapping.

drop policy if exists sports_director_read_app_roles on public.app_roles;
create policy sports_director_read_app_roles on public.app_roles
  for select to authenticated
  using (public.is_director_deportivo());

drop policy if exists sports_director_read_own_user_roles on public.user_roles;
create policy sports_director_read_own_user_roles on public.user_roles
  for select to authenticated
  using (
    public.is_director_deportivo()
    and user_id = auth.uid()
  );

drop policy if exists sports_director_read_campuses on public.campuses;
create policy sports_director_read_campuses on public.campuses
  for select to authenticated
  using (public.is_director_deportivo());
