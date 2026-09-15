-- Same period/count definitions as the Director report, without currency totals.
create or replace function public.director_porto_counts(
  p_month date default date_trunc('month', current_date)::date
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
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

begin
  if auth.uid() is null or not public.is_director_readonly() then
    raise exception 'reader_required' using errcode = '42501';
  end if;
  v_first_day := date_trunc('month', p_month)::date;
  v_last_day  := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;

  select
    count(*),
    count(*) filter (where pl.gender = 'male'),
    count(*) filter (where pl.gender = 'female')
  into v_nuevas_total, v_nuevas_varonil, v_nuevas_femenil
  from public.enrollments e
  join public.players pl on pl.id = e.player_id
  where e.campus_id in (select id from public.campuses where is_active) and e.start_date >= v_first_day
    and e.start_date <= v_last_day;

  select count(*)
  into v_retiros_total
  from public.enrollments
  where campus_id in (select id from public.campuses where is_active) and status in ('ended', 'cancelled')
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
    where campus_id in (select id from public.campuses where is_active) and status in ('ended', 'cancelled')
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
  where e.campus_id in (select id from public.campuses where is_active) and e.start_date <= v_last_day
    and (e.end_date is null or e.end_date > v_last_day);

  select
    count(*) filter (where b.balance > 0)
  into v_deudores_count
  from public.enrollments e
  join public.v_enrollment_balances b on b.enrollment_id = e.id
  where e.campus_id in (select id from public.campuses where is_active) and e.status = 'active';

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
      'count', v_deudores_count
    )
  );
end;
$$;

revoke all on function public.director_porto_counts(date) from public, anon;
grant execute on function public.director_porto_counts(date) to authenticated;
