-- Supabase advisor security hardening.
-- Keep internal tables closed, make SECURITY DEFINER lookup paths explicit,
-- and rewrite auth helpers in RLS policies so Postgres can initPlan them.

alter function public.assign_payment_folio() set search_path = public;
alter function public.has_operational_access() set search_path = public;
alter function public.is_director_admin() set search_path = public;
alter function public.is_front_desk() set search_path = public;
alter function public.list_auth_users() set search_path = public;
alter function public.list_teams_with_counts() set search_path = public;
alter function public.merge_players(uuid, uuid, uuid, text) set search_path = public;
alter function public.nuke_player(uuid) set search_path = public;

drop policy if exists campus_folio_counters_no_client_access on public.campus_folio_counters;
create policy campus_folio_counters_no_client_access on public.campus_folio_counters
  for all to public
  using (false)
  with check (false);

drop policy if exists finance_reconciliation_snapshots_no_client_access on public.finance_reconciliation_snapshots;
create policy finance_reconciliation_snapshots_no_client_access on public.finance_reconciliation_snapshots
  for all to public
  using (false)
  with check (false);

drop policy if exists "authenticated can read app_settings" on public.app_settings;
create policy "authenticated can read app_settings" on public.app_settings
  for select to authenticated
  using (true);

drop policy if exists "coaches_insert_director" on public.coaches;
create policy "coaches_insert_director" on public.coaches
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.user_roles ur
      join public.app_roles ar on ar.id = ur.role_id
      where ur.user_id = (select auth.uid())
        and ar.code = 'director_admin'
    )
  );

drop policy if exists "coaches_update_director" on public.coaches;
create policy "coaches_update_director" on public.coaches
  for update to authenticated
  using (
    exists (
      select 1
      from public.user_roles ur
      join public.app_roles ar on ar.id = ur.role_id
      where ur.user_id = (select auth.uid())
        and ar.code = 'director_admin'
    )
  );

drop policy if exists "nutritionist_insert_player_measurement_sessions" on public.player_measurement_sessions;
create policy "nutritionist_insert_player_measurement_sessions" on public.player_measurement_sessions
  for insert to authenticated
  with check (
    (select public.is_nutritionist())
    and public.current_user_can_access_nutrition_player(player_id)
    and public.current_user_can_access_nutrition_enrollment(enrollment_id)
    and public.can_access_nutrition_campus(campus_id)
    and recorded_by_user_id = (select auth.uid())
  );

drop policy if exists "staff can manage uniform_orders" on public.uniform_orders;
create policy "staff can manage uniform_orders" on public.uniform_orders
  for all to authenticated
  using (true)
  with check (true);

drop policy if exists attendance_admin_read_own_user_roles on public.user_roles;
create policy attendance_admin_read_own_user_roles on public.user_roles
  for select to authenticated
  using ((select public.is_attendance_admin()) and user_id = (select auth.uid()));

drop policy if exists front_desk_read_own_user_role on public.user_roles;
create policy front_desk_read_own_user_role on public.user_roles
  for select to authenticated
  using ((select public.is_front_desk()) and user_id = (select auth.uid()));

drop policy if exists nutritionist_read_own_user_roles on public.user_roles;
create policy nutritionist_read_own_user_roles on public.user_roles
  for select to authenticated
  using ((select public.is_nutritionist()) and user_id = (select auth.uid()));

drop policy if exists sports_director_read_own_user_roles on public.user_roles;
create policy sports_director_read_own_user_roles on public.user_roles
  for select to authenticated
  using ((select public.is_director_deportivo()) and user_id = (select auth.uid()));
