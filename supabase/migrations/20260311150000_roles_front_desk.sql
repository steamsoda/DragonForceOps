-- Add superadmin and front_desk roles
-- superadmin: Javi only, full access including config/audit
-- front_desk: daily ops staff, can collect payments via Caja, cannot see financial reports or void payments

insert into public.app_roles (code, name) values
  ('superadmin',   'Super Administrador'),
  ('front_desk',   'Recepción / Caja')
on conflict (code) do nothing;

-- Update is_director_admin to also cover superadmin
-- All existing director_admin policies now automatically apply to superadmin
create or replace function public.is_director_admin()
  returns boolean language sql security definer stable
  as $$
    select exists (
      select 1
      from public.user_roles ur
      join public.app_roles ar on ar.id = ur.role_id
      where ur.user_id = auth.uid()
        and ar.code in ('director_admin', 'superadmin')
    )
  $$;

-- Helper for front_desk role check
create or replace function public.is_front_desk()
  returns boolean language sql security definer stable
  as $$
    select exists (
      select 1
      from public.user_roles ur
      join public.app_roles ar on ar.id = ur.role_id
      where ur.user_id = auth.uid()
        and ar.code = 'front_desk'
    )
  $$;

grant execute on function public.is_front_desk() to authenticated, anon;

-- Helper: any staff with operational access (director_admin, superadmin, or front_desk)
create or replace function public.has_operational_access()
  returns boolean language sql security definer stable
  as $$
    select public.is_director_admin() or public.is_front_desk()
  $$;

grant execute on function public.has_operational_access() to authenticated, anon;

-- ─── front_desk SELECT policies ───────────────────────────────────────────────
-- front_desk can read all operational data (players, enrollments, charges, payments)
-- but NOT audit_logs and NOT financial aggregate reports (enforced at app layer)

create policy front_desk_read_campuses on public.campuses
  for select to authenticated
  using (public.is_front_desk());

create policy front_desk_read_players on public.players
  for select to authenticated
  using (public.is_front_desk());

create policy front_desk_read_guardians on public.guardians
  for select to authenticated
  using (public.is_front_desk());

create policy front_desk_read_player_guardians on public.player_guardians
  for select to authenticated
  using (public.is_front_desk());

create policy front_desk_read_enrollments on public.enrollments
  for select to authenticated
  using (public.is_front_desk());

create policy front_desk_read_teams on public.teams
  for select to authenticated
  using (public.is_front_desk());

create policy front_desk_read_team_assignments on public.team_assignments
  for select to authenticated
  using (public.is_front_desk());

create policy front_desk_read_charge_types on public.charge_types
  for select to authenticated
  using (public.is_front_desk());

create policy front_desk_read_charges on public.charges
  for select to authenticated
  using (public.is_front_desk());

create policy front_desk_read_payments on public.payments
  for select to authenticated
  using (public.is_front_desk());

create policy front_desk_read_payment_allocations on public.payment_allocations
  for select to authenticated
  using (public.is_front_desk());

create policy front_desk_read_pricing_plans on public.pricing_plans
  for select to authenticated
  using (public.is_front_desk());

create policy front_desk_read_pricing_plan_tuition_rules on public.pricing_plan_tuition_rules
  for select to authenticated
  using (public.is_front_desk());

-- front_desk can see cash sessions to verify one is open before accepting cash
create policy front_desk_read_cash_sessions on public.cash_sessions
  for select to authenticated
  using (public.is_front_desk());

-- ─── front_desk WRITE policies ─────────────────────────────────────────────────
-- front_desk can post payments (INSERT only — no update, no void/delete)

create policy front_desk_insert_payments on public.payments
  for insert to authenticated
  with check (public.is_front_desk());

create policy front_desk_insert_payment_allocations on public.payment_allocations
  for insert to authenticated
  with check (public.is_front_desk());

-- front_desk creates cash session entries when accepting cash payments
create policy front_desk_insert_cash_session_entries on public.cash_session_entries
  for insert to authenticated
  with check (public.is_front_desk());

-- front_desk can read their own cash session entries
create policy front_desk_read_cash_session_entries on public.cash_session_entries
  for select to authenticated
  using (public.is_front_desk());

-- ─── app_roles / user_roles: front_desk can read their own role ───────────────
create policy front_desk_read_app_roles on public.app_roles
  for select to authenticated
  using (public.is_front_desk());

create policy front_desk_read_own_user_role on public.user_roles
  for select to authenticated
  using (public.is_front_desk() and user_id = auth.uid());
