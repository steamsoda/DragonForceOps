-- Nutrition waist circumference v1
-- Adds optional historical waist circumference to measurement sessions.

alter table public.player_measurement_sessions
  add column if not exists waist_circumference_cm numeric(6,2) null;

alter table public.player_measurement_sessions
  drop constraint if exists player_measurement_sessions_waist_circumference_cm_check;

alter table public.player_measurement_sessions
  add constraint player_measurement_sessions_waist_circumference_cm_check
  check (waist_circumference_cm is null or waist_circumference_cm > 0);

comment on column public.player_measurement_sessions.waist_circumference_cm is
  'Optional waist circumference in centimeters captured during nutrition measurement sessions.';
