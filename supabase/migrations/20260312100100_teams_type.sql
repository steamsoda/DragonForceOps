-- Add type column to teams: 'competition' or 'class'
-- Determines which tab of the Porto monthly report the team appears in:
--   competition → Equipos de Competición
--   class       → Clases
-- Default is 'competition' since most teams are competitive.

alter table public.teams
  add column if not exists type text not null default 'competition'
    check (type in ('competition', 'class'));

comment on column public.teams.type is
  'Team type: competition (Equipos de Competición tab) or class (Clases tab) in Porto monthly report.';
