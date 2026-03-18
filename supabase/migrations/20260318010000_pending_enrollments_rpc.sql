-- RPC: list_pending_enrollments_full
-- Returns all active enrollments with a positive balance, with player name,
-- campus, primary phone, team, and earliest unpaid due date — all in one
-- server-side join. Replaces the multi-step fetch-IDs → .in() pattern that
-- silently returned empty results when URL length was exceeded.
CREATE OR REPLACE FUNCTION public.list_pending_enrollments_full(
  p_campus_id uuid DEFAULT NULL
)
RETURNS TABLE(
  enrollment_id      uuid,
  player_id          uuid,
  campus_id          uuid,
  player_first_name  text,
  player_last_name   text,
  campus_name        text,
  campus_code        text,
  phone_primary      text,
  balance            numeric,
  team_id            uuid,
  team_name          text,
  earliest_due_date  date
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    e.id                    AS enrollment_id,
    e.player_id,
    e.campus_id,
    p.first_name            AS player_first_name,
    p.last_name             AS player_last_name,
    c.name                  AS campus_name,
    c.code                  AS campus_code,
    g.phone_primary,
    b.balance,
    t.id                    AS team_id,
    t.name                  AS team_name,
    (
      SELECT MIN(ch.due_date)
      FROM public.charges ch
      WHERE ch.enrollment_id = e.id
        AND ch.status <> 'void'
        AND ch.due_date IS NOT NULL
    )                       AS earliest_due_date
  FROM public.v_enrollment_balances b
  JOIN public.enrollments e  ON e.id = b.enrollment_id
  JOIN public.players     p  ON p.id = e.player_id
  JOIN public.campuses    c  ON c.id = e.campus_id
  LEFT JOIN LATERAL (
    SELECT g2.phone_primary
    FROM public.player_guardians pg
    JOIN public.guardians g2 ON g2.id = pg.guardian_id
    WHERE pg.player_id = e.player_id
      AND pg.is_primary = true
    LIMIT 1
  ) g ON true
  LEFT JOIN LATERAL (
    SELECT ta.team_id
    FROM public.team_assignments ta
    WHERE ta.enrollment_id = e.id
      AND ta.end_date IS NULL
      AND ta.is_primary = true
    LIMIT 1
  ) ta ON true
  LEFT JOIN public.teams t ON t.id = ta.team_id
  WHERE e.status = 'active'
    AND b.balance > 0
    AND (p_campus_id IS NULL OR e.campus_id = p_campus_id)
  ORDER BY b.balance DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_pending_enrollments_full(uuid) TO authenticated;
