-- Admin Oficina can correct non-finance player profile fields from Datos Faltantes / Jugadores.
-- Finance tables and enrollment lifecycle actions remain outside this role.

drop policy if exists office_admin_update_players on public.players;
create policy office_admin_update_players on public.players
  for update to authenticated
  using (
    public.is_office_admin()
    and exists (
      select 1
      from public.enrollments e
      where e.player_id = players.id
    )
  )
  with check (
    public.is_office_admin()
    and exists (
      select 1
      from public.enrollments e
      where e.player_id = players.id
    )
  );
