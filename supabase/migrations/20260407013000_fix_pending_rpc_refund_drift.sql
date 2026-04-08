-- Align pending-enrollment balance semantics with v_enrollment_balances after refunds.
-- Without this, Pendientes and active-player debt chips can understate debt after a refund,
-- because the RPC was subtracting posted payments but not adding refunded amounts back.

drop function if exists public.list_pending_enrollments_full(uuid);

create or replace function public.list_pending_enrollments_full(
  p_campus_id uuid default null
)
returns table(
  enrollment_id      uuid,
  player_id          uuid,
  campus_id          uuid,
  player_first_name  text,
  player_last_name   text,
  birth_date         date,
  campus_name        text,
  campus_code        text,
  phone_primary      text,
  balance            numeric,
  team_id            uuid,
  team_name          text,
  earliest_due_date  date,
  follow_up_status   text,
  follow_up_at       timestamptz,
  follow_up_note     text,
  promise_date       date
)
language sql stable security definer
set search_path = public
as $$
  with charge_totals as (
    select
      ch.enrollment_id,
      coalesce(sum(ch.amount) filter (where ch.status <> 'void'), 0) as total_charges,
      min(ch.due_date) filter (
        where ch.status <> 'void'
          and ch.due_date is not null
      ) as earliest_due_date
    from public.charges ch
    group by ch.enrollment_id
  ),
  payment_totals as (
    select
      pay.enrollment_id,
      coalesce(sum(pay.amount) filter (where pay.status = 'posted'), 0) as total_payments
    from public.payments pay
    group by pay.enrollment_id
  ),
  refund_totals as (
    select
      pr.enrollment_id,
      coalesce(sum(pr.amount), 0) as total_refunds
    from public.payment_refunds pr
    group by pr.enrollment_id
  ),
  active_balances as (
    select
      e.id as enrollment_id,
      e.player_id,
      e.campus_id,
      e.follow_up_status,
      e.follow_up_at,
      e.follow_up_note,
      e.promise_date,
      (
        coalesce(ct.total_charges, 0)
        - coalesce(pt.total_payments, 0)
        + coalesce(rt.total_refunds, 0)
      ) as balance,
      ct.earliest_due_date
    from public.enrollments e
    left join charge_totals ct on ct.enrollment_id = e.id
    left join payment_totals pt on pt.enrollment_id = e.id
    left join refund_totals rt on rt.enrollment_id = e.id
    where e.status = 'active'
      and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
      and (p_campus_id is null or e.campus_id = p_campus_id)
  )
  select
    ab.enrollment_id,
    ab.player_id,
    ab.campus_id,
    p.first_name as player_first_name,
    p.last_name as player_last_name,
    p.birth_date as birth_date,
    c.name as campus_name,
    c.code as campus_code,
    g.phone_primary,
    ab.balance,
    t.id as team_id,
    t.name as team_name,
    ab.earliest_due_date,
    ab.follow_up_status,
    ab.follow_up_at,
    ab.follow_up_note,
    ab.promise_date
  from active_balances ab
  join public.players p on p.id = ab.player_id
  join public.campuses c on c.id = ab.campus_id
  left join lateral (
    select g2.phone_primary
    from public.player_guardians pg
    join public.guardians g2 on g2.id = pg.guardian_id
    where pg.player_id = ab.player_id
      and pg.is_primary = true
    limit 1
  ) g on true
  left join lateral (
    select ta.team_id
    from public.team_assignments ta
    where ta.enrollment_id = ab.enrollment_id
      and ta.end_date is null
      and ta.is_primary = true
    limit 1
  ) ta on true
  left join public.teams t on t.id = ta.team_id
  where ab.balance > 0
  order by p.birth_date, p.first_name, p.last_name;
$$;

grant execute on function public.list_pending_enrollments_full(uuid) to authenticated;
