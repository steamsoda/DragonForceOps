-- Fix: rewrite list_pending_enrollments_full to eliminate the JOIN fan-out bug.
--
-- The 20260319030000 migration rewrote this RPC for performance using a
-- "one-pass aggregate" that joins enrollments → charges AND payments in the
-- same FROM clause:
--
--   FROM enrollments e
--   LEFT JOIN charges  ch  ON ch.enrollment_id = e.id
--   LEFT JOIN payments pay ON pay.enrollment_id = e.id
--   GROUP BY e.id
--
-- This produces a Cartesian product: (charge count × payment count) rows per
-- enrollment. Each charge is counted once per payment, and vice versa.
--
-- Example — 3 charges ($750,$750,$600 = $2,100) and 2 payments ($600,$600 = $1,200):
--   6 rows produced → SUM(charges) = $4,200  SUM(payments) = $3,600
--   RPC balance  = $600   ← WRONG
--   Correct balance = $900
--
-- Fix: aggregate charges and payments in separate CTEs first, then join.
-- This matches the pattern used by v_enrollment_balances (the correct view).

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
  WITH charge_totals AS (
    SELECT
      ch.enrollment_id,
      COALESCE(SUM(ch.amount) FILTER (WHERE ch.status <> 'void'), 0)           AS total_charges,
      MIN(ch.due_date)        FILTER (WHERE ch.status <> 'void'
                                       AND ch.due_date IS NOT NULL)            AS earliest_due_date
    FROM public.charges ch
    GROUP BY ch.enrollment_id
  ),
  payment_totals AS (
    SELECT
      pay.enrollment_id,
      COALESCE(SUM(pay.amount) FILTER (WHERE pay.status = 'posted'), 0)        AS total_payments
    FROM public.payments pay
    GROUP BY pay.enrollment_id
  ),
  active_balances AS (
    SELECT
      e.id         AS enrollment_id,
      e.player_id,
      e.campus_id,
      COALESCE(ct.total_charges,  0) -
      COALESCE(pt.total_payments, 0)                                           AS balance,
      ct.earliest_due_date
    FROM public.enrollments e
    LEFT JOIN charge_totals  ct ON ct.enrollment_id = e.id
    LEFT JOIN payment_totals pt ON pt.enrollment_id = e.id
    WHERE e.status = 'active'
      AND (p_campus_id IS NULL OR e.campus_id = p_campus_id)
  )
  SELECT
    ab.enrollment_id,
    ab.player_id,
    ab.campus_id,
    p.first_name          AS player_first_name,
    p.last_name           AS player_last_name,
    c.name                AS campus_name,
    c.code                AS campus_code,
    g.phone_primary,
    ab.balance,
    t.id                  AS team_id,
    t.name                AS team_name,
    ab.earliest_due_date
  FROM active_balances ab
  JOIN public.players  p ON p.id = ab.player_id
  JOIN public.campuses c ON c.id = ab.campus_id
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
