-- The grouped roster API verifies user/campus access in application code, then
-- calls this RPC through the server-only service-role client. Keeping the RPC
-- service-role only avoids expensive per-row RLS recursion on the live roster.

create or replace function public.get_player_roster_group_rows(
  p_campus_id uuid,
  p_month_1 date,
  p_month_2 date,
  p_month_3 date,
  p_gender text default null,
  p_birth_year int default null
)
returns table (
  enrollment_id uuid,
  player_id uuid,
  public_player_id text,
  full_name text,
  birth_year int,
  player_level text,
  inscription_date date,
  start_date date,
  training_group_id uuid,
  month_1_state text,
  month_1_latest_paid_at timestamptz,
  month_2_state text,
  month_2_latest_paid_at timestamptz,
  month_3_state text,
  month_3_latest_paid_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      e.id as enrollment_id,
      p.id as player_id,
      p.public_player_id,
      trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) as full_name,
      extract(year from p.birth_date)::int as birth_year,
      p.level as player_level,
      e.inscription_date,
      e.start_date,
      active_tga.training_group_id
    from public.enrollments e
    join public.players p on p.id = e.player_id
    left join lateral (
      select tga.training_group_id
      from public.training_group_assignments tga
      where tga.enrollment_id = e.id
        and tga.end_date is null
      order by tga.start_date desc, tga.created_at desc
      limit 1
    ) active_tga on true
    where e.campus_id = p_campus_id
      and e.status = 'active'
      and p.status = 'active'
      and (p_gender is null or p_gender = '' or p.gender = p_gender)
      and (p_birth_year is null or extract(year from p.birth_date)::int = p_birth_year)
  ),
  charge_rollup as (
    select
      charge_lines.enrollment_id,
      charge_lines.period_month,
      count(*) as charge_count,
      sum(charge_lines.amount) as total_amount,
      sum(charge_lines.allocated_amount) as total_allocated,
      bool_or(charge_lines.has_platform_payment) as has_platform_payment,
      max(charge_lines.latest_paid_at) as latest_paid_at
    from (
      select
        c.id,
        c.enrollment_id,
        c.period_month,
        c.amount,
        coalesce(sum(pa.amount) filter (where pay.status = 'posted'), 0) as allocated_amount,
        coalesce(bool_or(pay.method = 'stripe_360player' and pay.status = 'posted' and pa.amount > 0), false) as has_platform_payment,
        max(pay.paid_at) filter (where pay.status = 'posted' and pa.amount > 0) as latest_paid_at
      from base b
      join public.charges c on c.enrollment_id = b.enrollment_id
      join public.charge_types ct on ct.id = c.charge_type_id
      left join public.payment_allocations pa on pa.charge_id = c.id
      left join public.payments pay on pay.id = pa.payment_id
      where ct.code = 'monthly_tuition'
        and c.status <> 'void'
        and c.period_month in (p_month_1, p_month_2, p_month_3)
      group by c.id, c.enrollment_id, c.period_month, c.amount
    ) charge_lines
    group by charge_lines.enrollment_id, charge_lines.period_month
  )
  select
    b.enrollment_id,
    b.player_id,
    b.public_player_id,
    b.full_name,
    b.birth_year,
    b.player_level,
    b.inscription_date,
    b.start_date,
    b.training_group_id,
    case
      when m1.charge_count is null then 'empty'
      when m1.total_amount - m1.total_allocated > 0.009 then 'pending'
      when m1.has_platform_payment then 'platform'
      else 'paid'
    end as month_1_state,
    m1.latest_paid_at as month_1_latest_paid_at,
    case
      when m2.charge_count is null then 'empty'
      when m2.total_amount - m2.total_allocated > 0.009 then 'pending'
      when m2.has_platform_payment then 'platform'
      else 'paid'
    end as month_2_state,
    m2.latest_paid_at as month_2_latest_paid_at,
    case
      when m3.charge_count is null then 'empty'
      when m3.total_amount - m3.total_allocated > 0.009 then 'pending'
      when m3.has_platform_payment then 'platform'
      else 'paid'
    end as month_3_state,
    m3.latest_paid_at as month_3_latest_paid_at
  from base b
  left join charge_rollup m1 on m1.enrollment_id = b.enrollment_id and m1.period_month = p_month_1
  left join charge_rollup m2 on m2.enrollment_id = b.enrollment_id and m2.period_month = p_month_2
  left join charge_rollup m3 on m3.enrollment_id = b.enrollment_id and m3.period_month = p_month_3
  order by b.full_name;
$$;

revoke execute on function public.get_player_roster_group_rows(uuid, date, date, date, text, int) from public;
revoke execute on function public.get_player_roster_group_rows(uuid, date, date, date, text, int) from anon;
revoke execute on function public.get_player_roster_group_rows(uuid, date, date, date, text, int) from authenticated;
grant execute on function public.get_player_roster_group_rows(uuid, date, date, date, text, int) to service_role;
