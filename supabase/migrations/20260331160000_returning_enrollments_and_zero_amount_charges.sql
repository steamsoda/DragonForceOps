-- Returning-player enrollment metadata + waived inscription support.
-- Allows explicit Regreso tracking on enrollments and permits zero-amount
-- inscription charges for "Exento de inscripcion" while preserving negative
-- discount lines.

alter table public.enrollments
  add column if not exists is_returning boolean not null default false,
  add column if not exists return_inscription_mode text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.enrollments'::regclass
      and conname = 'enrollments_returning_mode_check'
  ) then
    alter table public.enrollments
      add constraint enrollments_returning_mode_check
      check (
        (not is_returning and return_inscription_mode is null)
        or
        (
          is_returning
          and return_inscription_mode in ('full', 'inscription_only', 'waived')
        )
      );
  end if;
end $$;

alter table public.charges
  drop constraint if exists charges_amount_nonzero;

