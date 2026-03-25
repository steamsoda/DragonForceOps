-- Add contact tracking columns to enrollments for call center mode (P2-16)
alter table public.enrollments
  add column contactado_at    timestamptz null,
  add column contactado_by    uuid        null references auth.users(id) on delete set null,
  add column contactado_notes text        null;

-- Update the pending enrollments RPC to include contact tracking fields
create or replace function public.list_pending_enrollments_full(
  p_campus_id uuid default null
)
returns table(
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
  earliest_due_date  date,
  contactado_at      timestamptz,
  contactado_notes   text
)
language sql stable security definer
as $$
  with charge_totals as (
    select
      ch.enrollment_id,
      coalesce(sum(ch.amount) filter (where ch.status <> 'void'), 0)           as total_charges,
      min(ch.due_date)        filter (where ch.status <> 'void'
                                       and ch.due_date is not null)            as earliest_due_date
    from public.charges ch
    group by ch.enrollment_id
  ),
  payment_totals as (
    select
      pay.enrollment_id,
      coalesce(sum(pay.amount) filter (where pay.status = 'posted'), 0)        as total_payments
    from public.payments pay
    group by pay.enrollment_id
  ),
  active_balances as (
    select
      e.id         as enrollment_id,
      e.player_id,
      e.campus_id,
      e.contactado_at,
      e.contactado_notes,
      coalesce(ct.total_charges,  0) -
      coalesce(pt.total_payments, 0)                                           as balance,
      ct.earliest_due_date
    from public.enrollments e
    left join charge_totals  ct on ct.enrollment_id = e.id
    left join payment_totals pt on pt.enrollment_id = e.id
    where e.status = 'active'
      and (p_campus_id is null or e.campus_id = p_campus_id)
  )
  select
    ab.enrollment_id,
    ab.player_id,
    ab.campus_id,
    p.first_name          as player_first_name,
    p.last_name           as player_last_name,
    c.name                as campus_name,
    c.code                as campus_code,
    g.phone_primary,
    ab.balance,
    t.id                  as team_id,
    t.name                as team_name,
    ab.earliest_due_date,
    ab.contactado_at,
    ab.contactado_notes
  from active_balances ab
  join public.players  p on p.id = ab.player_id
  join public.campuses c on c.id = ab.campus_id
  left join lateral (
    select g2.phone_primary
    from   public.player_guardians pg
    join   public.guardians g2 on g2.id = pg.guardian_id
    where  pg.player_id  = ab.player_id
      and  pg.is_primary = true
    limit  1
  ) g on true
  left join lateral (
    select ta.team_id
    from   public.team_assignments ta
    where  ta.enrollment_id = ab.enrollment_id
      and  ta.end_date      is null
      and  ta.is_primary    = true
    limit  1
  ) ta on true
  left join public.teams t on t.id = ta.team_id
  where ab.balance > 0
  order by ab.balance desc;
$$;

grant execute on function public.list_pending_enrollments_full(uuid) to authenticated;
