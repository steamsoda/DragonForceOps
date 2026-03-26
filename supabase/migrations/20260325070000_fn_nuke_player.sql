-- Atomically delete all data associated with a player.
-- Runs in a single transaction. SECURITY DEFINER bypasses RLS for the delete cascade.
-- Authorization is enforced at the application layer (superadmin only).
--
-- Delete order (children before parents):
--   cash_session_entries  → payment_id
--   payment_allocations   → payment_id
--   payments              → enrollment_id
--   charges               → enrollment_id
--   team_assignments      → enrollment_id
--   uniform_orders        → enrollment_id / player_id
--   enrollments           → player_id
--   player_guardians      → player_id
--   guardians             (orphans only — not linked to any other player)
--   players               → id

create or replace function public.nuke_player(p_player_id uuid)
  returns void language plpgsql security definer
  as $$
  declare
    v_enrollment_ids  uuid[];
    v_payment_ids     uuid[];
    v_guardian_ids    uuid[];
  begin
    -- Verify player exists
    if not exists (select 1 from public.players where id = p_player_id) then
      raise exception 'player_not_found';
    end if;

    -- Collect enrollment IDs
    select array_agg(id) into v_enrollment_ids
    from public.enrollments
    where player_id = p_player_id;

    if v_enrollment_ids is not null then
      -- Collect payment IDs
      select array_agg(id) into v_payment_ids
      from public.payments
      where enrollment_id = any(v_enrollment_ids);

      if v_payment_ids is not null then
        delete from public.cash_session_entries  where payment_id    = any(v_payment_ids);
        delete from public.payment_allocations   where payment_id    = any(v_payment_ids);
        delete from public.payments              where id            = any(v_payment_ids);
      end if;

      delete from public.charges          where enrollment_id = any(v_enrollment_ids);
      delete from public.team_assignments where enrollment_id = any(v_enrollment_ids);
      delete from public.uniform_orders   where enrollment_id = any(v_enrollment_ids);
      delete from public.enrollments      where id            = any(v_enrollment_ids);
    end if;

    -- Any uniform_orders still attached by player_id only (edge case)
    delete from public.uniform_orders where player_id = p_player_id;

    -- Collect guardians only linked to this player (not shared with others)
    select array_agg(g.id) into v_guardian_ids
    from public.guardians g
    join public.player_guardians pg on pg.guardian_id = g.id
    where pg.player_id = p_player_id
      and not exists (
        select 1 from public.player_guardians pg2
        where pg2.guardian_id = g.id
          and pg2.player_id  != p_player_id
      );

    delete from public.player_guardians where player_id = p_player_id;

    if v_guardian_ids is not null then
      delete from public.guardians where id = any(v_guardian_ids);
    end if;

    delete from public.players where id = p_player_id;
  end;
  $$;

grant execute on function public.nuke_player(uuid) to authenticated;
