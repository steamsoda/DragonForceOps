-- PostgreSQL does not provide max(uuid). Replace the three UUID selectors in
-- the already-deployed split RPC with deterministic one-row array selectors.
-- The guard makes this migration fail loudly if the expected function shape
-- changes before application.

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.create_or_sync_split_competition_squads(uuid,uuid,text,uuid[])'::regprocedure
  ) into v_definition;

  if v_definition is null or v_definition !~* 'max\(squad\.id\)' then
    raise exception 'competition_roster_split_uuid_selector_not_found';
  end if;

  v_definition := regexp_replace(
    v_definition,
    'max\(squad\.id\)\s+FILTER\s*\(WHERE\s+squad\.squad_kind\s*=\s*''single''\)',
    '(array_agg(squad.id order by squad.id) filter (where squad.squad_kind = ''single''))[1]',
    'gi'
  );
  v_definition := regexp_replace(
    v_definition,
    'max\(squad\.id\)\s+FILTER\s*\(WHERE\s+squad\.squad_kind\s*=\s*''azul''\)',
    '(array_agg(squad.id order by squad.id) filter (where squad.squad_kind = ''azul''))[1]',
    'gi'
  );
  v_definition := regexp_replace(
    v_definition,
    'max\(squad\.id\)\s+FILTER\s*\(WHERE\s+squad\.squad_kind\s*=\s*''blanco''\)',
    '(array_agg(squad.id order by squad.id) filter (where squad.squad_kind = ''blanco''))[1]',
    'gi'
  );

  if v_definition ~* 'max\(squad\.id\)' then
    raise exception 'competition_roster_split_uuid_selector_replacement_failed';
  end if;

  execute v_definition;
end;
$$;
