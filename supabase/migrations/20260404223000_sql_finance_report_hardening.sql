create or replace function public.finance_month_window(p_month text default null)
returns table (
  month_key text,
  previous_month_key text,
  month_date date,
  month_start_ts timestamptz,
  next_month_start_ts timestamptz,
  previous_month_start_ts timestamptz,
  month_start_date date,
  next_month_start_date date,
  month_label text
)
language sql
stable
security definer
set search_path = public
as $$
  with resolved as (
    select
      case
        when coalesce(p_month, '') ~ '^\d{4}-\d{2}$' then p_month
        else to_char(timezone('America/Monterrey', now()), 'YYYY-MM')
      end as month_key
  ),
  base as (
    select
      month_key,
      to_date(month_key || '-01', 'YYYY-MM-DD') as month_date
    from resolved
  ),
  dates as (
    select
      month_key,
      month_date,
      (month_date - interval '1 month')::date as previous_month_date,
      (month_date + interval '1 month')::date as next_month_date
    from base
  )
  select
    d.month_key,
    to_char(d.previous_month_date, 'YYYY-MM') as previous_month_key,
    d.month_date,
    make_timestamptz(
      extract(year from d.month_date)::int,
      extract(month from d.month_date)::int,
      1,
      0,
      0,
      0,
      'America/Monterrey'
    ) as month_start_ts,
    make_timestamptz(
      extract(year from d.next_month_date)::int,
      extract(month from d.next_month_date)::int,
      1,
      0,
      0,
      0,
      'America/Monterrey'
    ) as next_month_start_ts,
    make_timestamptz(
      extract(year from d.previous_month_date)::int,
      extract(month from d.previous_month_date)::int,
      1,
      0,
      0,
      0,
      'America/Monterrey'
    ) as previous_month_start_ts,
    d.month_date as month_start_date,
    d.next_month_date as next_month_start_date,
    format(
      '%s %s',
      (array['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'])[extract(month from d.month_date)::int],
      extract(year from d.month_date)::int
    ) as month_label
  from dates d;
$$;

grant execute on function public.finance_month_window(text) to authenticated;

create or replace function public.get_balance_kpis(p_campus_id uuid default null)
returns table(pending_balance numeric, enrollments_with_balance bigint)
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select b.balance
    from public.v_enrollment_balances b
    join public.enrollments e on e.id = b.enrollment_id
    where e.status = 'active'
      and b.balance > 0
      and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
      and (p_campus_id is null or e.campus_id = p_campus_id)
      and (p_campus_id is null or public.can_access_campus(p_campus_id))
  )
  select
    coalesce(sum(filtered.balance), 0)::numeric as pending_balance,
    count(*)::bigint as enrollments_with_balance
  from filtered;
$$;

grant execute on function public.get_balance_kpis(uuid) to authenticated;

create or replace function public.finance_payment_facts(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_campus_id uuid default null
)
returns table (
  payment_id uuid,
  enrollment_id uuid,
  operator_campus_id uuid,
  paid_at timestamptz,
  paid_date_local date,
  paid_month text,
  method text,
  amount numeric,
  is_360player boolean,
  is_historical_catchup_contry boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as payment_id,
    p.enrollment_id,
    p.operator_campus_id,
    p.paid_at,
    timezone('America/Monterrey', p.paid_at)::date as paid_date_local,
    to_char(timezone('America/Monterrey', p.paid_at), 'YYYY-MM') as paid_month,
    p.method,
    p.amount,
    (p.method = 'stripe_360player') as is_360player,
    (p.external_source = 'historical_catchup_contry') as is_historical_catchup_contry
  from public.payments p
  where p.status = 'posted'
    and p.operator_campus_id in (select campus_id from public.current_user_allowed_campuses())
    and (p_campus_id is null or p.operator_campus_id = p_campus_id)
    and (p_from is null or p.paid_at >= p_from)
    and (p_to is null or p.paid_at < p_to)
    and (p_campus_id is null or public.can_access_campus(p_campus_id));
$$;

grant execute on function public.finance_payment_facts(timestamptz, timestamptz, uuid) to authenticated;

create or replace function public.finance_charge_facts(
  p_month text default null,
  p_campus_id uuid default null
)
returns table (
  charge_id uuid,
  enrollment_id uuid,
  campus_id uuid,
  amount numeric,
  charge_type_code text,
  charge_type_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select * from public.finance_month_window(p_month)
  )
  select
    ch.id as charge_id,
    ch.enrollment_id,
    e.campus_id,
    ch.amount,
    coalesce(ct.code, 'other') as charge_type_code,
    coalesce(ct.name, 'Otro') as charge_type_name
  from public.charges ch
  join public.enrollments e on e.id = ch.enrollment_id
  left join public.charge_types ct on ct.id = ch.charge_type_id
  cross join bounds w
  where ch.status <> 'void'
    and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
    and (p_campus_id is null or e.campus_id = p_campus_id)
    and (
      ch.period_month = w.month_start_date
      or (
        ch.period_month is null
        and ch.created_at >= w.month_start_ts
        and ch.created_at < w.next_month_start_ts
      )
    )
    and (p_campus_id is null or public.can_access_campus(p_campus_id));
$$;

grant execute on function public.finance_charge_facts(text, uuid) to authenticated;

create or replace function public.get_dashboard_finance_summary(
  p_month text default null,
  p_campus_id uuid default null
)
returns table (
  selected_month text,
  active_enrollments bigint,
  enrollments_with_balance bigint,
  pending_balance numeric,
  payments_today numeric,
  payments_this_month numeric,
  monthly_payments_previous numeric,
  monthly_charges_this_month numeric,
  monthly_charges_previous numeric,
  new_enrollments_this_month bigint,
  bajas_this_month bigint,
  payment_count_this_month bigint,
  payments_by_method jsonb,
  player_360_amount numeric,
  player_360_count bigint,
  historical_catchup_amount numeric,
  historical_catchup_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select * from public.finance_month_window(p_month)
  ),
  today_window as (
    select
      make_timestamptz(
        extract(year from timezone('America/Monterrey', now())::date)::int,
        extract(month from timezone('America/Monterrey', now())::date)::int,
        extract(day from timezone('America/Monterrey', now())::date)::int,
        0,
        0,
        0,
        'America/Monterrey'
      ) as today_start_ts,
      make_timestamptz(
        extract(year from (timezone('America/Monterrey', now())::date + 1))::int,
        extract(month from (timezone('America/Monterrey', now())::date + 1))::int,
        extract(day from (timezone('America/Monterrey', now())::date + 1))::int,
        0,
        0,
        0,
        'America/Monterrey'
      ) as tomorrow_start_ts
  ),
  active as (
    select count(*)::bigint as total
    from public.enrollments e
    where e.status = 'active'
      and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
      and (p_campus_id is null or e.campus_id = p_campus_id)
      and (p_campus_id is null or public.can_access_campus(p_campus_id))
  ),
  balance as (
    select * from public.get_balance_kpis(p_campus_id)
  ),
  payments_today as (
    select coalesce(sum(pf.amount), 0)::numeric as total
    from today_window tw
    cross join lateral public.finance_payment_facts(tw.today_start_ts, tw.tomorrow_start_ts, p_campus_id) pf
  ),
  current_payments as (
    select *
    from bounds w
    cross join lateral public.finance_payment_facts(w.month_start_ts, w.next_month_start_ts, p_campus_id) pf
  ),
  previous_payments as (
    select *
    from bounds w
    cross join lateral public.finance_payment_facts(w.previous_month_start_ts, w.month_start_ts, p_campus_id) pf
  ),
  current_charges as (
    select *
    from bounds w
    cross join lateral public.finance_charge_facts(w.month_key, p_campus_id) cf
  ),
  previous_charges as (
    select *
    from bounds w
    cross join lateral public.finance_charge_facts(w.previous_month_key, p_campus_id) cf
  ),
  payments_by_method as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'method', pm.method,
          'methodLabel', case pm.method
            when 'cash' then 'Efectivo'
            when 'transfer' then 'Transferencia'
            when 'card' then 'Tarjeta'
            when 'stripe_360player' then '360Player'
            when 'other' then 'Otro'
            else pm.method
          end,
          'total', pm.total
        )
        order by pm.total desc, pm.method
      ),
      '[]'::jsonb
    ) as payload
    from (
      select method, coalesce(sum(amount), 0)::numeric as total
      from current_payments
      group by method
    ) pm
  ),
  new_enrollments as (
    select count(*)::bigint as total
    from public.enrollments e
    cross join bounds w
    where e.created_at >= w.month_start_ts
      and e.created_at < w.next_month_start_ts
      and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
      and (p_campus_id is null or e.campus_id = p_campus_id)
      and (p_campus_id is null or public.can_access_campus(p_campus_id))
  ),
  bajas as (
    select count(*)::bigint as total
    from public.enrollments e
    cross join bounds w
    where e.status in ('ended', 'cancelled')
      and e.end_date >= w.month_start_date
      and e.end_date < w.next_month_start_date
      and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
      and (p_campus_id is null or e.campus_id = p_campus_id)
      and (p_campus_id is null or public.can_access_campus(p_campus_id))
  )
  select
    w.month_key as selected_month,
    a.total as active_enrollments,
    coalesce(b.enrollments_with_balance, 0)::bigint as enrollments_with_balance,
    coalesce(b.pending_balance, 0)::numeric as pending_balance,
    pt.total as payments_today,
    coalesce((select sum(amount) from current_payments), 0)::numeric as payments_this_month,
    coalesce((select sum(amount) from previous_payments), 0)::numeric as monthly_payments_previous,
    coalesce((select sum(amount) from current_charges), 0)::numeric as monthly_charges_this_month,
    coalesce((select sum(amount) from previous_charges), 0)::numeric as monthly_charges_previous,
    ne.total as new_enrollments_this_month,
    ba.total as bajas_this_month,
    coalesce((select count(*) from current_payments), 0)::bigint as payment_count_this_month,
    pbm.payload as payments_by_method,
    coalesce((select sum(amount) from current_payments where is_360player), 0)::numeric as player_360_amount,
    coalesce((select count(*) from current_payments where is_360player), 0)::bigint as player_360_count,
    coalesce((select sum(amount) from current_payments where is_historical_catchup_contry), 0)::numeric as historical_catchup_amount,
    coalesce((select count(*) from current_payments where is_historical_catchup_contry), 0)::bigint as historical_catchup_count
  from bounds w
  cross join active a
  cross join balance b
  cross join payments_today pt
  cross join payments_by_method pbm
  cross join new_enrollments ne
  cross join bajas ba;
$$;

grant execute on function public.get_dashboard_finance_summary(text, uuid) to authenticated;

create or replace function public.get_resumen_mensual_summary(
  p_month text default null,
  p_campus_id uuid default null
)
returns table (
  month text,
  active_enrollments bigint,
  total_cargos_emitidos numeric,
  total_cobrado numeric,
  pending_balance numeric,
  payment_count bigint,
  charges_by_type jsonb,
  payments_by_method jsonb,
  player_360_amount numeric,
  player_360_count bigint,
  historical_catchup_amount numeric,
  historical_catchup_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select * from public.finance_month_window(p_month)
  ),
  active as (
    select count(*)::bigint as total
    from public.enrollments e
    where e.status = 'active'
      and e.campus_id in (select campus_id from public.current_user_allowed_campuses())
      and (p_campus_id is null or e.campus_id = p_campus_id)
      and (p_campus_id is null or public.can_access_campus(p_campus_id))
  ),
  balance as (
    select * from public.get_balance_kpis(p_campus_id)
  ),
  charge_rows as (
    select *
    from bounds w
    cross join lateral public.finance_charge_facts(w.month_key, p_campus_id) cf
  ),
  payment_rows as (
    select *
    from bounds w
    cross join lateral public.finance_payment_facts(w.month_start_ts, w.next_month_start_ts, p_campus_id) pf
  ),
  charges_by_type as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'typeCode', cbt.charge_type_code,
          'typeName', cbt.charge_type_name,
          'count', cbt.item_count,
          'total', cbt.total
        )
        order by cbt.total desc, cbt.charge_type_name
      ),
      '[]'::jsonb
    ) as payload
    from (
      select
        charge_type_code,
        charge_type_name,
        count(*)::int as item_count,
        coalesce(sum(amount), 0)::numeric as total
      from charge_rows
      group by charge_type_code, charge_type_name
    ) cbt
  ),
  payments_by_method as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'method', pm.method,
          'methodLabel', case pm.method
            when 'cash' then 'Efectivo'
            when 'transfer' then 'Transferencia'
            when 'card' then 'Tarjeta'
            when 'stripe_360player' then '360Player'
            when 'other' then 'Otro'
            else pm.method
          end,
          'count', pm.payment_count,
          'total', pm.total
        )
        order by pm.total desc, pm.method
      ),
      '[]'::jsonb
    ) as payload
    from (
      select
        method,
        count(*)::int as payment_count,
        coalesce(sum(amount), 0)::numeric as total
      from payment_rows
      group by method
    ) pm
  )
  select
    w.month_key as month,
    a.total as active_enrollments,
    coalesce((select sum(amount) from charge_rows), 0)::numeric as total_cargos_emitidos,
    coalesce((select sum(amount) from payment_rows), 0)::numeric as total_cobrado,
    coalesce(b.pending_balance, 0)::numeric as pending_balance,
    coalesce((select count(*) from payment_rows), 0)::bigint as payment_count,
    cbt.payload as charges_by_type,
    pbm.payload as payments_by_method,
    coalesce((select sum(amount) from payment_rows where is_360player), 0)::numeric as player_360_amount,
    coalesce((select count(*) from payment_rows where is_360player), 0)::bigint as player_360_count,
    coalesce((select sum(amount) from payment_rows where is_historical_catchup_contry), 0)::numeric as historical_catchup_amount,
    coalesce((select count(*) from payment_rows where is_historical_catchup_contry), 0)::bigint as historical_catchup_count
  from bounds w
  cross join active a
  cross join balance b
  cross join charges_by_type cbt
  cross join payments_by_method pbm;
$$;

grant execute on function public.get_resumen_mensual_summary(text, uuid) to authenticated;

create or replace function public.get_corte_semanal_summary(
  p_month text default null,
  p_campus_id uuid default null
)
returns table (
  month text,
  month_label text,
  total_cobrado numeric,
  payment_count bigint,
  player_360_amount numeric,
  player_360_count bigint,
  historical_catchup_amount numeric,
  historical_catchup_count bigint,
  weeks jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select * from public.finance_month_window(p_month)
  ),
  payment_rows as (
    select
      pf.*,
      extract(day from pf.paid_date_local)::int as paid_day,
      ceil(extract(day from pf.paid_date_local) / 7.0)::int as week_num
    from bounds w
    cross join lateral public.finance_payment_facts(w.month_start_ts, w.next_month_start_ts, p_campus_id) pf
  ),
  week_series as (
    select
      gs as week_num,
      ((gs - 1) * 7 + 1) as start_day,
      least(
        gs * 7,
        extract(day from ((select next_month_start_date from bounds) - interval '1 day'))::int
      ) as end_day
    from generate_series(
      1,
      ceil(extract(day from ((select next_month_start_date from bounds) - interval '1 day')) / 7.0)::int
    ) gs
  ),
  week_rollups as (
    select
      ws.week_num,
      ws.start_day,
      ws.end_day,
      coalesce(sum(pr.amount), 0)::numeric as total_cobrado,
      count(pr.payment_id)::bigint as payment_count
    from week_series ws
    left join payment_rows pr on pr.week_num = ws.week_num
    group by ws.week_num, ws.start_day, ws.end_day
  ),
  weeks_payload as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'weekNum', wr.week_num,
          'label', format('%s-%s %s', wr.start_day, wr.end_day, (array['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'])[extract(month from (select month_date from bounds))::int]),
          'startDay', wr.start_day,
          'endDay', wr.end_day,
          'totalCobrado', wr.total_cobrado,
          'paymentCount', wr.payment_count,
          'byMethod', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'method', wm.method,
                'methodLabel', case wm.method
                  when 'cash' then 'Efectivo'
                  when 'transfer' then 'Transferencia'
                  when 'card' then 'Tarjeta'
                  when 'stripe_360player' then '360Player'
                  when 'other' then 'Otro'
                  else wm.method
                end,
                'total', wm.total
              )
              order by wm.total desc, wm.method
            )
            from (
              select method, coalesce(sum(amount), 0)::numeric as total
              from payment_rows
              where week_num = wr.week_num
              group by method
            ) wm
          ), '[]'::jsonb)
        )
        order by wr.week_num
      ),
      '[]'::jsonb
    ) as payload
    from week_rollups wr
  )
  select
    w.month_key as month,
    w.month_label,
    coalesce((select sum(amount) from payment_rows), 0)::numeric as total_cobrado,
    coalesce((select count(*) from payment_rows), 0)::bigint as payment_count,
    coalesce((select sum(amount) from payment_rows where is_360player), 0)::numeric as player_360_amount,
    coalesce((select count(*) from payment_rows where is_360player), 0)::bigint as player_360_count,
    coalesce((select sum(amount) from payment_rows where is_historical_catchup_contry), 0)::numeric as historical_catchup_amount,
    coalesce((select count(*) from payment_rows where is_historical_catchup_contry), 0)::bigint as historical_catchup_count,
    wp.payload as weeks
  from bounds w
  cross join weeks_payload wp;
$$;

grant execute on function public.get_corte_semanal_summary(text, uuid) to authenticated;
