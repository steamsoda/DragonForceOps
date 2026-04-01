create or replace function public.reprice_pending_monthly_tuition(
  p_period_month date default date_trunc('month', current_date)::date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge_type_id uuid;
  v_updated integer := 0;
begin
  select id into v_charge_type_id
  from public.charge_types
  where code = 'monthly_tuition' and is_active = true
  limit 1;

  if v_charge_type_id is null then
    return jsonb_build_object('error', 'charge_type_missing', 'updated', 0);
  end if;

  with resolved as (
    select
      c.id as charge_id,
      selected_rule.id as pricing_rule_id,
      selected_rule.amount
    from public.charges c
    join public.enrollments e on e.id = c.enrollment_id
    join public.pricing_plans source_plan on source_plan.id = e.pricing_plan_id
    join lateral (
      select pp.id
      from public.pricing_plans pp
      where pp.plan_code = source_plan.plan_code
        and pp.is_active = true
        and pp.effective_start <= p_period_month
        and (pp.effective_end is null or pp.effective_end >= p_period_month)
      order by pp.effective_start desc, pp.updated_at desc
      limit 1
    ) target_plan on true
    join lateral (
      select r.id, r.amount
      from public.pricing_plan_tuition_rules r
      where r.pricing_plan_id = target_plan.id
        and r.day_from <= 11
        and (r.day_to is null or r.day_to >= 11)
      order by r.day_from desc, r.priority asc
      limit 1
    ) selected_rule on true
    where c.charge_type_id = v_charge_type_id
      and c.status = 'pending'
      and c.period_month = p_period_month
      and coalesce(e.has_scholarship, false) = false
      and not exists (
        select 1
        from public.payment_allocations pa
        where pa.charge_id = c.id
      )
  )
  update public.charges c
  set amount = resolved.amount,
      pricing_rule_id = resolved.pricing_rule_id,
      updated_at = now()
  from resolved
  where c.id = resolved.charge_id
    and (c.amount is distinct from resolved.amount or c.pricing_rule_id is distinct from resolved.pricing_rule_id);

  get diagnostics v_updated = row_count;

  return jsonb_build_object(
    'updated', v_updated,
    'period_month', p_period_month::text
  );
end;
$$;
