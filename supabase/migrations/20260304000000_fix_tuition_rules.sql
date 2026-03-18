-- Idempotently ensure the 2-tier tuition rules exist for the active plan.
-- Handles the case where the previous migration's DO block found no plan
-- (e.g., plan was already renamed or data was in a different state).

do $$
declare
  plan_id uuid;
begin
  -- Accept either name in case migration order differed across environments
  select id into plan_id
    from public.pricing_plans
    where name in ('Plan Mensual', 'Plan Mensual Basico') and is_active = true
    order by (name = 'Plan Mensual') desc
    limit 1;

  if plan_id is null then
    raise notice 'No active pricing plan found — tuition rules not seeded.';
    return;
  end if;

  -- Delete and re-insert to guarantee correct values (handles missing or stale rules)
  delete from public.pricing_plan_tuition_rules where pricing_plan_id = plan_id;

  insert into public.pricing_plan_tuition_rules (pricing_plan_id, day_from, day_to, amount, priority)
  values
    (plan_id, 1,  10,   600, 1),  -- early bird (days 1–10)
    (plan_id, 11, null, 750, 2);  -- regular    (days 11+)

  raise notice 'Tuition rules seeded for plan %', plan_id;
end $$;
