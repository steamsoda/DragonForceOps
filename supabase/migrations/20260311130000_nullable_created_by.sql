-- created_by is nullable on charges and payments
-- Historical/seeded records have no app user attached
alter table public.charges
  alter column created_by drop not null;

alter table public.payments
  alter column created_by drop not null;
