# Attendance And Training Groups Operational Roadmap

Date: 2026-04-28
Status: active implementation on preview

## Purpose

This document defines the next operational pass for sports grouping and attendance.

The academy is moving away from the old `B1/B2` as an ability-level concept. `B1/B2/B3` can still exist, but it should mean a logistical subgroup inside `Futbol Para Todos`, not a statement about player quality.

Growth has made it possible to operate mostly by category / year of birth, with a clearer program split:

- `Futbol Para Todos`
- `Selectivo`
- `Little Dragons` where applicable

The app should reflect that reality without mixing daily training groups with tournament teams.

## Final Vocabulary

| Term | Meaning | App Source |
|---|---|---|
| Categoria / YOB | Birth-year cohort. Example: `2014`. | `players.birth_date` |
| Programa | Main sports track. Example: `Futbol Para Todos`, `Selectivo`, `Little Dragons`. | `training_groups.program` |
| Subgrupo | Logistical split inside `Futbol Para Todos`. Example: `B1`, `B2`, `B3`. Not an ability label. | Prefer a future `training_groups.subgroup_label`; current transition can map from `training_groups.level_label` |
| Grupo de entrenamiento | Who trains together year-round, at a campus, on days/times, with coach(es). | `training_groups` + `training_group_assignments` |
| Equipo de competencia | Tournament/league roster. Can be created from a group but is not always equal to that group. | `teams` + tournament stack |
| Nivel | Legacy wording. It should no longer mean ability placement. | `players.level` as legacy/fallback only |

## Operating Decisions

1. `Nivel` as ability placement becomes legacy.
   - Do not delete it yet.
   - Do not use it as the primary attendance or grouping axis going forward.
   - Treat `training_groups.program` plus YOB/gender/campus/subgroup as the cleaner operational model.
   - In the UI, prefer `Subgrupo` over `Nivel` for `B1/B2/B3`.

2. `B1/B2/B3` means logistical subgroup, not ability.
   - Most categories will only have `B1`.
   - `B2` is commonly used when a category is split by gender or size.
   - `B3` currently exists only for the Linda Vista 2012/2013 female mixed-YOB group.
   - These labels should not drive competition eligibility, ability evaluation, scholarship logic, or player quality decisions.

3. Competition teams remain hidden / WIP until the tournament model is cleaned up.
   - `teams`, `team_assignments`, tournament source teams, squads, and signup logic should not be repointed casually.
   - Tournament cleanup should be the next major sports issue after attendance/group simplification.

4. Front desk can see attendance group views read-only.
   - They should not manage schedules, cancel sessions, or correct attendance.
   - They can use group/month views to answer operational questions.

5. Monthly attendance is strict calendar month.
   - Use Monterrey calendar month boundaries.
   - Do not map attendance months to tuition periods if they ever differ.
   - Historical attendance must remain queryable month by month and eventually year-round per player.

6. Cancelled sessions remain visible in calendar/session context.
   - Cancelled sessions should not affect attendance percentage.
   - Monthly summary views can omit cancelled sessions from the main counted rows because they do not contribute to rate calculations.

## Actual Training Group Catalog

This is the current operational group list provided by directors. It should be treated as the reference catalog for the next seed/review pass.

### Linda Vista / Futbol Para Todos

| Program | Group display | YOB | Subgroup | Gender | Coach(es) | Notes |
|---|---|---:|---|---|---|---|
| Little Dragons | Little Dragons | mixed | - | mixed | TBD | Linda Vista has Little Dragons. |
| Futbol Para Todos | Basico B1 | 2020 | B1 | mixed/male default | Felipe |  |
| Futbol Para Todos | Basico B1 | 2019 | B1 | mixed/male default | Mabel |  |
| Futbol Para Todos | Basico B1 | 2018 | B1 | mixed/male default | Johan |  |
| Futbol Para Todos | Intermedio B1 | 2017 | B1 | mixed/male default | Merino |  |
| Futbol Para Todos | Intermedio B1 | 2016 | B1 | mixed/male default | David |  |
| Futbol Para Todos | Avanzado B1 | 2015 | B1 | mixed/male default | Nelson |  |
| Futbol Para Todos | Avanzado B1 | 2014 | B1 | mixed/male default | Arturo |  |
| Futbol Para Todos | Expert B1 | 2013 | B1 | mixed/male default | Alex |  |
| Futbol Para Todos | Expert B1 | 2012 | B1 | mixed/male default | Villalba |  |
| Futbol Para Todos | Expert B2 | 2012/2013 | B2 | mixed | Nelson | Mixed-YOB exception. |
| Futbol Para Todos | PreJuvenil B1 | 2011 | B1 | mixed/male default | Villalba, Johan |  |
| Futbol Para Todos | PreJuvenil B1 | 2010 | B1 | mixed/male default | Alex |  |
| Futbol Para Todos | Avanzado B2 Femenil | 2014/2015 | B2 | female | Mabel | Female mixed-YOB group. |
| Futbol Para Todos | Expert B3 Femenil | 2012/2013 | B3 | female | David | Only current B3 exception. |
| Futbol Para Todos | PreJuvenil B2 Femenil | 2010/2011 | B2 | female | Felipe | Female mixed-YOB group. |

### Linda Vista / Selectivos

| Program | Group display | YOB | Gender | Coach(es) | Notes |
|---|---|---:|---|---|---|
| Selectivo | Selectivo 2018 | 2018 | mixed/male default | Johan |  |
| Selectivo | Selectivo 2017 | 2017 | mixed/male default | Arturo |  |
| Selectivo | Selectivo 2016 | 2016 | mixed/male default | Alex, David |  |
| Selectivo | Selectivo 2015 | 2015 | mixed/male default | Felipe |  |
| Selectivo | Selectivo 2014 | 2014 | mixed/male default | Merino |  |
| Selectivo | Selectivo 2008/2009 | 2008/2009 | mixed/male default | David, Arturo |  |
| Selectivo | Selectivo 2013 | 2013 | mixed/male default | Villalba | Projected, currently no players. |
| Selectivo | Selectivo 2012 | 2012 | mixed/male default | Merino | Projected, currently no players. |
| Selectivo | Selectivo 2011 | 2011 | mixed/male default | TBD | Currently no players. |
| Selectivo | Selectivo 2010 | 2010 | mixed/male default | TBD | Currently no players. |

### Contry / Futbol Para Todos

| Program | Group display | YOB | Subgroup | Gender | Coach(es) | Notes |
|---|---|---:|---|---|---|---|
| Futbol Para Todos | Iniciacion B1 | 2020/2021 | B1 | mixed/male default | Ailin | Contry has Iniciacion, not Little Dragons. |
| Futbol Para Todos | Basico B1 | 2018/2019 | B1 | mixed/male default | Angel |  |
| Futbol Para Todos | Intermedio B1 | 2016/2017 | B1 | mixed/male default | Sebastian, Angel |  |
| Futbol Para Todos | Avanzado B1 | 2015 | B1 | mixed/male default | Joel |  |
| Futbol Para Todos | Avanzado B1 | 2014 | B1 | mixed/male default | Sebastian, Daniel |  |
| Futbol Para Todos | Expert B1 | 2012/2013 | B1 | mixed/male default | Ailin |  |
| Futbol Para Todos | PreJuvenil B1 | 2010/2011 | B1 | mixed/male default | Joel, Daniel |  |
| Futbol Para Todos | Avanzado B2 Femenil | 2014/2015 | B2 | female | Ailin | Female mixed-YOB group. |
| Futbol Para Todos | Expert B2 Femenil | 2012/2013 | B2 | female | Joel | Female mixed-YOB group. |
| Futbol Para Todos | PreJuvenil B2 Femenil | 2010/2011 | B2 | female | Angel | Female mixed-YOB group. |

### Contry / Selectivos

| Program | Group display | YOB | Gender | Coach(es) | Notes |
|---|---|---:|---|---|---|
| Selectivo | Selectivo 2016 | 2016 | mixed/male default | Ailin |  |
| Selectivo | Selectivo 2015 | 2015 | mixed/male default | Joel |  |
| Selectivo | Selectivo 2014 | 2014 | mixed/male default | Sebastian, Daniel |  |
| Selectivo | Selectivo 2012/2013 | 2012/2013 | mixed/male default | Angel |  |
| Selectivo | Selectivo 2010/2011 | 2010/2011 | mixed/male default | Joel, Daniel |  |

## Group Naming Rules

Recommended display format:

```text
{YOB or YOB range} - {Program} - {Subgroup if FPT} - {Gender if female/mixed special}
```

Examples:

- `2015 - Futbol Para Todos - B1`
- `2014/2015 - Futbol Para Todos - B2 Femenil`
- `2012/2013 - Futbol Para Todos - B3 Femenil`
- `2014 - Selectivo`
- `2008/2009 - Selectivo`

The app can keep a shorter group `name`, but UI should avoid implying that `B1/B2/B3` is an ability tier.

## Training Groups Vs Competition Teams

### Training Groups

Training groups answer:

- Who trains together?
- When do they train?
- At which campus?
- Under which program?
- Who is responsible for attendance?

Examples:

- `2014 Linda Vista Futbol Para Todos B1`
- `2014 Contry Selectivo`
- `2014/2015 Contry Futbol Para Todos B2 Femenil`

These groups are year-round operational units and should drive:

- recurring schedule templates
- generated training sessions
- daily attendance capture
- monthly attendance reports
- nutrition / players grouped scanning where useful

### Competition Teams

Competition teams answer:

- Which players are registered for this competition?
- What is the team name for that tournament?
- Who is eligible / paid / approved?

Example:

- Training group has 20 players.
- Tournament team `2014 LV Azul` has 15 registered players.

Competition teams stay separate because:

- not every training player joins every tournament
- one group can split into multiple tournament teams
- a tournament team can have custom roster decisions
- Selectivo usually overlaps strongly with competition rosters, but still benefits from a separate competition object for exceptions

## Selectivo Handling

Selectivo is operationally special because it often behaves like both a training group and the default competition pool.

Recommended model:

- keep `Selectivo` as a training group for attendance and daily operations
- keep competition teams separate for tournaments
- later, add faster tournament-team creation from a Selectivo group if needed

Do not collapse Selectivo group and tournament team into one database object. That would make exceptions harder later.

## Attendance UX Direction

### Current Problem

Attendance v1 has the right technical pieces, but the UI still exposes too much setup thinking:

- schedules
- generated sessions
- groups as settings
- session lifecycle details

The field user should not need to understand those concepts.

### Target User Mental Model

For the person taking attendance:

1. Open `Asistencia > Hoy`
2. See today’s groups
3. Tap the group
4. Mark absences or special statuses
5. Save

Everything else should be admin/configuration or reporting.

## Proposed Navigation

### `Asistencia > Hoy`

Main capture surface.

Recommended behavior:

- defaults to today in Monterrey
- shows only concrete generated sessions for that date
- cards grouped by campus and start time
- session cards show:
  - training group name
  - program
  - YOB/category
  - gender
  - coach(es)
  - roster count
  - status: pendiente, tomada, cancelada
- primary actions:
  - `Tomar asistencia`
  - `Ver resumen`
- cancellation available only to roles allowed to cancel

If no sessions exist for today:

- normal users see a clear empty state
- director/admin/superadmin see a safe shortcut to generate sessions for the week/date range

### `Asistencia > Grupos`

New operational group view, not settings.

Purpose:

- see all training groups
- see players in each group
- see monthly attendance at a glance

Access:

- `attendance_admin`: assigned campuses
- `director_deportivo`: sports campus scope
- `director_admin` / `superadmin`: director/admin scope
- `front_desk`: read-only, assigned campus scope
- `coach`: still inactive for now

Recommended filters:

- month
- campus
- program
- gender
- YOB/category
- group status

Recommended group card metrics:

- active players
- sessions completed this month
- group attendance rate
- absences this month
- cancelled sessions count as a secondary note only, not part of rate

Recommended detail table:

- player name
- public player ID
- category/YOB
- program/group
- attended sessions
- absent sessions
- justified/injury sessions
- monthly attendance percentage
- last attendance status

No finance, payment, tuition, receipts, or guardian contact data should appear here unless explicitly added later.

### `Asistencia > Configuracion`

Current `Grupos` management should become settings/configuration.

Potential labels:

- `Configuracion`
- `Grupos y horarios`
- `Ajustes de grupos`

It should contain:

- training group catalog
- group metadata editing
- coach assignment
- player group assignment / move
- unassigned players / ambiguous queue
- schedule templates
- manual session generation tools

Access should be director/admin/superadmin plus any attendance admin permissions we explicitly allow. Front desk should not edit here.

### `Asistencia > Reportes`

Keep broader reporting here:

- inactive/low-attendance player report
- team/group monthly report
- coach report
- historical attendance views

This can later share query helpers with `Asistencia > Grupos`.

## Data And Query Requirements

### Month Boundaries

Attendance reporting must use strict Monterrey calendar months:

- month start: first day at 00:00 Monterrey
- month end: first day of next month at 00:00 Monterrey

Use existing time helpers or add explicit attendance month helpers if needed.

### Attendance Rate

Current v1 formula remains:

```text
(present + injury + justified) / total non-cancelled sessions
```

Only `absent` hurts the rate.

Cancelled sessions:

- visible in session/calendar context
- excluded from denominator
- omitted or secondary in monthly group summaries

### Historical Integrity

Do not overwrite historical attendance when:

- a player moves groups
- a group changes time
- a group is renamed
- a schedule template changes

Reports should use attendance records and session dates as recorded. Group assignment history should remain date-aware.

### Query Safety

Avoid recreating the `Pendientes` scaling failure.

Group/month views should:

- query by campus/month first
- avoid huge unchunked `.in(...)` calls
- prefer SQL/RPC aggregation for monthly attendance summaries if row counts grow
- keep detail views paginated or scoped by group/month

## Proposed Implementation Phases

### Phase 1 — Planning And Copy Alignment

No schema changes.

- update docs with final vocabulary
- decide navigation labels
- confirm route boundaries
- mark `Nivel` as legacy in roadmap/devlog language

### Phase 2 — Attendance UX Simplification

Focus on existing data model and current training-group attendance implementation.

- `v1.16.84` started this phase:
  - simplified `Asistencia > Hoy` for Field Admin daily capture
  - added daily status summary cards
  - made session cards more field-friendly with clearer time, roster count, status, and action copy
  - hid group/schedule setup from pure `attendance_admin` navigation
  - protected group/schedule setup routes for directors/admins and Director Deportivo only
- remaining:
  - add more explicit grouping by campus/start time if field testing needs it
  - continue refining empty states after live session-generation behavior is validated
- add admin-only manual generation shortcut if today/week has no sessions
- keep cancellation/correction permissions intact

### Phase 2B — Session Generation Safeguard

Current intended automation:

- Supabase `pg_cron` job: `generate-attendance-sessions`
- Schedule: `0 6 * * 0` (Sundays at 06:00 UTC)
- Function: `public.generate_attendance_sessions(p_start_date date, p_end_date date)`
- Current function source: active `attendance_schedule_templates` linked to active `training_groups`
- Current generated range: next Monday through next Sunday
- Idempotency: the function skips existing `training_group_id + session_date + start_time + training` sessions.

Needed safeguard:

- `v1.16.88` adds an in-app director/admin action to generate sessions for the selected Monday-Sunday week.
- The action lives in `Asistencia > Hoy` so directors can fix a missing week without leaving the daily operations surface.
- Result copy distinguishes:
  - sessions created
  - sessions already existing / skipped
  - expected sessions based on active training-group schedule templates
- This is a safety valve if cron fails or if schedules are created after the Sunday cron has already run.
- Field Admin cannot use this workflow; they should only take attendance.
- `v1.16.89` adds the campus-scoped SQL generator:
  - `public.generate_attendance_sessions_for_campus(start_date, end_date, campus_id)`
  - `Asistencia > Hoy` requires a specific campus before manual generation
  - directors/admins and Director Deportivo can generate only the selected campus week within their attendance scope
  - the existing global Sunday cron remains unchanged
- Live cron verification note: the repo is currently linked to the preview Supabase project, not production; reading production `cron.job` requires a direct prod SQL path, not the local linked CLI context.

### Future Phase — Attendance Calendar / Operational Closures

Add a literal calendar view after the manual generation safeguard is stable.

Planned use cases:

- See generated training sessions by day and campus.
- Mark vacation days or full vacation weeks.
- Mark rain days, including campus-specific closures such as `Contry only` or `Linda Vista only`.
- Show cancelled sessions on the calendar, but continue excluding cancelled sessions from monthly attendance-rate calculations.
- Add special events or exceptions without forcing staff to edit raw schedule templates.
- Keep this separate from the first generation-safeguard pass to avoid mixing calendar UX, closure rules, and session generation in one release.

### Phase 3 — New `Asistencia > Grupos` Operational View

Add read-only group/month view.

- `v1.16.85` adds the first implementation:
  - campus/month filters
  - group cards with active players, completed sessions, absences, cancellations, and attendance rate
  - selected-group detail table with player public ID, category, attended sessions, absences, justified/injury count, rate, and last status
  - front desk read-only access
  - no finance/contact exposure
- `v1.16.86` polishes the drilldown:
  - group cards now jump to the selected detail panel
  - selected detail renders above the group grid instead of at the bottom of the page
  - selected cards have a visible selected state
- `v1.16.87` adds the compact historical matrix:
  - one column per completed session in the selected month
  - one row per player
  - `P/A/J/L/-` status markers plus aggregate stats
  - cancelled sessions stay excluded from rates and matrix cells
- remaining:
  - add program/YOB filters if the list becomes too dense in field use
  - consider drilldown routes or pagination if group rosters grow significantly
  - add export only after the screen proves useful operationally

### Phase 4 — Rename/Reposition Settings

Move current group-management meaning out of the user-facing `Grupos` label.

- `v1.16.85` moves current group management to `Asistencia > Configuracion`
- `v1.16.86` moves the nav entry to `Super Admin > Configuracion Grupos` so group setup is no longer presented as a normal field-attendance tab
- preserve existing management functionality
- do not break current training group assignments

### Phase 5 — Tournament / Competition Team Cleanup

Separate follow-up issue.

- planning doc: `docs/planning/competitions-roster-builder-plan.md`
- keep competition teams hidden until cleaned up
- define how tournament teams are created from groups
- clarify Selectivo defaults
- clean paid/unpaid signup logic and product/tournament rules

## Open Questions Before Implementation

1. Navigation label decision:
   - Should the management/settings page be called `Configuracion`, `Grupos y horarios`, or something else?

2. `Asistencia > Grupos` detail depth:
   - Should the first version show one expandable page per group, or one board with group cards and a drilldown route?

3. Session generation:
   - Should the manual generator be under `Hoy` empty state only, or also under settings?

4. Player-level historical view:
   - Should year-round attendance history live first on the player profile, the attendance reports page, or both?

## Recommendation

Implement in preview in this order:

1. UX/copy simplification for `Asistencia > Hoy`
2. New read-only `Asistencia > Grupos` monthly view
3. Rename/reposition current group-management tab as configuration
4. Add safer manual session generation shortcut (`v1.16.88`)
5. Then move to tournament/team cleanup

This preserves current group data, keeps attendance safe, and avoids mixing tournament cleanup into the attendance UX pass.
