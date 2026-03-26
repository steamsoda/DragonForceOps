-- Expand front_desk role permissions so Caja staff can perform their full job.
-- Also removes the unused admin_restricted role.

-- ── front_desk RLS policies ───────────────────────────────────────────────────

-- charges: create ad-hoc charges and adjust early-bird amounts
create policy front_desk_charges_insert on public.charges
  for insert to authenticated
  with check (public.is_front_desk());

create policy front_desk_charges_update on public.charges
  for update to authenticated
  using  (public.is_front_desk())
  with check (public.is_front_desk());

-- players: create and edit player records
create policy front_desk_players_insert on public.players
  for insert to authenticated
  with check (public.is_front_desk());

create policy front_desk_players_update on public.players
  for update to authenticated
  using  (public.is_front_desk())
  with check (public.is_front_desk());

-- guardians: create and edit guardians (tutores)
create policy front_desk_guardians_insert on public.guardians
  for insert to authenticated
  with check (public.is_front_desk());

create policy front_desk_guardians_update on public.guardians
  for update to authenticated
  using  (public.is_front_desk())
  with check (public.is_front_desk());

-- player_guardians: link guardian to player
create policy front_desk_player_guardians_insert on public.player_guardians
  for insert to authenticated
  with check (public.is_front_desk());

-- enrollments: create new enrollment
create policy front_desk_enrollments_insert on public.enrollments
  for insert to authenticated
  with check (public.is_front_desk());

-- team_assignments: auto-assign team at enrollment
create policy front_desk_team_assignments_insert on public.team_assignments
  for insert to authenticated
  with check (public.is_front_desk());

-- payments: void payment (update status) and delete for rollback cleanup
create policy front_desk_payments_update on public.payments
  for update to authenticated
  using  (public.is_front_desk())
  with check (public.is_front_desk());

create policy front_desk_payments_delete on public.payments
  for delete to authenticated
  using  (public.is_front_desk());

-- payment_allocations: delete allocations when voiding a payment
create policy front_desk_payment_allocations_delete on public.payment_allocations
  for delete to authenticated
  using  (public.is_front_desk());

-- cash_sessions: open (insert) and close (update) cash sessions
create policy front_desk_cash_sessions_insert on public.cash_sessions
  for insert to authenticated
  with check (public.is_front_desk());

create policy front_desk_cash_sessions_update on public.cash_sessions
  for update to authenticated
  using  (public.is_front_desk())
  with check (public.is_front_desk());

-- audit_logs: write audit trail from Caja operations
create policy front_desk_audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (public.is_front_desk());

-- ── Remove admin_restricted role (idempotent) ─────────────────────────────────

delete from public.user_roles
  where role_id = (select id from public.app_roles where code = 'admin_restricted');

delete from public.app_roles where code = 'admin_restricted';
