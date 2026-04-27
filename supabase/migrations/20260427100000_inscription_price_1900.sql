-- Raise inscription price from $1,800 to $1,900 from 2026-04-27 onward.
-- Existing charges are intentionally untouched.

do $$
declare
  v_previous_plan_id uuid;
  v_april_27_plan_id uuid;
  v_inscription_type_id uuid;
  v_effective_date date := date '2026-04-27';
begin
  select id into v_inscription_type_id
  from public.charge_types
  where code = 'inscription'
  limit 1;

  if v_inscription_type_id is null then
    raise exception 'Missing inscription charge type';
  end if;

  select id into v_previous_plan_id
  from public.pricing_plans
  where plan_code = 'standard'
    and is_active = true
    and effective_start < v_effective_date
    and (effective_end is null or effective_end >= v_effective_date)
  order by effective_start desc, updated_at desc
  limit 1;

  if v_previous_plan_id is null then
    raise exception 'No standard pricing plan covers %', v_effective_date;
  end if;

  update public.pricing_plans
  set effective_end = v_effective_date - 1,
      updated_at = now()
  where id = v_previous_plan_id
    and effective_start < v_effective_date
    and (effective_end is null or effective_end >= v_effective_date);

  select id into v_april_27_plan_id
  from public.pricing_plans
  where plan_code = 'standard'
    and effective_start = v_effective_date
  limit 1;

  if v_april_27_plan_id is null then
    insert into public.pricing_plans (
      name,
      currency,
      is_active,
      plan_code,
      effective_start,
      effective_end
    )
    select
      name,
      currency,
      true,
      plan_code,
      v_effective_date,
      date '2026-04-30'
    from public.pricing_plans
    where id = v_previous_plan_id
    returning id into v_april_27_plan_id;
  else
    update public.pricing_plans
    set is_active = true,
        effective_end = date '2026-04-30',
        updated_at = now()
    where id = v_april_27_plan_id;
  end if;

  insert into public.pricing_plan_items (pricing_plan_id, charge_type_id, amount)
  select v_april_27_plan_id, charge_type_id, amount
  from public.pricing_plan_items
  where pricing_plan_id = v_previous_plan_id
  on conflict (pricing_plan_id, charge_type_id)
    do update set amount = excluded.amount, updated_at = now();

  delete from public.pricing_plan_tuition_rules
  where pricing_plan_id = v_april_27_plan_id;

  insert into public.pricing_plan_tuition_rules (
    pricing_plan_id,
    day_from,
    day_to,
    amount,
    priority
  )
  select
    v_april_27_plan_id,
    day_from,
    day_to,
    amount,
    priority
  from public.pricing_plan_tuition_rules
  where pricing_plan_id = v_previous_plan_id;

  delete from public.pricing_plan_enrollment_tuition_rules
  where pricing_plan_id = v_april_27_plan_id;

  insert into public.pricing_plan_enrollment_tuition_rules (
    pricing_plan_id,
    day_from,
    day_to,
    amount,
    charge_month_offset,
    priority
  )
  select
    v_april_27_plan_id,
    day_from,
    day_to,
    amount,
    charge_month_offset,
    priority
  from public.pricing_plan_enrollment_tuition_rules
  where pricing_plan_id = v_previous_plan_id;

  insert into public.pricing_plan_items (pricing_plan_id, charge_type_id, amount)
  select id, v_inscription_type_id, 1900
  from public.pricing_plans
  where plan_code = 'standard'
    and is_active = true
    and effective_start >= v_effective_date
  on conflict (pricing_plan_id, charge_type_id)
    do update set amount = 1900, updated_at = now();
end $$;
