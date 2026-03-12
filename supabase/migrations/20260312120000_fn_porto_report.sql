-- Porto monthly report — Datos Generales query function.
-- Returns all auto-computable stats for one calendar month.
--
-- p_month: first day of the target month (e.g. '2026-02-01').
--          Defaults to first day of current month.
--
-- Active-at-end-of-month logic (point-in-time):
--   An enrollment was active on the last day of month M if:
--     start_date <= last_day_of_M
--     AND (end_date IS NULL OR end_date > last_day_of_M)
--
-- Deudores / facturación: uses current balance from v_enrollment_balances.
-- This is a current-state metric; for past months it reflects balances today,
-- not balances at end of that month. Acceptable for Phase 1.

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
  v_result    jsonb;

  v_nuevas_total   integer;
  v_nuevas_varonil integer;
  v_nuevas_femenil integer;

  v_retiros_total   integer;
  v_retiros_reasons jsonb;

  v_activos_total   integer;
  v_activos_varonil integer;
  v_activos_femenil integer;
  v_activos_becados integer;

  v_deudores_count    integer;
  v_pendiente_mxn     numeric;
begin
  v_first_day := date_trunc('month', p_month)::date;
  v_last_day  := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;

  -- ── Nuevas inscripciones ──────────────────────────────────────────────────

  select
    count(*),
    count(*) filter (where pl.gender = 'male'),
    count(*) filter (where pl.gender = 'female')
  into v_nuevas_total, v_nuevas_varonil, v_nuevas_femenil
  from public.enrollments e
  join public.players pl on pl.id = e.player_id
  where e.start_date >= v_first_day
    and e.start_date <= v_last_day;

  -- ── Retiros ───────────────────────────────────────────────────────────────

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

  -- ── Activos al fin del mes (point-in-time) ────────────────────────────────

  select
    count(*),
    count(*) filter (where pl.gender = 'male'),
    count(*) filter (where pl.gender = 'female'),
    count(*) filter (where e.has_scholarship = true)
  into v_activos_total, v_activos_varonil, v_activos_femenil, v_activos_becados
  from public.enrollments e
  join public.players pl on pl.id = e.player_id
  where e.start_date <= v_last_day
    and (e.end_date is null or e.end_date > v_last_day);

  -- ── Deudores y facturación pendiente (current state) ─────────────────────

  select
    count(*) filter (where b.balance > 0),
    coalesce(sum(b.balance) filter (where b.balance > 0), 0)
  into v_deudores_count, v_pendiente_mxn
  from public.enrollments e
  join public.v_enrollment_balances b on b.enrollment_id = e.id
  where e.status = 'active';

  -- ── Assemble result ───────────────────────────────────────────────────────

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
      'total',   v_activos_total,
      'varonil', v_activos_varonil,
      'femenil', v_activos_femenil,
      'becados', v_activos_becados
    ),
    'deudores', jsonb_build_object(
      'count',         v_deudores_count,
      'pendiente_mxn', v_pendiente_mxn
    )
  );
end;
$$;

grant execute on function public.get_porto_datos_generales(date) to authenticated;
