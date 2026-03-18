-- RPC: get_balance_kpis
-- Returns pending balance total + count of enrollments with a positive balance.
-- Avoids the large .in(enrollment_id, [...672 ids]) pattern that silently returns
-- empty results when URL length is exceeded.
CREATE OR REPLACE FUNCTION public.get_balance_kpis(p_campus_id uuid DEFAULT NULL)
RETURNS TABLE(pending_balance numeric, enrollments_with_balance bigint)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    COALESCE(SUM(b.balance), 0)::numeric  AS pending_balance,
    COUNT(*)::bigint                       AS enrollments_with_balance
  FROM v_enrollment_balances b
  JOIN enrollments e ON e.id = b.enrollment_id
  WHERE e.status = 'active'
    AND b.balance > 0
    AND (p_campus_id IS NULL OR e.campus_id = p_campus_id);
$$;

GRANT EXECUTE ON FUNCTION public.get_balance_kpis(uuid) TO authenticated;
