alter table public.enrollment_incidents
  add column if not exists starts_on date null,
  add column if not exists ends_on date null;

alter table public.enrollment_incidents
  drop constraint if exists enrollment_incidents_date_range_check;

alter table public.enrollment_incidents
  add constraint enrollment_incidents_date_range_check
  check (
    ends_on is null
    or starts_on is not null
    and ends_on >= starts_on
  );
