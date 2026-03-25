-- Migrate early bird discount from separate charge records to direct tuition amount adjustment.
--
-- Step A: For every enrollment/period that has BOTH a non-void monthly_tuition charge AND
--         a non-void early_bird_discount charge — update the tuition charge to the early bird rate.
update public.charges tuition
set amount = (
  select pptr.amount
  from   public.pricing_plan_tuition_rules pptr
  join   public.enrollments e on e.pricing_plan_id = pptr.pricing_plan_id
  where  e.id = tuition.enrollment_id
    and  pptr.day_to is not null   -- early bird rule (has a cap day)
  limit  1
)
where tuition.charge_type_id = (select id from public.charge_types where code = 'monthly_tuition')
  and tuition.status != 'void'
  and exists (
    select 1 from public.charges d
    where  d.enrollment_id   = tuition.enrollment_id
      and  d.period_month    = tuition.period_month
      and  d.charge_type_id  = (select id from public.charge_types where code = 'early_bird_discount')
      and  d.status         != 'void'
  );

-- Step B: Void all existing early_bird_discount charges.
update public.charges
set    status = 'void'
where  charge_type_id = (select id from public.charge_types where code = 'early_bird_discount')
  and  status != 'void';
