-- Fix PL/pgSQL ambiguity between the RPC's `squad_id` output parameter and
-- the member table's `squad_id` conflict-target column. The organizer is
-- transactional, so failed calls did not leave partial squads or members.

do $migration$
declare
  v_signature regprocedure := to_regprocedure(
    'public.create_or_sync_default_competition_squad(uuid,uuid,text)'
  );
  v_definition text;
  v_fixed_definition text;
begin
  if v_signature is null then
    raise exception 'create_or_sync_default_competition_squad function not found';
  end if;

  select pg_get_functiondef(v_signature)
    into v_definition;

  v_fixed_definition := regexp_replace(
    v_definition,
    'on[[:space:]]+conflict[[:space:]]*\([[:space:]]*squad_id[[:space:]]*,[[:space:]]*enrollment_id[[:space:]]*\)[[:space:]]+do[[:space:]]+nothing',
    'ON CONFLICT ON CONSTRAINT competition_roster_squad_members_squad_id_enrollment_id_key DO NOTHING',
    'i'
  );

  if v_fixed_definition = v_definition then
    if position(
      'ON CONFLICT ON CONSTRAINT COMPETITION_ROSTER_SQUAD_MEMBERS_SQUAD_ID_ENROLLMENT_ID_KEY DO NOTHING'
      in upper(v_definition)
    ) = 0 then
      raise exception 'default competition squad conflict target was not found';
    end if;
    return;
  end if;

  execute v_fixed_definition;
end;
$migration$;
