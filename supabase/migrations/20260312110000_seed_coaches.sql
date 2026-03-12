-- Seed coaches from Clases.csv (March 2026 — current active roster)
-- Source: Clases.csv tab from Porto monthly report template.
-- NOTE: Equipos_Competición_Selecciones tab has stale data (past months).
--       This CSV is the authoritative, up-to-date coach list.
--
-- Only first names are provided. Make last_name nullable to accommodate.
-- Phone/email to be filled in later by staff via the admin UI.
--
-- Group → Principal Coach mapping (for reference when teams are seeded):
--
-- LINDA VISTA:
--   Little Dragons (class)           → Mabel, Johan (principal) / Felipe, Eduardo (aux)
--   2018-2019 B1 (male, class/comp)  → Felipe (principal)
--   2018-2019 B2 (male, class)       → Mabel (principal) / Johan (aux)
--   2016-2017 B1 (male)              → Merino (principal) / Eduardo (aux)
--   2016-2017 B2 (male)              → David (principal)
--   2014-2015 B1 (male)              → Arturo (principal)
--   2014-2015 B2 (male)              → Nelson (principal)
--   2012-2013 B1 (male)              → Alejandro (principal)
--   2012-2013 B2 (male)              → Nelson (principal)
--   2010-2011 B1 (male)              → Alejandro (principal) / Eduardo (aux)
--   Fem 2014-2015 B3 (female)        → Mabel (principal)
--   Fem 2012-2013 B3 (female)        → David (principal)
--   Fem 2010-2011-2009 B4 (female)   → Felipe (principal)
--
-- CONTRY:
--   2018-2019 B1 (male)              → Ailín (principal) / Ángel (aux)
--   2016-2017 B1 (male)              → Sebastián (principal) / Daniel (aux)
--   2014-2015 B1 (male)              → Joel (principal)
--   2012-2013 B1 (male)              → Ailín (principal)
--   2010-2011 B1 (male)              → Joel (principal) / Ailín (aux)
--   Fem 2014-2015 B2 (female)        → Ailín (principal)
--   Fem 2012-2013 B2 (female)        → Joel (principal)
--   Fem 2010-2011 B2 (female)        → Ángel (principal)

-- Make last_name nullable — coaches are identified by first name only in source data
alter table public.coaches
  alter column last_name drop not null;

-- ─── Linda Vista coaches ───────────────────────────────────────────────────────
insert into public.coaches (first_name, campus_id, is_active)
select v.first_name, c.id, true
from (
  values
    ('Mabel'),
    ('Johan'),
    ('Felipe'),
    ('Eduardo'),
    ('Merino'),
    ('David'),
    ('Arturo'),
    ('Nelson'),
    ('Alejandro')
) as v(first_name)
cross join (select id from public.campuses where name = 'Linda Vista') c
on conflict do nothing;

-- ─── Contry coaches ───────────────────────────────────────────────────────────
insert into public.coaches (first_name, campus_id, is_active)
select v.first_name, c.id, true
from (
  values
    ('Ailín'),
    ('Ángel'),
    ('Sebastián'),
    ('Daniel'),
    ('Joel')
) as v(first_name)
cross join (select id from public.campuses where name = 'Contry') c
on conflict do nothing;
