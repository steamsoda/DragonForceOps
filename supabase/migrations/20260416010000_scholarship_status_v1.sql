alter table public.enrollments
  add column if not exists scholarship_status text;

update public.enrollments
set scholarship_status = case
  when coalesce(has_scholarship, false) = true then 'full'
  else 'none'
end
where scholarship_status is null;

alter table public.enrollments
  alter column scholarship_status set default 'none';

alter table public.enrollments
  alter column scholarship_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'enrollments_scholarship_status_check'
  ) then
    alter table public.enrollments
      add constraint enrollments_scholarship_status_check
      check (scholarship_status in ('none', 'half', 'full'));
  end if;
end $$;

comment on column public.enrollments.scholarship_status is
  'Enrollment-level monthly tuition scholarship status: none, half, or full.';

update public.enrollments
set has_scholarship = (scholarship_status = 'full')
where has_scholarship is distinct from (scholarship_status = 'full');

create or replace function public.get_porto_datos_generales(
  p_month date default date_trunc('month', current_date)::date
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_first_day date;
  v_last_day  date;

  v_nuevas_total   integer;
  v_nuevas_varonil integer;
  v_nuevas_femenil integer;

  v_retiros_total   integer;
  v_retiros_reasons jsonb;

  v_activos_total      integer;
  v_activos_varonil    integer;
  v_activos_femenil    integer;
  v_activos_becados    integer;
  v_activos_media_beca integer;

  v_deudores_count integer;
  v_pendiente_mxn  numeric;
begin
  v_first_day := date_trunc('month', p_month)::date;
  v_last_day  := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;

  select
    count(*),
    count(*) filter (where pl.gender = 'male'),
    count(*) filter (where pl.gender = 'female')
  into v_nuevas_total, v_nuevas_varonil, v_nuevas_femenil
  from public.enrollments e
  join public.players pl on pl.id = e.player_id
  where e.start_date >= v_first_day
    and e.start_date <= v_last_day;

  select count(*)
  into v_retiros_total
  from public.enrollments
  where status in ('ended', 'cancelled')
    and end_date >= v_first_day
    and end_date <= v_last_day;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('reason', coalesce(dropout_reason, 'no_reason'), 'count', cnt)
      order by cnt desc
    ),
    '[]'::jsonb
  )
  into v_retiros_reasons
  from (
    select
      coalesce(dropout_reason, 'no_reason') as dropout_reason,
      count(*) as cnt
    from public.enrollments
    where status in ('ended', 'cancelled')
      and end_date >= v_first_day
      and end_date <= v_last_day
    group by dropout_reason
  ) sub;

  select
    count(*),
    count(*) filter (where pl.gender = 'male'),
    count(*) filter (where pl.gender = 'female'),
    count(*) filter (where coalesce(e.scholarship_status, 'none') = 'full'),
    count(*) filter (where coalesce(e.scholarship_status, 'none') = 'half')
  into v_activos_total, v_activos_varonil, v_activos_femenil, v_activos_becados, v_activos_media_beca
  from public.enrollments e
  join public.players pl on pl.id = e.player_id
  where e.start_date <= v_last_day
    and (e.end_date is null or e.end_date > v_last_day);

  select
    count(*) filter (where b.balance > 0),
    coalesce(sum(b.balance) filter (where b.balance > 0), 0)
  into v_deudores_count, v_pendiente_mxn
  from public.enrollments e
  join public.v_enrollment_balances b on b.enrollment_id = e.id
  where e.status = 'active';

  return jsonb_build_object(
    'period_first_day', v_first_day,
    'period_last_day',  v_last_day,
    'nuevas_inscripciones', jsonb_build_object(
      'total',   v_nuevas_total,
      'varonil', v_nuevas_varonil,
      'femenil', v_nuevas_femenil
    ),
    'retiros', jsonb_build_object(
      'total',   v_retiros_total,
      'reasons', v_retiros_reasons
    ),
    'activos', jsonb_build_object(
      'total',      v_activos_total,
      'varonil',    v_activos_varonil,
      'femenil',    v_activos_femenil,
      'becados',    v_activos_becados,
      'media_beca', v_activos_media_beca
    ),
    'deudores', jsonb_build_object(
      'count',         v_deudores_count,
      'pendiente_mxn', v_pendiente_mxn
    )
  );
end;
$$;

grant execute on function public.get_porto_datos_generales(date) to authenticated;

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
    and coalesce(scholarship_status, 'none') = 'full';

  with existing_charge_enrollments as (
    select distinct e.id
    from public.enrollments e
    join public.charges c on c.enrollment_id = e.id
    where e.status = 'active'
      and coalesce(e.scholarship_status, 'none') <> 'full'
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
      and coalesce(e.scholarship_status, 'none') <> 'full'
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
    case
      when coalesce(e.scholarship_status, 'none') = 'half' then round(selected_rule.amount * 0.5, 2)
      else selected_rule.amount
    end,
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
    and coalesce(e.scholarship_status, 'none') <> 'full'
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
        and coalesce(e.scholarship_status, 'none') <> 'full'
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
      case
        when coalesce(e.scholarship_status, 'none') = 'half' then round(selected_rule.amount * 0.5, 2)
        else selected_rule.amount
      end as amount
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
      and coalesce(e.scholarship_status, 'none') <> 'full'
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
