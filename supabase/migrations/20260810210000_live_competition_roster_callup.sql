create or replace function public.create_weekly_callup_from_live_competition_roster(
  p_tournament_id uuid,
  p_program text,
  p_week_start date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_snapshot_id uuid;
  v_callup_id uuid;
begin
  if p_tournament_id is null
     or p_program not in ('futbol_para_todos', 'selectivo')
     or p_week_start is null
     or extract(isodow from p_week_start) <> 1 then
    raise exception 'competition_roster_callup_invalid_settings';
  end if;

  v_snapshot_id := public.capture_competition_roster_snapshot(
    p_tournament_id,
    p_program,
    format('Convocatoria semana %s', to_char(p_week_start, 'YYYY-MM-DD')),
    'Copia automatica del plantel al preparar la convocatoria.'
  );

  v_callup_id := public.create_weekly_callup_from_competition_snapshot(
    v_snapshot_id,
    p_program,
    p_week_start
  );

  return v_callup_id;
end;
$$;

revoke all on function public.create_weekly_callup_from_live_competition_roster(uuid, text, date)
  from public, anon;
grant execute on function public.create_weekly_callup_from_live_competition_roster(uuid, text, date)
  to authenticated;

comment on function public.create_weekly_callup_from_live_competition_roster(uuid, text, date) is
  'Creates a ready weekly callup from the current competition roster and captures its immutable audit snapshot in the same transaction.';
