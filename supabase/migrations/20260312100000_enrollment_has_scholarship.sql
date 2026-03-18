-- Add has_scholarship flag to enrollments
-- Scholarship players (beca) are enrolled but must NOT receive monthly_tuition charges.
-- They still count as active players in all roster/report counts.
-- Only director_admin can toggle this flag (enforced at app layer).

alter table public.enrollments
  add column if not exists has_scholarship boolean not null default false;

comment on column public.enrollments.has_scholarship is
  'True for scholarship (beca) players. They remain enrolled and count as active, but are excluded from monthly tuition charge generation.';
