-- Add reversal tracking to audit_logs.
-- Reversed entries keep their original data; only these two columns are set.
alter table public.audit_logs
  add column if not exists reversed_at  timestamptz,
  add column if not exists reversed_by  uuid references auth.users(id) on delete set null;

-- Allow superadmin (via is_director_admin) to stamp entries as reversed.
-- App layer only ever sets reversed_at + reversed_by — never mutates other fields.
create policy superadmin_reverse_audit_log on public.audit_logs
  for update to authenticated
  using  (public.is_director_admin())
  with check (public.is_director_admin());
