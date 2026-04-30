-- Match the enrollment ledger query that loads one account's charges newest-first.
-- Production pg_stat_statements showed this as the heaviest repeated app-level read.

create index if not exists idx_charges_enrollment_created_at
  on public.charges (enrollment_id, created_at desc);
