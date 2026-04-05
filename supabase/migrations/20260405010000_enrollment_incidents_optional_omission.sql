create table if not exists public.enrollment_incidents (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  incident_type text not null check (incident_type in ('absence', 'injury', 'other')),
  note text null,
  omit_period_month date null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz null,
  cancelled_by uuid null references auth.users(id) on delete restrict,
  consumed_at timestamptz null,
  check (omit_period_month is null or omit_period_month = date_trunc('month', omit_period_month)::date)
);

create index if not exists idx_enrollment_incidents_enrollment_created
  on public.enrollment_incidents (enrollment_id, created_at desc);

create index if not exists idx_enrollment_incidents_omit_period
  on public.enrollment_incidents (omit_period_month)
  where omit_period_month is not null;

create unique index if not exists uq_enrollment_incidents_active_omit
  on public.enrollment_incidents (enrollment_id, omit_period_month)
  where omit_period_month is not null and cancelled_at is null;

alter table public.enrollment_incidents enable row level security;

drop policy if exists director_admin_all_enrollment_incidents on public.enrollment_incidents;
create policy director_admin_all_enrollment_incidents on public.enrollment_incidents
  for all to authenticated
  using (public.is_director_admin())
  with check (public.is_director_admin());

drop policy if exists front_desk_read_enrollment_incidents on public.enrollment_incidents;
create policy front_desk_read_enrollment_incidents on public.enrollment_incidents
  for select to authenticated
  using (public.is_front_desk() and public.current_user_can_access_enrollment(enrollment_id));

drop policy if exists front_desk_insert_enrollment_incidents on public.enrollment_incidents;
create policy front_desk_insert_enrollment_incidents on public.enrollment_incidents
  for insert to authenticated
  with check (public.is_front_desk() and public.current_user_can_access_enrollment(enrollment_id));

drop policy if exists front_desk_update_enrollment_incidents on public.enrollment_incidents;
create policy front_desk_update_enrollment_incidents on public.enrollment_incidents
  for update to authenticated
  using (public.is_front_desk() and public.current_user_can_access_enrollment(enrollment_id))
  with check (public.is_front_desk() and public.current_user_can_access_enrollment(enrollment_id));

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
  v_skipped_scholarship integer := 0;
  v_skipped_existing_charge integer := 0;
  v_skipped_by_incident integer := 0;
  v_skipped_other integer := 0;
begin
  select id into v_charge_type_id
  from public.charge_types
  where code = 'monthly_tuition' and is_active = true
  limit 1;

  if v_charge_type_id is null then
    return jsonb_build_object(
      'error', 'charge_type_missing',
      'created', 0,
      'skipped', 0,
      'skipped_existing_charge', 0,
      'skipped_scholarship', 0,
      'skipped_by_incident', 0,
      'skipped_other', 0
    );
  end if;

  select count(*) into v_total_active
  from public.enrollments
  where status = 'active';

  select count(*) into v_skipped_scholarship
  from public.enrollments
  where status = 'active'
    and coalesce(has_scholarship, false) = true;

  with existing_charge_enrollments as (
    select distinct e.id
    from public.enrollments e
    join public.charges c on c.enrollment_id = e.id
    where e.status = 'active'
      and coalesce(e.has_scholarship, false) = false
      and c.charge_type_id = v_charge_type_id
      and c.period_month = p_period_month
      and c.status <> 'void'
  )
  select count(*) into v_skipped_existing_charge
  from existing_charge_enrollments;

  with incident_skipped_enrollments as (
    select distinct e.id
    from public.enrollments e
    join public.enrollment_incidents ei on ei.enrollment_id = e.id
    where e.status = 'active'
      and coalesce(e.has_scholarship, false) = false
      and ei.cancelled_at is null
      and ei.omit_period_month = p_period_month
      and not exists (
        select 1
        from public.charges c
        where c.enrollment_id = e.id
          and c.charge_type_id = v_charge_type_id
          and c.period_month = p_period_month
          and c.status <> 'void'
      )
  )
  select count(*) into v_skipped_by_incident
  from incident_skipped_enrollments;

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
    )
    and not exists (
      select 1
      from public.enrollment_incidents ei
      where ei.enrollment_id = e.id
        and ei.cancelled_at is null
        and ei.omit_period_month = p_period_month
    );

  get diagnostics v_created = row_count;

  update public.enrollment_incidents ei
  set consumed_at = coalesce(ei.consumed_at, now())
  where ei.cancelled_at is null
    and ei.omit_period_month = p_period_month
    and exists (
      select 1
      from public.enrollments e
      where e.id = ei.enrollment_id
        and e.status = 'active'
        and coalesce(e.has_scholarship, false) = false
        and not exists (
          select 1
          from public.charges c
          where c.enrollment_id = e.id
            and c.charge_type_id = v_charge_type_id
            and c.period_month = p_period_month
            and c.status <> 'void'
        )
    );

  v_skipped_other := greatest(
    v_total_active - v_created - v_skipped_scholarship - v_skipped_existing_charge - v_skipped_by_incident,
    0
  );

  return jsonb_build_object(
    'created', v_created,
    'skipped', v_skipped_scholarship + v_skipped_existing_charge + v_skipped_by_incident + v_skipped_other,
    'skipped_existing_charge', v_skipped_existing_charge,
    'skipped_scholarship', v_skipped_scholarship,
    'skipped_by_incident', v_skipped_by_incident,
    'skipped_other', v_skipped_other,
    'period_month', p_period_month::text
  );
end;
$$;

revoke execute on function public.generate_monthly_charges(date) from public;
