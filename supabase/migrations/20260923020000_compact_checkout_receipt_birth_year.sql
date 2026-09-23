-- Extend only new snapshots; historical receipts and checkout guards stay intact.
do $$
declare
  definition text;
  marker text := '''playerName'',(select concat_ws('' '',first_name,last_name) from public.players where id=e.player_id),';
begin
  definition := pg_get_functiondef('public.checkout_explicit_cart(uuid,uuid,uuid,uuid,jsonb)'::regprocedure);
  if (length(definition)-length(replace(definition,marker,'')))/length(marker) <> 1
    or strpos(definition,'''birthYear''') > 0 then
    raise exception 'checkout_receipt_birth_year_drift';
  end if;
  execute replace(definition,marker,marker || E'\n    ''birthYear'',(select extract(year from birth_date)::integer from public.players where id=e.player_id),');
end $$;
