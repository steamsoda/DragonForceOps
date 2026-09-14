-- Manual role grants use existing Superadmin/RLS authority, not an email allowlist.
-- Keep verified email, role isolation, projection and finance protections intact.
do $$
declare
  definition text;
  signature text;
  predicate text := ' and lower(email) in (select a.email from public.porto_viewer_authorizations a where a.enabled)';
begin
  foreach signature in array array[
    'public.validate_porto_role_assignment()',
    'public.porto_operational_overview(text,uuid,text,date,date,integer)'
  ] loop
    definition := pg_get_functiondef(signature::regprocedure);
    if position(predicate in definition) = 0 then
      raise exception 'Unexpected Porto authorization definition: %', signature;
    end if;
    definition := replace(definition, predicate, '');
    definition := replace(definition, 'porto_requires_verified_allowlisted_account', 'porto_requires_verified_account');
    execute definition;
  end loop;
end $$;

comment on table public.porto_viewer_authorizations is
  'Optional one-time preapprovals only. Manual grants require a verified account and Superadmin authorization, not membership here. Revoke access by removing the user role.';
