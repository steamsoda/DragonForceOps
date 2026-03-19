-- ── Performance: rewrite list_pending_enrollments_full ───────────────────────
--
-- Previous version joined against v_enrollment_balances which uses correlated
-- subqueries — one pair (charges + payments) per enrollment row. With 500+
-- active enrollments this means 1000+ sub-queries per RPC call.
--
-- New version computes all balances in a single CTE with one pass over
-- charges + payments, then joins player/campus/guardian/team data.
-- Reduces DB work from O(n) sub-queries to O(1) aggregate scans.

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
  -- One-pass aggregate: compute balance + earliest due date for all active
  -- enrollments matching the campus filter. Then return only those with balance > 0.
  WITH active_balances AS (
    SELECT
      e.id          AS enrollment_id,
      e.player_id,
      e.campus_id,
      COALESCE(SUM(ch.amount)  FILTER (WHERE ch.status  <> 'void'),   0) -
      COALESCE(SUM(pay.amount) FILTER (WHERE pay.status =  'posted'), 0) AS balance,
      MIN(ch.due_date) FILTER (WHERE ch.status <> 'void' AND ch.due_date IS NOT NULL)
                    AS earliest_due_date
    FROM public.enrollments e
    LEFT JOIN public.charges  ch  ON ch.enrollment_id  = e.id
    LEFT JOIN public.payments pay ON pay.enrollment_id = e.id
    WHERE e.status = 'active'
      AND (p_campus_id IS NULL OR e.campus_id = p_campus_id)
    GROUP BY e.id, e.player_id, e.campus_id
  )
  SELECT
    ab.enrollment_id,
    ab.player_id,
    ab.campus_id,
    p.first_name            AS player_first_name,
    p.last_name             AS player_last_name,
    c.name                  AS campus_name,
    c.code                  AS campus_code,
    g.phone_primary,
    ab.balance,
    t.id                    AS team_id,
    t.name                  AS team_name,
    ab.earliest_due_date
  FROM active_balances ab
  JOIN public.players  p ON p.id  = ab.player_id
  JOIN public.campuses c ON c.id  = ab.campus_id
  LEFT JOIN LATERAL (
    SELECT g2.phone_primary
    FROM   public.player_guardians pg
    JOIN   public.guardians g2 ON g2.id = pg.guardian_id
    WHERE  pg.player_id  = ab.player_id
      AND  pg.is_primary = true
    LIMIT  1
  ) g ON true
  LEFT JOIN LATERAL (
    SELECT ta.team_id
    FROM   public.team_assignments ta
    WHERE  ta.enrollment_id = ab.enrollment_id
      AND  ta.end_date      IS NULL
      AND  ta.is_primary    = true
    LIMIT  1
  ) ta ON true
  LEFT JOIN public.teams t ON t.id = ta.team_id
  WHERE ab.balance > 0
  ORDER BY ab.balance DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_pending_enrollments_full(uuid) TO authenticated;
