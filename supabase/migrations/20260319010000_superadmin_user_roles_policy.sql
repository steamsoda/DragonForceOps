-- Allow superadmin (via is_director_admin which covers superadmin) to fully manage user_roles and read app_roles

create policy superadmin_manage_user_roles on public.user_roles
  for all to authenticated
  using (public.is_director_admin())
  with check (public.is_director_admin());

create policy superadmin_read_app_roles on public.app_roles
  for select to authenticated
  using (public.is_director_admin());
