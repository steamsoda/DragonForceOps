-- Allow Admin Oficina to finish the Datos Faltantes "Guardar datos" create flow.
--
-- The action inserts a guardian and asks PostgREST to return the new id before
-- it can insert the player_guardians link. RLS therefore needs a narrow SELECT
-- path for freshly-created, still-unlinked guardian rows.
drop policy if exists office_admin_read_unlinked_guardians on public.guardians;
create policy office_admin_read_unlinked_guardians on public.guardians
  for select to authenticated
  using (
    public.is_office_admin()
    and not exists (
      select 1
      from public.player_guardians pg
      where pg.guardian_id = guardians.id
    )
  );
