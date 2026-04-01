create or replace function public.current_user_can_access_player(p_player_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.player_id = p_player_id
      and public.can_access_campus(e.campus_id)
  );
$$;

grant execute on function public.current_user_can_access_player(uuid) to authenticated, anon;

create or replace function public.current_user_can_access_guardian(p_guardian_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.player_guardians pg
    join public.enrollments e on e.player_id = pg.player_id
    where pg.guardian_id = p_guardian_id
      and public.can_access_campus(e.campus_id)
  );
$$;

grant execute on function public.current_user_can_access_guardian(uuid) to authenticated, anon;

create or replace function public.current_user_can_access_enrollment(p_enrollment_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.id = p_enrollment_id
      and public.can_access_campus(e.campus_id)
  );
$$;

grant execute on function public.current_user_can_access_enrollment(uuid) to authenticated, anon;

create or replace function public.current_user_can_access_team(p_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and public.can_access_campus(t.campus_id)
  );
$$;

grant execute on function public.current_user_can_access_team(uuid) to authenticated, anon;

create or replace function public.current_user_can_access_payment(p_payment_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.payments p
    join public.enrollments e on e.id = p.enrollment_id
    where p.id = p_payment_id
      and public.can_access_campus(e.campus_id)
  );
$$;

grant execute on function public.current_user_can_access_payment(uuid) to authenticated, anon;

create or replace function public.current_user_can_access_charge(p_charge_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.charges c
    join public.enrollments e on e.id = c.enrollment_id
    where c.id = p_charge_id
      and public.can_access_campus(e.campus_id)
  );
$$;

grant execute on function public.current_user_can_access_charge(uuid) to authenticated, anon;

create or replace function public.current_user_can_access_cash_session(p_cash_session_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.cash_sessions cs
    where cs.id = p_cash_session_id
      and public.can_access_campus(cs.campus_id)
  );
$$;

grant execute on function public.current_user_can_access_cash_session(uuid) to authenticated, anon;

drop policy if exists front_desk_read_campuses on public.campuses;
create policy front_desk_read_campuses on public.campuses
  for select to authenticated
  using (public.is_front_desk() and public.can_access_campus(id));

drop policy if exists front_desk_read_players on public.players;
create policy front_desk_read_players on public.players
  for select to authenticated
  using (public.is_front_desk() and public.current_user_can_access_player(id));

drop policy if exists front_desk_players_update on public.players;
create policy front_desk_players_update on public.players
  for update to authenticated
  using (public.is_front_desk() and public.current_user_can_access_player(id))
  with check (public.is_front_desk() and public.current_user_can_access_player(id));

drop policy if exists front_desk_read_guardians on public.guardians;
create policy front_desk_read_guardians on public.guardians
  for select to authenticated
  using (public.is_front_desk() and public.current_user_can_access_guardian(id));

drop policy if exists front_desk_guardians_update on public.guardians;
create policy front_desk_guardians_update on public.guardians
  for update to authenticated
  using (public.is_front_desk() and public.current_user_can_access_guardian(id))
  with check (public.is_front_desk() and public.current_user_can_access_guardian(id));

drop policy if exists front_desk_read_player_guardians on public.player_guardians;
create policy front_desk_read_player_guardians on public.player_guardians
  for select to authenticated
  using (public.is_front_desk() and public.current_user_can_access_player(player_id));

drop policy if exists front_desk_player_guardians_insert on public.player_guardians;
create policy front_desk_player_guardians_insert on public.player_guardians
  for insert to authenticated
  with check (public.is_front_desk() and public.current_user_can_access_player(player_id));

drop policy if exists front_desk_read_enrollments on public.enrollments;
create policy front_desk_read_enrollments on public.enrollments
  for select to authenticated
  using (public.is_front_desk() and public.can_access_campus(campus_id));

drop policy if exists front_desk_enrollments_insert on public.enrollments;
create policy front_desk_enrollments_insert on public.enrollments
  for insert to authenticated
  with check (public.is_front_desk() and public.can_access_campus(campus_id));

drop policy if exists front_desk_enrollments_update on public.enrollments;
create policy front_desk_enrollments_update on public.enrollments
  for update to authenticated
  using (public.is_front_desk() and public.can_access_campus(campus_id))
  with check (public.is_front_desk() and public.can_access_campus(campus_id));

drop policy if exists front_desk_read_teams on public.teams;
create policy front_desk_read_teams on public.teams
  for select to authenticated
  using (public.is_front_desk() and public.can_access_campus(campus_id));

drop policy if exists front_desk_read_team_assignments on public.team_assignments;
create policy front_desk_read_team_assignments on public.team_assignments
  for select to authenticated
  using (public.is_front_desk() and public.current_user_can_access_enrollment(enrollment_id));

drop policy if exists front_desk_team_assignments_insert on public.team_assignments;
create policy front_desk_team_assignments_insert on public.team_assignments
  for insert to authenticated
  with check (
    public.is_front_desk()
    and public.current_user_can_access_enrollment(enrollment_id)
    and public.current_user_can_access_team(team_id)
  );

drop policy if exists front_desk_read_charges on public.charges;
create policy front_desk_read_charges on public.charges
  for select to authenticated
  using (public.is_front_desk() and public.current_user_can_access_enrollment(enrollment_id));

drop policy if exists front_desk_charges_insert on public.charges;
create policy front_desk_charges_insert on public.charges
  for insert to authenticated
  with check (public.is_front_desk() and public.current_user_can_access_enrollment(enrollment_id));

drop policy if exists front_desk_charges_update on public.charges;
create policy front_desk_charges_update on public.charges
  for update to authenticated
  using (public.is_front_desk() and public.current_user_can_access_enrollment(enrollment_id))
  with check (public.is_front_desk() and public.current_user_can_access_enrollment(enrollment_id));

drop policy if exists front_desk_read_payments on public.payments;
create policy front_desk_read_payments on public.payments
  for select to authenticated
  using (public.is_front_desk() and public.current_user_can_access_enrollment(enrollment_id));

drop policy if exists front_desk_insert_payments on public.payments;
create policy front_desk_insert_payments on public.payments
  for insert to authenticated
  with check (
    public.is_front_desk()
    and public.current_user_can_access_enrollment(enrollment_id)
    and public.can_access_campus(operator_campus_id)
  );

drop policy if exists front_desk_payments_update on public.payments;

drop policy if exists front_desk_payments_delete on public.payments;
create policy front_desk_payments_delete on public.payments
  for delete to authenticated
  using (public.is_front_desk() and public.current_user_can_access_enrollment(enrollment_id));

drop policy if exists front_desk_read_payment_allocations on public.payment_allocations;
create policy front_desk_read_payment_allocations on public.payment_allocations
  for select to authenticated
  using (
    public.is_front_desk()
    and (
      public.current_user_can_access_payment(payment_id)
      or public.current_user_can_access_charge(charge_id)
    )
  );

drop policy if exists front_desk_insert_payment_allocations on public.payment_allocations;
create policy front_desk_insert_payment_allocations on public.payment_allocations
  for insert to authenticated
  with check (
    public.is_front_desk()
    and public.current_user_can_access_payment(payment_id)
    and public.current_user_can_access_charge(charge_id)
  );

drop policy if exists front_desk_payment_allocations_delete on public.payment_allocations;

drop policy if exists front_desk_read_cash_sessions on public.cash_sessions;
create policy front_desk_read_cash_sessions on public.cash_sessions
  for select to authenticated
  using (public.is_front_desk() and public.can_access_campus(campus_id));

drop policy if exists front_desk_cash_sessions_insert on public.cash_sessions;
drop policy if exists front_desk_cash_sessions_update on public.cash_sessions;

drop policy if exists front_desk_read_cash_session_entries on public.cash_session_entries;
create policy front_desk_read_cash_session_entries on public.cash_session_entries
  for select to authenticated
  using (public.is_front_desk() and public.current_user_can_access_cash_session(cash_session_id));

drop policy if exists front_desk_insert_cash_session_entries on public.cash_session_entries;
create policy front_desk_insert_cash_session_entries on public.cash_session_entries
  for insert to authenticated
  with check (public.is_front_desk() and public.current_user_can_access_cash_session(cash_session_id));

drop policy if exists front_desk_read_corte_checkpoints on public.corte_checkpoints;
create policy front_desk_read_corte_checkpoints on public.corte_checkpoints
  for select to authenticated
  using (public.is_front_desk() and public.can_access_campus(campus_id));

drop policy if exists front_desk_insert_corte_checkpoints on public.corte_checkpoints;
create policy front_desk_insert_corte_checkpoints on public.corte_checkpoints
  for insert to authenticated
  with check (public.is_front_desk() and public.can_access_campus(campus_id));

drop policy if exists front_desk_update_corte_checkpoints on public.corte_checkpoints;
create policy front_desk_update_corte_checkpoints on public.corte_checkpoints
  for update to authenticated
  using (public.is_front_desk() and public.can_access_campus(campus_id))
  with check (public.is_front_desk() and public.can_access_campus(campus_id));
