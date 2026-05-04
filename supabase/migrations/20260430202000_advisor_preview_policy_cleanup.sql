-- Follow-up from the preview advisor rerun after applying v1.16.104 migrations.
-- Ensure internal deny policies sit on RLS-enabled tables and avoid always-true
-- policy predicates while preserving the original authenticated-only access.

alter table public.campus_folio_counters enable row level security;
alter table public.finance_reconciliation_snapshots enable row level security;

drop policy if exists "authenticated can read app_settings" on public.app_settings;
create policy "authenticated can read app_settings" on public.app_settings
  for select to public
  using ((select auth.role()) = 'authenticated'::text);

drop policy if exists "staff can manage uniform_orders" on public.uniform_orders;
create policy "staff can manage uniform_orders" on public.uniform_orders
  for all to public
  using ((select auth.role()) = 'authenticated'::text)
  with check ((select auth.role()) = 'authenticated'::text);
