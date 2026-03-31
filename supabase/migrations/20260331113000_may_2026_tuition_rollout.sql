create table if not exists public.pricing_plan_enrollment_tuition_rules (
  id uuid primary key default gen_random_uuid(),
  pricing_plan_id uuid not null references public.pricing_plans(id) on delete cascade,
  day_from int not null check (day_from between 1 and 31),
  day_to int null check (day_to is null or day_to between 1 and 31),
  amount numeric(12,2) not null check (amount >= 0),
  charge_month_offset int not null default 0 check (charge_month_offset between 0 and 12),
  priority int not null default 1,
  created_at timestamptz not null default now(),
  check (day_to is null or day_to >= day_from),
  unique (pricing_plan_id, day_from, day_to, charge_month_offset)
);

alter table public.pricing_plan_enrollment_tuition_rules enable row level security;

drop policy if exists director_admin_all_pricing_plan_enrollment_tuition_rules on public.pricing_plan_enrollment_tuition_rules;
create policy director_admin_all_pricing_plan_enrollment_tuition_rules on public.pricing_plan_enrollment_tuition_rules
  for all to authenticated
  using (public.is_director_admin())
  with check (public.is_director_admin());

drop policy if exists front_desk_read_pricing_plan_enrollment_tuition_rules on public.pricing_plan_enrollment_tuition_rules;
create policy front_desk_read_pricing_plan_enrollment_tuition_rules on public.pricing_plan_enrollment_tuition_rules
  for select to authenticated
  using (public.is_front_desk());

do $$
declare
  v_base_standard_plan_id uuid;
  v_may_standard_plan_id uuid;
begin
  select id
    into v_base_standard_plan_id
  from public.pricing_plans
  where plan_code = 'standard'
    and effective_start < date '2026-05-01'
  order by effective_start desc, updated_at desc
  limit 1;

  if v_base_standard_plan_id is null then
    select id
      into v_base_standard_plan_id
    from public.pricing_plans
    where plan_code = 'standard'
    order by effective_start asc, updated_at desc
    limit 1;
  end if;

  if v_base_standard_plan_id is null then
    raise exception 'No standard pricing plan found for May 2026 rollout';
  end if;

  update public.pricing_plans
  set effective_end = date '2026-04-30',
      updated_at = now()
  where id = v_base_standard_plan_id
    and effective_end is distinct from date '2026-04-30';

  select id
    into v_may_standard_plan_id
  from public.pricing_plans
  where plan_code = 'standard'
    and effective_start = date '2026-05-01'
  limit 1;

  if v_may_standard_plan_id is null then
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
      date '2026-05-01',
      null
    from public.pricing_plans
    where id = v_base_standard_plan_id
    returning id into v_may_standard_plan_id;
  else
    update public.pricing_plans
    set effective_end = null,
        is_active = true,
        updated_at = now()
    where id = v_may_standard_plan_id;
  end if;

  insert into public.pricing_plan_items (pricing_plan_id, charge_type_id, amount)
  select v_may_standard_plan_id, charge_type_id, amount
  from public.pricing_plan_items
  where pricing_plan_id = v_base_standard_plan_id
  on conflict (pricing_plan_id, charge_type_id)
    do update set amount = excluded.amount, updated_at = now();

  delete from public.pricing_plan_tuition_rules
  where pricing_plan_id in (v_base_standard_plan_id, v_may_standard_plan_id);

  insert into public.pricing_plan_tuition_rules (
    pricing_plan_id,
    day_from,
    day_to,
    amount,
    priority
  ) values
    (v_base_standard_plan_id, 1, 10, 600, 1),
    (v_base_standard_plan_id, 11, null, 750, 2),
    (v_may_standard_plan_id, 1, 10, 700, 1),
    (v_may_standard_plan_id, 11, null, 900, 2);

  delete from public.pricing_plan_enrollment_tuition_rules
  where pricing_plan_id in (v_base_standard_plan_id, v_may_standard_plan_id);

  insert into public.pricing_plan_enrollment_tuition_rules (
    pricing_plan_id,
    day_from,
    day_to,
    amount,
    charge_month_offset,
    priority
  ) values
    (v_base_standard_plan_id, 1, 10, 600, 0, 1),
    (v_base_standard_plan_id, 11, 20, 300, 0, 2),
    (v_base_standard_plan_id, 21, 31, 600, 1, 3),
    (v_may_standard_plan_id, 1, 10, 700, 0, 1),
    (v_may_standard_plan_id, 11, 20, 350, 0, 2),
    (v_may_standard_plan_id, 21, 31, 700, 1, 3);
end $$;

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
  v_due_date date;
  v_month_name text;
  v_description text;
  v_created integer := 0;
  v_total_active integer := 0;
begin
  select id into v_charge_type_id
  from public.charge_types
  where code = 'monthly_tuition' and is_active = true
  limit 1;

  if v_charge_type_id is null then
    return jsonb_build_object('error', 'charge_type_missing', 'created', 0, 'skipped', 0);
  end if;

  select count(*) into v_total_active
  from public.enrollments
  where status = 'active'
    and coalesce(has_scholarship, false) = false;

  if v_total_active = 0 then
    return jsonb_build_object('created', 0, 'skipped', 0);
  end if;

  v_due_date := (date_trunc('month', p_period_month) + interval '1 month - 1 day')::date;

  v_month_name := case extract(month from p_period_month)::int
    when 1 then 'Enero' when 2 then 'Febrero' when 3 then 'Marzo'
    when 4 then 'Abril' when 5 then 'Mayo' when 6 then 'Junio'
    when 7 then 'Julio' when 8 then 'Agosto' when 9 then 'Septiembre'
    when 10 then 'Octubre' when 11 then 'Noviembre' when 12 then 'Diciembre'
  end;

  v_description := 'Mensualidad ' || v_month_name || ' ' || extract(year from p_period_month)::int::text;

  insert into public.charges (
    enrollment_id,
    charge_type_id,
    period_month,
    description,
    amount,
    currency,
    status,
    due_date,
    pricing_rule_id
  )
  select
    e.id,
    v_charge_type_id,
    p_period_month,
    v_description,
    selected_rule.amount,
    target_plan.currency,
    'pending',
    v_due_date,
    selected_rule.id
  from public.enrollments e
  join public.pricing_plans source_plan on source_plan.id = e.pricing_plan_id
  join lateral (
    select pp.id, pp.currency
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
      and r.day_from <= 1
      and (r.day_to is null or r.day_to >= 1)
    order by r.day_from desc, r.priority asc
    limit 1
  ) selected_rule on true
  where e.status = 'active'
    and coalesce(e.has_scholarship, false) = false
    and not exists (
      select 1
      from public.charges c
      where c.enrollment_id = e.id
        and c.charge_type_id = v_charge_type_id
        and c.period_month = p_period_month
        and c.status <> 'void'
    );

  get diagnostics v_created = row_count;

  return jsonb_build_object(
    'created', v_created,
    'skipped', greatest(v_total_active - v_created, 0),
    'period_month', p_period_month::text
  );
end;
$$;

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

do $$
begin
  perform cron.unschedule('generate-monthly-charges');
exception when others then null;
end $$;

select cron.schedule(
  'generate-monthly-charges',
  '0 6 1 * *',
  $cron$select public.generate_monthly_charges()$cron$
);

do $$
begin
  perform cron.unschedule('reprice-pending-monthly-tuition');
exception when others then null;
end $$;

select cron.schedule(
  'reprice-pending-monthly-tuition',
  '0 6 11 * *',
  $cron$select public.reprice_pending_monthly_tuition()$cron$
);

with repriced as (
  select
    c.id as charge_id,
    selected_rule.id as pricing_rule_id,
    selected_rule.amount
  from public.charges c
  join public.charge_types ct on ct.id = c.charge_type_id and ct.code = 'monthly_tuition'
  join public.enrollments e on e.id = c.enrollment_id
  join public.pricing_plans source_plan on source_plan.id = e.pricing_plan_id
  join lateral (
    select pp.id
    from public.pricing_plans pp
    where pp.plan_code = source_plan.plan_code
      and pp.is_active = true
      and pp.effective_start <= c.period_month
      and (pp.effective_end is null or pp.effective_end >= c.period_month)
    order by pp.effective_start desc, pp.updated_at desc
    limit 1
  ) target_plan on true
  join lateral (
    select r.id, r.amount
    from public.pricing_plan_tuition_rules r
    where r.pricing_plan_id = target_plan.id
      and r.day_from <= 1
      and (r.day_to is null or r.day_to >= 1)
    order by r.day_from desc, r.priority asc
    limit 1
  ) selected_rule on true
  where c.status = 'pending'
    and c.period_month >= date '2026-05-01'
    and coalesce(e.has_scholarship, false) = false
    and not exists (
      select 1
      from public.payment_allocations pa
      where pa.charge_id = c.id
    )
)
update public.charges c
set amount = repriced.amount,
    pricing_rule_id = repriced.pricing_rule_id,
    updated_at = now()
from repriced
where c.id = repriced.charge_id
  and (c.amount is distinct from repriced.amount or c.pricing_rule_id is distinct from repriced.pricing_rule_id);
