-- Automated monthly charge generation via pg_cron.
--
-- What this migration does:
--   1. Makes charges.created_by nullable so system-generated charges have no user
--   2. Enables the pg_cron extension
--   3. Creates generate_monthly_charges() — same logic as the TypeScript fallback,
--      runs entirely in the DB, SECURITY DEFINER so it bypasses RLS safely
--   4. Schedules the job on day 1 of each month at 06:00 UTC

-- ── 1. Allow NULL for system-generated charges ────────────────────────────────

alter table public.charges alter column created_by drop not null;

-- ── 2. Enable pg_cron ─────────────────────────────────────────────────────────

create extension if not exists pg_cron;

-- ── 3. Generate monthly charges function ─────────────────────────────────────

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

  -- Active enrollment count
  select count(*) into v_total_active
    from public.enrollments
    where status = 'active';

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

  -- Insert charges for active enrollments that don't already have one this period.
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

-- Only director_admin (or postgres/service role) should call this directly
revoke execute on function public.generate_monthly_charges(date) from public;

-- ── 4. Schedule cron job ──────────────────────────────────────────────────────
-- Runs on day 1 of each month at 06:00 UTC.
-- Safe to re-run (unschedule + reschedule pattern).

do $$
begin
  perform cron.unschedule('generate-monthly-charges');
exception when others then null; -- job didn't exist yet, that's fine
end $$;

select cron.schedule(
  'generate-monthly-charges',
  '0 6 1 * *',
  $cron$select public.generate_monthly_charges()$cron$
);
