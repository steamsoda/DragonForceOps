drop table if exists public.external_payment_events;

do $$
begin
  if exists (
    select 1
    from pg_type
    where typname = 'external_payment_reconciliation_status'
  ) then
    drop type public.external_payment_reconciliation_status;
  end if;
end $$;
