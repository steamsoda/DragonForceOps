-- Patch generate_monthly_charges() to skip scholarship (beca) enrollments.
-- Scholarship players remain active and count in rosters, but must not receive
-- a monthly_tuition charge (has_scholarship = true).
--
-- This is a full replacement of the function body (only the WHERE clause changed:
-- added `and e.has_scholarship = false`).

create or replace function public.generate_monthly_charges(
  p_period_month date default date_trunc('month', current_date)::date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge_type_id uuid;
  v_due_date       date;
  v_month_name     text;
  v_description    text;
  v_created        integer;
  v_total_active   integer;
begin
  -- Charge type
  select id into v_charge_type_id
    from public.charge_types
    where code = 'monthly_tuition' and is_active = true
    limit 1;

  if v_charge_type_id is null then
    return jsonb_build_object('error', 'charge_type_missing', 'created', 0, 'skipped', 0);
  end if;

  -- Active non-scholarship enrollment count (the universe we charge against)
  select count(*) into v_total_active
    from public.enrollments
    where status = 'active'
      and has_scholarship = false;

  if v_total_active = 0 then
    return jsonb_build_object('created', 0, 'skipped', 0);
  end if;

  -- Last day of the period month
  v_due_date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;

  -- Spanish month name
  v_month_name := case extract(month from p_period_month)::int
    when 1  then 'Enero'      when 2  then 'Febrero'   when 3  then 'Marzo'
    when 4  then 'Abril'      when 5  then 'Mayo'       when 6  then 'Junio'
    when 7  then 'Julio'      when 8  then 'Agosto'     when 9  then 'Septiembre'
    when 10 then 'Octubre'    when 11 then 'Noviembre'  when 12 then 'Diciembre'
  end;

  v_description := 'Mensualidad ' || v_month_name || ' ' || extract(year from p_period_month)::int::text;

  -- Insert charges for active, non-scholarship enrollments that don't already
  -- have one this period.
  -- Regular rate = open-ended tuition rule (day_to IS NULL).
  -- Fallback: highest amount rule for the plan.
  -- Enrollments with no tuition rules are skipped (null amount filtered out by the join).
  insert into public.charges (
    enrollment_id, charge_type_id, period_month, description,
    amount, currency, status, due_date
    -- created_by intentionally omitted (NULL = system-generated)
  )
  select
    e.id,
    v_charge_type_id,
    p_period_month,
    v_description,
    coalesce(
      (select r.amount from public.pricing_plan_tuition_rules r
       where r.pricing_plan_id = e.pricing_plan_id and r.day_to is null
       limit 1),
      (select max(r.amount) from public.pricing_plan_tuition_rules r
       where r.pricing_plan_id = e.pricing_plan_id)
    ),
    pp.currency,
    'pending',
    v_due_date
  from public.enrollments e
  join public.pricing_plans pp on pp.id = e.pricing_plan_id
  where e.status = 'active'
    and e.has_scholarship = false                   -- ← skip beca players
    -- Skip if already charged for this period (idempotent)
    and not exists (
      select 1 from public.charges c
      where c.enrollment_id = e.id
        and c.charge_type_id = v_charge_type_id
        and c.period_month = p_period_month
        and c.status <> 'void'
    )
    -- Skip if no tuition rule found (prevents null amount insert)
    and coalesce(
      (select r.amount from public.pricing_plan_tuition_rules r
       where r.pricing_plan_id = e.pricing_plan_id and r.day_to is null
       limit 1),
      (select max(r.amount) from public.pricing_plan_tuition_rules r
       where r.pricing_plan_id = e.pricing_plan_id)
    ) is not null;

  get diagnostics v_created = row_count;

  return jsonb_build_object(
    'created',      v_created,
    'skipped',      v_total_active - v_created,
    'period_month', p_period_month::text
  );
end;
$$;

-- Permissions unchanged — revoke from public, director/service role only
revoke execute on function public.generate_monthly_charges(date) from public;
