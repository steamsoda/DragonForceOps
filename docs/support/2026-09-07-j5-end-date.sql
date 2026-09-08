-- User-confirmed tournament end date. Payment/pricing windows stay unchanged.
do $$
declare
  v_before jsonb;
  v_after jsonb;
  v_count integer;
begin
  if exists (select 1 from public.audit_logs where request_id = 'repair.j5-end-date.20260907') then
    return;
  end if;
  perform 1 from public.tournaments
    where id in ('36df1698-9196-4561-94f1-aa070c45a1e0', '3e62a6b4-483f-43a7-b8e3-3471f0efd6ed')
    order by id for update;
  select count(*), jsonb_agg(to_jsonb(t)) into v_count, v_before
    from public.tournaments t
    where id in ('36df1698-9196-4561-94f1-aa070c45a1e0', '3e62a6b4-483f-43a7-b8e3-3471f0efd6ed')
      and product_id = '095191d8-148d-40a7-81c5-7803b040b6b8'
      and is_active and end_date = date '2026-09-02';
  if v_count <> 2 then raise exception 'J5 tournament state changed; re-audit required'; end if;
  update public.tournaments set end_date = date '2026-10-31', updated_at = now()
    where id in ('36df1698-9196-4561-94f1-aa070c45a1e0', '3e62a6b4-483f-43a7-b8e3-3471f0efd6ed');
  select jsonb_agg(to_jsonb(t)) into v_after from public.tournaments t
    where id in ('36df1698-9196-4561-94f1-aa070c45a1e0', '3e62a6b4-483f-43a7-b8e3-3471f0efd6ed');
  insert into public.audit_logs(actor_user_id, actor_email, action, table_name, record_id, before_data, after_data, request_id)
    values ('7af8a854-f9de-4c20-ad79-176571433331', 'javierg@dragonforcemty.com',
      'tournament.end_date_corrected', 'products', '095191d8-148d-40a7-81c5-7803b040b6b8',
      jsonb_build_object('tournaments', v_before),
      jsonb_build_object('tournaments', v_after, 'reason', 'Owner confirmed October 31 end date; restore current J5 squad visibility.'),
      'repair.j5-end-date.20260907');
end $$;
