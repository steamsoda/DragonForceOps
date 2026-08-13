create or replace function public.get_product_charge_ledger(
  p_product_id uuid,
  p_paid_from timestamptz default null,
  p_paid_to timestamptz default null,
  p_offset integer default 0,
  p_limit integer default 25
)
returns table (
  charge_id uuid,
  enrollment_id uuid,
  player_name text,
  birth_year integer,
  campus_name text,
  training_group_name text,
  description text,
  amount numeric,
  currency text,
  payment_status text,
  issued_at timestamptz,
  paid_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with target_charges as (
    select charge.*
    from public.charges charge
    where charge.product_id = p_product_id
      and charge.status <> 'void'
  ),
  allocation_progress as (
    select
      allocation.charge_id,
      payment.paid_at,
      allocation.created_at,
      allocation.id,
      sum(allocation.amount) over (
        partition by allocation.charge_id
        order by payment.paid_at, allocation.created_at, allocation.id
        rows between unbounded preceding and current row
      ) as allocated_so_far
    from public.payment_allocations allocation
    join public.payments payment on payment.id = allocation.payment_id
    join target_charges charge on charge.id = allocation.charge_id
    where payment.status = 'posted'
  ),
  payment_summary as (
    select
      progress.charge_id,
      max(progress.allocated_so_far) as allocated_amount,
      min(progress.paid_at) filter (
        where progress.allocated_so_far >= charge.amount
      ) as fully_paid_at
    from allocation_progress progress
    join target_charges charge on charge.id = progress.charge_id
    group by progress.charge_id
  ),
  filtered as (
    select
      charge.id as charge_id,
      enrollment.id as enrollment_id,
      concat_ws(' ', player.first_name, player.last_name) as player_name,
      extract(year from player.birth_date)::integer as birth_year,
      campus.name as campus_name,
      active_group.name as training_group_name,
      charge.description,
      charge.amount,
      charge.currency,
      case
        when coalesce(summary.allocated_amount, 0) >= charge.amount then 'paid'
        else 'pending'
      end as payment_status,
      charge.created_at as issued_at,
      summary.fully_paid_at as paid_at
    from target_charges charge
    join public.enrollments enrollment on enrollment.id = charge.enrollment_id
    join public.players player on player.id = enrollment.player_id
    join public.campuses campus on campus.id = enrollment.campus_id
    left join payment_summary summary on summary.charge_id = charge.id
    left join lateral (
      select training_group.name
      from public.training_group_assignments assignment
      join public.training_groups training_group on training_group.id = assignment.training_group_id
      where assignment.enrollment_id = enrollment.id
        and assignment.end_date is null
      order by assignment.start_date desc, assignment.created_at desc
      limit 1
    ) active_group on true
    where (p_paid_from is null or summary.fully_paid_at >= p_paid_from)
      and (p_paid_to is null or summary.fully_paid_at < p_paid_to)
  )
  select
    filtered.charge_id,
    filtered.enrollment_id,
    filtered.player_name,
    filtered.birth_year,
    filtered.campus_name,
    filtered.training_group_name,
    filtered.description,
    filtered.amount,
    filtered.currency,
    filtered.payment_status,
    filtered.issued_at,
    filtered.paid_at,
    count(*) over () as total_count
  from filtered
  order by coalesce(filtered.paid_at, filtered.issued_at) desc, filtered.issued_at desc, filtered.charge_id
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function public.get_product_charge_ledger(uuid, timestamptz, timestamptz, integer, integer) from public, anon;
grant execute on function public.get_product_charge_ledger(uuid, timestamptz, timestamptz, integer, integer) to authenticated;

comment on function public.get_product_charge_ledger(uuid, timestamptz, timestamptz, integer, integer) is
  'Read-only product charge ledger with current player context and the first posted-payment time at which each charge became fully allocated.';
