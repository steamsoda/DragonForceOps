-- Defensive: ensure enrollment tuition rules exist for all active standard plans.
-- Idempotent: skips plans that already have rules. Covers the case where the
-- May 2026 rollout migration ran but the rules were not inserted (e.g. plan not found at
-- that moment). Rules are derived from effective_start to pick the right tier.
do $$
declare
  v_plan record;
begin
  for v_plan in
    select id, effective_start
    from public.pricing_plans
    where plan_code = 'standard'
      and is_active = true
    order by effective_start
  loop
    if exists (
      select 1
      from public.pricing_plan_enrollment_tuition_rules
      where pricing_plan_id = v_plan.id
    ) then
      continue;
    end if;

    if v_plan.effective_start >= date '2026-05-01' then
      insert into public.pricing_plan_enrollment_tuition_rules
        (pricing_plan_id, day_from, day_to, amount, charge_month_offset, priority)
      values
        (v_plan.id,  1, 10, 700, 0, 1),
        (v_plan.id, 11, 20, 350, 0, 2),
        (v_plan.id, 21, 31, 700, 1, 3);
    else
      insert into public.pricing_plan_enrollment_tuition_rules
        (pricing_plan_id, day_from, day_to, amount, charge_month_offset, priority)
      values
        (v_plan.id,  1, 10, 600, 0, 1),
        (v_plan.id, 11, 20, 300, 0, 2),
        (v_plan.id, 21, 31, 600, 1, 3);
    end if;
  end loop;
end $$;
