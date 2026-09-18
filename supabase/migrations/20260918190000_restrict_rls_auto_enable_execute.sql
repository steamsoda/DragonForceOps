-- This function is an event-trigger handler, not a client RPC. Preserve the
-- automatic RLS trigger and its owner; remove only unnecessary client grants.
do $$
declare
  handler oid := to_regprocedure('public.rls_auto_enable()');
begin
  -- Some branch databases do not install this optional platform helper.
  if handler is null then return; end if;
  if (select prorettype from pg_proc where oid = handler) <> 'event_trigger'::regtype then
    raise exception 'Unexpected rls_auto_enable return type; manual review required';
  end if;
  revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
end;
$$;
