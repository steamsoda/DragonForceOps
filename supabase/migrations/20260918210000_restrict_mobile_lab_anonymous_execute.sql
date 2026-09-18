-- Optional Preview-only lab RPCs are not part of the public application.
-- Keep existing authenticated/service access; remove anonymous mutation access.
do $$ declare signature text; target regprocedure; begin
 foreach signature in array array[
  'public.mobile_test_enqueue_notification(text,text,text)',
  'public.mobile_test_register_device(text,text,text,text,text)'
 ] loop
  target:=to_regprocedure(signature);
  if target is null then continue; end if;
  execute format('revoke execute on function %s from public,anon',target);
 end loop;
end $$;
