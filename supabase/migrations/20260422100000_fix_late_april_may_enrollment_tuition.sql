-- Correct late-April enrollment carryover tuition created before the app helper
-- resolved day-21+ charges against the target period's pricing version.
--
-- Scope is intentionally narrow:
--   - May 2026 monthly tuition only
--   - non-void charges at 600
--   - enrollments starting 2026-04-21 through 2026-04-30
-- This can leave already-paid accounts with 100 pending, which is the intended
-- accounting result for May tuition at 700.

with may_rule as (
  select r.id as pricing_rule_id, r.amount
  from public.pricing_plans pp
  join public.pricing_plan_tuition_rules r on r.pricing_plan_id = pp.id
  where pp.plan_code = 'standard'
    and pp.is_active = true
    and pp.effective_start <= date '2026-05-01'
    and (pp.effective_end is null or pp.effective_end >= date '2026-05-01')
    and r.day_from <= 1
    and (r.day_to is null or r.day_to >= 1)
  order by pp.effective_start desc, pp.updated_at desc, r.day_from desc, r.priority asc
  limit 1
),
affected as (
  select c.id
  from public.charges c
  join public.charge_types ct on ct.id = c.charge_type_id
  join public.enrollments e on e.id = c.enrollment_id
  where ct.code = 'monthly_tuition'
    and c.status <> 'void'
    and c.period_month = date '2026-05-01'
    and c.amount = 600
    and e.start_date >= date '2026-04-21'
    and e.start_date <= date '2026-04-30'
)
update public.charges c
set amount = may_rule.amount,
    pricing_rule_id = may_rule.pricing_rule_id,
    updated_at = now()
from may_rule, affected
where c.id = affected.id
  and may_rule.amount = 700;
