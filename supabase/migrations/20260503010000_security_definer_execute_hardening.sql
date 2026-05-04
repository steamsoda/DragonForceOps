-- Tighten SECURITY DEFINER RPC exposure after Supabase advisor flagged
-- anon/authenticated execute privileges. Keep app-used authenticated RPCs
-- available where they still enforce role/campus scope internally.

create or replace function public.list_auth_users()
returns table(
  id uuid,
  email text,
  last_sign_in_at timestamptz,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public, auth
as $$
  select u.id, u.email::text, u.last_sign_in_at, u.created_at
  from auth.users u
  where exists (
    select 1
    from public.user_roles ur
    join public.app_roles ar on ar.id = ur.role_id
    where ur.user_id = auth.uid()
      and ar.code = 'superadmin'
  )
  order by u.created_at asc;
$$;

create or replace function public.merge_players(
  p_master_id uuid,
  p_duplicate_id uuid,
  p_actor_id uuid,
  p_reason text default 'Fusion de jugadores duplicados'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_master_active int;
  v_dup_active int;
  v_master_exists int;
  v_dup_exists int;
begin
  if not exists (
    select 1
    from public.user_roles ur
    join public.app_roles ar on ar.id = ur.role_id
    where ur.user_id = auth.uid()
      and ar.code in ('superadmin', 'director_admin')
  ) then
    raise exception 'unauthorized';
  end if;

  if p_actor_id is distinct from auth.uid() then
    raise exception 'unauthorized';
  end if;

  if p_master_id = p_duplicate_id then
    raise exception 'master_and_duplicate_same';
  end if;

  select count(*) into v_master_exists from public.players where id = p_master_id;
  select count(*) into v_dup_exists from public.players where id = p_duplicate_id;
  if v_master_exists = 0 then raise exception 'master_not_found'; end if;
  if v_dup_exists = 0 then raise exception 'duplicate_not_found'; end if;

  select count(*) into v_master_active from public.enrollments where player_id = p_master_id and status = 'active';
  select count(*) into v_dup_active from public.enrollments where player_id = p_duplicate_id and status = 'active';
  if v_master_active > 0 and v_dup_active > 0 then
    raise exception 'both_have_active_enrollment';
  end if;

  update public.enrollments
  set player_id = p_master_id
  where player_id = p_duplicate_id;

  insert into public.player_guardians (player_id, guardian_id, is_primary)
  select p_master_id, pg.guardian_id, pg.is_primary
  from public.player_guardians pg
  where pg.player_id = p_duplicate_id
  on conflict (player_id, guardian_id) do nothing;

  delete from public.player_guardians where player_id = p_duplicate_id;

  update public.uniform_orders
  set player_id = p_master_id
  where player_id = p_duplicate_id;

  insert into public.audit_logs (event_at, actor_user_id, action, table_name, record_id, after_data)
  values (
    now(),
    auth.uid(),
    'merge_players',
    'players',
    p_master_id,
    jsonb_build_object(
      'master_id', p_master_id,
      'duplicate_id', p_duplicate_id,
      'reason', p_reason
    )
  );

  delete from public.players where id = p_duplicate_id;
end;
$$;

create or replace function public.nuke_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment_ids uuid[];
  v_payment_ids uuid[];
  v_guardian_ids uuid[];
begin
  if not exists (
    select 1
    from public.user_roles ur
    join public.app_roles ar on ar.id = ur.role_id
    where ur.user_id = auth.uid()
      and ar.code = 'superadmin'
  ) then
    raise exception 'unauthorized';
  end if;

  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'player_not_found';
  end if;

  select array_agg(id) into v_enrollment_ids
  from public.enrollments
  where player_id = p_player_id;

  if v_enrollment_ids is not null then
    select array_agg(id) into v_payment_ids
    from public.payments
    where enrollment_id = any(v_enrollment_ids);

    if v_payment_ids is not null then
      delete from public.cash_session_entries where payment_id = any(v_payment_ids);
      delete from public.payment_allocations where payment_id = any(v_payment_ids);
      delete from public.payments where id = any(v_payment_ids);
    end if;

    delete from public.charges where enrollment_id = any(v_enrollment_ids);
    delete from public.team_assignments where enrollment_id = any(v_enrollment_ids);
    delete from public.uniform_orders where enrollment_id = any(v_enrollment_ids);
    delete from public.enrollments where id = any(v_enrollment_ids);
  end if;

  delete from public.uniform_orders where player_id = p_player_id;

  select array_agg(g.id) into v_guardian_ids
  from public.guardians g
  join public.player_guardians pg on pg.guardian_id = g.id
  where pg.player_id = p_player_id
    and not exists (
      select 1
      from public.player_guardians pg2
      where pg2.guardian_id = g.id
        and pg2.player_id != p_player_id
    );

  delete from public.player_guardians where player_id = p_player_id;

  if v_guardian_ids is not null then
    delete from public.guardians where id = any(v_guardian_ids);
  end if;

  delete from public.players where id = p_player_id;
end;
$$;

-- Remove the default PUBLIC execute grant from exposed SECURITY DEFINER
-- functions. Re-grant authenticated only where the app/RLS still depends on
-- user-scoped execution.
revoke execute on function public.assign_payment_folio() from public;
revoke execute on function public.assign_payment_folio() from anon;
revoke execute on function public.assign_payment_folio() from authenticated;
revoke execute on function public.assign_player_public_id() from public;
revoke execute on function public.assign_player_public_id() from anon;
revoke execute on function public.assign_player_public_id() from authenticated;
revoke execute on function public.validate_attendance_schedule_template() from public;
revoke execute on function public.validate_attendance_schedule_template() from anon;
revoke execute on function public.validate_attendance_schedule_template() from authenticated;

revoke execute on function public.generate_monthly_charges(date) from public;
revoke execute on function public.generate_monthly_charges(date) from anon;
revoke execute on function public.generate_monthly_charges(date) from authenticated;
revoke execute on function public.reprice_pending_monthly_tuition(date) from public;
revoke execute on function public.reprice_pending_monthly_tuition(date) from anon;
revoke execute on function public.reprice_pending_monthly_tuition(date) from authenticated;
revoke execute on function public.generate_attendance_sessions(date, date) from public;
revoke execute on function public.generate_attendance_sessions(date, date) from anon;
revoke execute on function public.generate_attendance_sessions(date, date) from authenticated;
revoke execute on function public.generate_attendance_sessions_for_campus(date, date, uuid) from public;
revoke execute on function public.generate_attendance_sessions_for_campus(date, date, uuid) from anon;
revoke execute on function public.generate_attendance_sessions_for_campus(date, date, uuid) from authenticated;
revoke execute on function public.capture_finance_reconciliation_snapshot(uuid, text) from public;
revoke execute on function public.capture_finance_reconciliation_snapshot(uuid, text) from anon;
revoke execute on function public.capture_finance_reconciliation_snapshot(uuid, text) from authenticated;

grant execute on function public.generate_monthly_charges(date) to service_role;
grant execute on function public.reprice_pending_monthly_tuition(date) to service_role;
grant execute on function public.generate_attendance_sessions(date, date) to service_role;
grant execute on function public.generate_attendance_sessions_for_campus(date, date, uuid) to service_role;
grant execute on function public.capture_finance_reconciliation_snapshot(uuid, text) to service_role;

revoke execute on function public.is_director_admin() from public;
revoke execute on function public.is_director_admin() from anon;
revoke execute on function public.is_front_desk() from public;
revoke execute on function public.is_front_desk() from anon;
revoke execute on function public.has_operational_access() from public;
revoke execute on function public.has_operational_access() from anon;
revoke execute on function public.is_director_deportivo() from public;
revoke execute on function public.is_director_deportivo() from anon;
revoke execute on function public.is_nutritionist() from public;
revoke execute on function public.is_nutritionist() from anon;
revoke execute on function public.is_attendance_admin() from public;
revoke execute on function public.is_attendance_admin() from anon;
revoke execute on function public.current_user_allowed_campuses() from public;
revoke execute on function public.current_user_allowed_campuses() from anon;
revoke execute on function public.can_access_campus(uuid) from public;
revoke execute on function public.can_access_campus(uuid) from anon;
revoke execute on function public.can_access_sports_campus(uuid) from public;
revoke execute on function public.can_access_sports_campus(uuid) from anon;
revoke execute on function public.can_access_nutrition_campus(uuid) from public;
revoke execute on function public.can_access_nutrition_campus(uuid) from anon;
revoke execute on function public.current_user_attendance_read_campuses() from public;
revoke execute on function public.current_user_attendance_read_campuses() from anon;
revoke execute on function public.current_user_attendance_write_campuses() from public;
revoke execute on function public.current_user_attendance_write_campuses() from anon;
revoke execute on function public.can_read_attendance_campus(uuid) from public;
revoke execute on function public.can_read_attendance_campus(uuid) from anon;
revoke execute on function public.can_write_attendance_campus(uuid) from public;
revoke execute on function public.can_write_attendance_campus(uuid) from anon;
revoke execute on function public.current_user_can_access_player(uuid) from public;
revoke execute on function public.current_user_can_access_player(uuid) from anon;
revoke execute on function public.current_user_can_access_guardian(uuid) from public;
revoke execute on function public.current_user_can_access_guardian(uuid) from anon;
revoke execute on function public.current_user_can_access_enrollment(uuid) from public;
revoke execute on function public.current_user_can_access_enrollment(uuid) from anon;
revoke execute on function public.current_user_can_access_team(uuid) from public;
revoke execute on function public.current_user_can_access_team(uuid) from anon;
revoke execute on function public.current_user_can_access_payment(uuid) from public;
revoke execute on function public.current_user_can_access_payment(uuid) from anon;
revoke execute on function public.current_user_can_access_charge(uuid) from public;
revoke execute on function public.current_user_can_access_charge(uuid) from anon;
revoke execute on function public.current_user_can_access_cash_session(uuid) from public;
revoke execute on function public.current_user_can_access_cash_session(uuid) from anon;
revoke execute on function public.current_user_can_access_nutrition_player(uuid) from public;
revoke execute on function public.current_user_can_access_nutrition_player(uuid) from anon;
revoke execute on function public.current_user_can_access_nutrition_enrollment(uuid) from public;
revoke execute on function public.current_user_can_access_nutrition_enrollment(uuid) from anon;

grant execute on function public.is_director_admin() to authenticated;
grant execute on function public.is_front_desk() to authenticated;
grant execute on function public.has_operational_access() to authenticated;
grant execute on function public.is_director_deportivo() to authenticated;
grant execute on function public.is_nutritionist() to authenticated;
grant execute on function public.is_attendance_admin() to authenticated;
grant execute on function public.current_user_allowed_campuses() to authenticated;
grant execute on function public.can_access_campus(uuid) to authenticated;
grant execute on function public.can_access_sports_campus(uuid) to authenticated;
grant execute on function public.can_access_nutrition_campus(uuid) to authenticated;
grant execute on function public.current_user_attendance_read_campuses() to authenticated;
grant execute on function public.current_user_attendance_write_campuses() to authenticated;
grant execute on function public.can_read_attendance_campus(uuid) to authenticated;
grant execute on function public.can_write_attendance_campus(uuid) to authenticated;
grant execute on function public.current_user_can_access_player(uuid) to authenticated;
grant execute on function public.current_user_can_access_guardian(uuid) to authenticated;
grant execute on function public.current_user_can_access_enrollment(uuid) to authenticated;
grant execute on function public.current_user_can_access_team(uuid) to authenticated;
grant execute on function public.current_user_can_access_payment(uuid) to authenticated;
grant execute on function public.current_user_can_access_charge(uuid) to authenticated;
grant execute on function public.current_user_can_access_cash_session(uuid) to authenticated;
grant execute on function public.current_user_can_access_nutrition_player(uuid) to authenticated;
grant execute on function public.current_user_can_access_nutrition_enrollment(uuid) to authenticated;

revoke execute on function public.finance_month_window(text) from public;
revoke execute on function public.finance_month_window(text) from anon;
revoke execute on function public.get_balance_kpis(uuid) from public;
revoke execute on function public.get_balance_kpis(uuid) from anon;
revoke execute on function public.finance_payment_facts(timestamptz, timestamptz, uuid) from public;
revoke execute on function public.finance_payment_facts(timestamptz, timestamptz, uuid) from anon;
revoke execute on function public.finance_charge_facts(text, uuid) from public;
revoke execute on function public.finance_charge_facts(text, uuid) from anon;
revoke execute on function public.finance_refund_facts(timestamptz, timestamptz, uuid) from public;
revoke execute on function public.finance_refund_facts(timestamptz, timestamptz, uuid) from anon;
revoke execute on function public.get_dashboard_finance_summary(text, uuid) from public;
revoke execute on function public.get_dashboard_finance_summary(text, uuid) from anon;
revoke execute on function public.get_resumen_mensual_summary(text, uuid) from public;
revoke execute on function public.get_resumen_mensual_summary(text, uuid) from anon;
revoke execute on function public.get_corte_semanal_summary(text, uuid) from public;
revoke execute on function public.get_corte_semanal_summary(text, uuid) from anon;
revoke execute on function public.get_finance_reconciliation_summary(uuid) from public;
revoke execute on function public.get_finance_reconciliation_summary(uuid) from anon;
revoke execute on function public.get_latest_finance_reconciliation_snapshot(uuid) from public;
revoke execute on function public.get_latest_finance_reconciliation_snapshot(uuid) from anon;
revoke execute on function public.list_finance_reconciliation_drift(uuid, integer) from public;
revoke execute on function public.list_finance_reconciliation_drift(uuid, integer) from anon;
revoke execute on function public.get_porto_datos_generales(date) from public;
revoke execute on function public.get_porto_datos_generales(date) from anon;

grant execute on function public.finance_month_window(text) to authenticated;
grant execute on function public.get_balance_kpis(uuid) to authenticated;
grant execute on function public.finance_payment_facts(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.finance_charge_facts(text, uuid) to authenticated;
grant execute on function public.finance_refund_facts(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.get_dashboard_finance_summary(text, uuid) to authenticated;
grant execute on function public.get_resumen_mensual_summary(text, uuid) to authenticated;
grant execute on function public.get_corte_semanal_summary(text, uuid) to authenticated;
grant execute on function public.get_finance_reconciliation_summary(uuid) to authenticated;
grant execute on function public.get_latest_finance_reconciliation_snapshot(uuid) to authenticated;
grant execute on function public.list_finance_reconciliation_drift(uuid, integer) to authenticated;
grant execute on function public.get_porto_datos_generales(date) to authenticated;

revoke execute on function public.list_auth_users() from public;
revoke execute on function public.list_auth_users() from anon;
revoke execute on function public.merge_players(uuid, uuid, uuid, text) from public;
revoke execute on function public.merge_players(uuid, uuid, uuid, text) from anon;
revoke execute on function public.nuke_player(uuid) from public;
revoke execute on function public.nuke_player(uuid) from anon;
revoke execute on function public.repair_payment_allocations(uuid, uuid[], uuid[], jsonb) from public;
revoke execute on function public.repair_payment_allocations(uuid, uuid[], uuid[], jsonb) from anon;
revoke execute on function public.record_payment_refund(uuid, public.payment_method, timestamptz, text, text) from public;
revoke execute on function public.record_payment_refund(uuid, public.payment_method, timestamptz, text, text) from anon;
revoke execute on function public.reassign_payment_to_charges(uuid, uuid[]) from public;
revoke execute on function public.reassign_payment_to_charges(uuid, uuid[]) from anon;
revoke execute on function public.list_active_birth_years_by_campus() from public;
revoke execute on function public.list_active_birth_years_by_campus() from anon;
revoke execute on function public.list_caja_players_by_campus_year(uuid, integer) from public;
revoke execute on function public.list_caja_players_by_campus_year(uuid, integer) from anon;
revoke execute on function public.search_players_for_caja(text) from public;
revoke execute on function public.search_players_for_caja(text) from anon;
revoke execute on function public.list_pending_enrollments_full(uuid) from public;
revoke execute on function public.list_pending_enrollments_full(uuid) from anon;
revoke execute on function public.list_teams_with_counts() from public;
revoke execute on function public.list_teams_with_counts() from anon;

grant execute on function public.list_auth_users() to authenticated;
grant execute on function public.merge_players(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.nuke_player(uuid) to authenticated;
grant execute on function public.repair_payment_allocations(uuid, uuid[], uuid[], jsonb) to authenticated;
grant execute on function public.record_payment_refund(uuid, public.payment_method, timestamptz, text, text) to authenticated;
grant execute on function public.reassign_payment_to_charges(uuid, uuid[]) to authenticated;
grant execute on function public.list_active_birth_years_by_campus() to authenticated;
grant execute on function public.list_caja_players_by_campus_year(uuid, integer) to authenticated;
grant execute on function public.search_players_for_caja(text) to authenticated;
grant execute on function public.list_pending_enrollments_full(uuid) to authenticated;
grant execute on function public.list_teams_with_counts() to authenticated;
