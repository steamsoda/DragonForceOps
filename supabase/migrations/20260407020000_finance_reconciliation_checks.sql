-- Finance reconciliation helpers.
-- Purpose: give the app one place to verify that pending-collections surfaces,
-- dashboard KPIs, and the canonical live-balance view still agree.

create or replace function public.get_finance_reconciliation_summary(
  p_campus_id uuid default null
)
returns table(
  canonical_pending_balance numeric,
  canonical_enrollments_with_balance bigint,
  pending_rpc_balance numeric,
  pending_rpc_enrollments bigint,
  dashboard_pending_balance numeric,
  dashboard_enrollments_with_balance bigint,
  pending_vs_canonical_balance_drift numeric,
  dashboard_vs_canonical_balance_drift numeric,
  pending_vs_canonical_count_drift bigint,
  dashboard_vs_canonical_count_drift bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with canonical as (
    select * from public.get_balance_kpis(p_campus_id)
  ),
  pending as (
    select
      coalesce(sum(balance), 0)::numeric as pending_balance,
      count(*)::bigint as enrollments_with_balance
    from public.list_pending_enrollments_full(p_campus_id)
  ),
  dashboard as (
    select
      coalesce(d.pending_balance, 0)::numeric as pending_balance,
      coalesce(d.enrollments_with_balance, 0)::bigint as enrollments_with_balance
    from public.get_dashboard_finance_summary(null, p_campus_id) d
  )
  select
    coalesce(c.canonical_pending_balance, 0)::numeric as canonical_pending_balance,
    coalesce(c.canonical_enrollments_with_balance, 0)::bigint as canonical_enrollments_with_balance,
    coalesce(p.pending_balance, 0)::numeric as pending_rpc_balance,
    coalesce(p.enrollments_with_balance, 0)::bigint as pending_rpc_enrollments,
    coalesce(d.pending_balance, 0)::numeric as dashboard_pending_balance,
    coalesce(d.enrollments_with_balance, 0)::bigint as dashboard_enrollments_with_balance,
    (coalesce(p.pending_balance, 0) - coalesce(c.canonical_pending_balance, 0))::numeric as pending_vs_canonical_balance_drift,
    (coalesce(d.pending_balance, 0) - coalesce(c.canonical_pending_balance, 0))::numeric as dashboard_vs_canonical_balance_drift,
    (coalesce(p.enrollments_with_balance, 0) - coalesce(c.canonical_enrollments_with_balance, 0))::bigint as pending_vs_canonical_count_drift,
    (coalesce(d.enrollments_with_balance, 0) - coalesce(c.canonical_enrollments_with_balance, 0))::bigint as dashboard_vs_canonical_count_drift
  from (
    select
      pending_balance as canonical_pending_balance,
      enrollments_with_balance as canonical_enrollments_with_balance
    from canonical
  ) c
  cross join pending p
  cross join dashboard d;
$$;

grant execute on function public.get_finance_reconciliation_summary(uuid) to authenticated;

create or replace function public.list_finance_reconciliation_drift(
  p_campus_id uuid default null,
  p_limit integer default 50
)
returns table(
  enrollment_id uuid,
  player_id uuid,
  player_name text,
  campus_name text,
  canonical_balance numeric,
  pending_rpc_balance numeric,
  balance_drift numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with canonical as (
    select
      e.id as enrollment_id,
      e.player_id,
      trim(concat_ws(' ', p.first_name, p.last_name)) as player_name,
      c.name as campus_name,
      coalesce(b.balance, 0)::numeric(12,2) as canonical_balance
    from public.enrollments e
    join public.players p on p.id = e.player_id
    join public.campuses c on c.id = e.campus_id
    left join public.v_enrollment_balances b on b.enrollment_id = e.id
    where e.status = 'active'
      and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
      and (p_campus_id is null or e.campus_id = p_campus_id)
      and (p_campus_id is null or public.can_access_campus(p_campus_id))
  ),
  pending as (
    select
      enrollment_id,
      player_id,
      trim(concat_ws(' ', player_first_name, player_last_name)) as player_name,
      campus_name,
      coalesce(balance, 0)::numeric(12,2) as pending_rpc_balance
    from public.list_pending_enrollments_full(p_campus_id)
  )
  select
    coalesce(c.enrollment_id, p.enrollment_id) as enrollment_id,
    coalesce(c.player_id, p.player_id) as player_id,
    coalesce(c.player_name, p.player_name) as player_name,
    coalesce(c.campus_name, p.campus_name) as campus_name,
    coalesce(c.canonical_balance, 0)::numeric(12,2) as canonical_balance,
    coalesce(p.pending_rpc_balance, 0)::numeric(12,2) as pending_rpc_balance,
    (coalesce(p.pending_rpc_balance, 0) - coalesce(c.canonical_balance, 0))::numeric(12,2) as balance_drift
  from canonical c
  full outer join pending p on p.enrollment_id = c.enrollment_id
  where
    (coalesce(c.canonical_balance, 0) > 0 or coalesce(p.pending_rpc_balance, 0) > 0)
    and abs(coalesce(p.pending_rpc_balance, 0) - coalesce(c.canonical_balance, 0)) > 0.009
  order by abs(coalesce(p.pending_rpc_balance, 0) - coalesce(c.canonical_balance, 0)) desc, coalesce(c.player_name, p.player_name)
  limit greatest(coalesce(p_limit, 50), 1);
$$;

grant execute on function public.list_finance_reconciliation_drift(uuid, integer) to authenticated;
