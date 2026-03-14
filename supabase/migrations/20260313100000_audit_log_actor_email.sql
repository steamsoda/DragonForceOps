-- Add actor_email to audit_logs so the Activity Log UI can show who performed each action
-- without needing to join auth.users (which is not accessible from the client).
-- Nullable: existing rows will have NULL; new rows populated by the app layer.

alter table public.audit_logs add column if not exists actor_email text null;

create index if not exists idx_audit_logs_actor_email on public.audit_logs (actor_email);
