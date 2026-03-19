-- ── merge_players() — atomic player deduplication ────────────────────────────
--
-- Re-points all FK references from the duplicate to the master player,
-- then deletes the duplicate. Runs in a single transaction so it's all-or-nothing.
--
-- Tables updated:
--   enrollments        (player_id)
--   player_guardians   (player_id, with ON CONFLICT to skip already-linked guardians)
--   uniform_orders     (player_id)
--
-- Restrictions:
--   - Both players must exist
--   - Both players cannot have an active enrollment simultaneously
--   - master and duplicate must be different players
--
-- Access: director_admin only (enforced at the app layer via is_director_admin())

CREATE OR REPLACE FUNCTION public.merge_players(
  p_master_id    uuid,
  p_duplicate_id uuid,
  p_actor_id     uuid,
  p_reason       text DEFAULT 'Fusión de jugadores duplicados'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_master_active   int;
  v_dup_active      int;
  v_master_exists   int;
  v_dup_exists      int;
BEGIN
  IF p_master_id = p_duplicate_id THEN
    RAISE EXCEPTION 'master_and_duplicate_same';
  END IF;

  SELECT COUNT(*) INTO v_master_exists FROM public.players WHERE id = p_master_id;
  SELECT COUNT(*) INTO v_dup_exists    FROM public.players WHERE id = p_duplicate_id;
  IF v_master_exists = 0 THEN RAISE EXCEPTION 'master_not_found'; END IF;
  IF v_dup_exists    = 0 THEN RAISE EXCEPTION 'duplicate_not_found'; END IF;

  -- Cannot merge if both have an active enrollment (would violate unique constraint)
  SELECT COUNT(*) INTO v_master_active FROM public.enrollments WHERE player_id = p_master_id    AND status = 'active';
  SELECT COUNT(*) INTO v_dup_active    FROM public.enrollments WHERE player_id = p_duplicate_id AND status = 'active';
  IF v_master_active > 0 AND v_dup_active > 0 THEN
    RAISE EXCEPTION 'both_have_active_enrollment';
  END IF;

  -- Re-point enrollments (all statuses — full history moves to master)
  UPDATE public.enrollments
  SET player_id = p_master_id
  WHERE player_id = p_duplicate_id;

  -- Re-point guardians (skip any already linked to master to avoid unique constraint violation)
  INSERT INTO public.player_guardians (player_id, guardian_id, is_primary)
  SELECT p_master_id, pg.guardian_id, pg.is_primary
  FROM   public.player_guardians pg
  WHERE  pg.player_id = p_duplicate_id
  ON CONFLICT (player_id, guardian_id) DO NOTHING;

  DELETE FROM public.player_guardians WHERE player_id = p_duplicate_id;

  -- Re-point uniform orders
  UPDATE public.uniform_orders
  SET player_id = p_master_id
  WHERE player_id = p_duplicate_id;

  -- Audit log
  INSERT INTO public.audit_logs (event_at, actor_user_id, action, table_name, record_id, after_data)
  VALUES (
    now(),
    p_actor_id,
    'merge_players',
    'players',
    p_master_id,
    jsonb_build_object(
      'master_id',    p_master_id,
      'duplicate_id', p_duplicate_id,
      'reason',       p_reason
    )
  );

  -- Delete the now-orphaned duplicate
  DELETE FROM public.players WHERE id = p_duplicate_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_players(uuid, uuid, uuid, text) TO authenticated;
