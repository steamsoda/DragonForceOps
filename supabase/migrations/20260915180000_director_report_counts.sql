-- Counts only: no monetary columns are returned or summed by this reader RPC.
create or replace function public.director_report_counts(p_month text default null, p_campus_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  first_day date;
  next_day date;
  result jsonb;
begin
  if auth.uid() is null or not public.is_director_readonly() then
    raise exception 'reader_required' using errcode = '42501';
  end if;
  if p_month is not null and p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid_month' using errcode = '22023';
  end if;
  first_day := (coalesce(p_month, to_char(timezone('America/Monterrey', now()), 'YYYY-MM')) || '-01')::date;
  next_day := (first_day + interval '1 month')::date;
  if p_campus_id is not null and not exists(select 1 from public.campuses where id = p_campus_id and is_active) then
    raise exception 'campus_denied' using errcode = '42501';
  end if;
  with scope as (
    select id from public.campuses where is_active and (p_campus_id is null or id = p_campus_id)
  ), payment_rows as (
    select p.method, p.external_source,
      ceil(extract(day from timezone('America/Monterrey', p.paid_at)) / 7.0)::int as week_num
    from public.payments p
    where p.status = 'posted' and p.operator_campus_id in (select id from scope)
      and p.paid_at >= first_day::timestamp at time zone 'America/Monterrey'
      and p.paid_at < next_day::timestamp at time zone 'America/Monterrey'
  ), charge_counts as (
    select coalesce(ct.code, 'other') as code, coalesce(ct.name, 'Otro') as name, count(*) as count
    from public.charges ch join public.enrollments e on e.id = ch.enrollment_id
      left join public.charge_types ct on ct.id = ch.charge_type_id
    where ch.status <> 'void' and e.campus_id in (select id from scope)
      and (ch.period_month = first_day or (ch.period_month is null
        and ch.created_at >= first_day::timestamp at time zone 'America/Monterrey'
        and ch.created_at < next_day::timestamp at time zone 'America/Monterrey'))
    group by ct.code, ct.name
  ), methods as (
    select method, count(*) as count from payment_rows group by method
  ), weeks as (
    select n as "weekNum", (n-1)*7+1 as "startDay", least(n*7, next_day-first_day) as "endDay",
      (select count(*) from payment_rows where week_num=n) as "paymentCount",
      coalesce((select jsonb_agg(jsonb_build_object('method', method) order by method)
        from (select distinct method from payment_rows where week_num=n) m), '[]'::jsonb) as "byMethod"
    from generate_series(1, ceil((next_day-first_day)/7.0)::int) n
  )
  select jsonb_build_object(
    'month', to_char(first_day, 'YYYY-MM'),
    'activeEnrollments', (select count(*) from public.enrollments where status='active' and campus_id in (select id from scope)),
    'paymentCount', (select count(*) from payment_rows),
    'enrollmentsWithBalance', (select count(*) from public.v_enrollment_balances b
      join public.enrollments e on e.id=b.enrollment_id
      where e.status='active' and b.balance > 0 and e.campus_id in (select id from scope)),
    'player360Count', (select count(*) from payment_rows where method='stripe_360player'),
    'historicalCatchupCount', (select count(*) from payment_rows where external_source in ('historical_catchup_contry','historical_catchup_admin')),
    'chargesByType', coalesce((select jsonb_agg(jsonb_build_object('typeCode',code,'typeName',name,'count',count) order by name) from charge_counts),'[]'::jsonb),
    'paymentsByMethod', coalesce((select jsonb_agg(jsonb_build_object('method',method,'count',count) order by method) from methods),'[]'::jsonb),
    'weeks', (select jsonb_agg(to_jsonb(weeks) order by "weekNum") from weeks)
  ) into result;
  return result;
end;
$$;
revoke all on function public.director_report_counts(text, uuid) from public, anon;
grant execute on function public.director_report_counts(text, uuid) to authenticated;
