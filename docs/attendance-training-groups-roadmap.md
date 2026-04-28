# Attendance And Training Groups Operational Roadmap

Date: 2026-04-28
Status: planning / pre-implementation

## Purpose

This document defines the next operational pass for sports grouping and attendance.

The academy is moving away from the old `B1/B2` level-first organization. Growth has made it possible to operate mostly by category / year of birth, with a clearer program split:

- `Futbol Para Todos`
- `Selectivo`
- `Little Dragons` where applicable

The app should reflect that reality without mixing daily training groups with tournament teams.

## Final Vocabulary

| Term | Meaning | App Source |
|---|---|---|
| Categoria / YOB | Birth-year cohort. Example: `2014`. | `players.birth_date` |
| Programa | Main sports track. Example: `Futbol Para Todos`, `Selectivo`, `Little Dragons`. | `training_groups.program` |
| Grupo de entrenamiento | Who trains together year-round, at a campus, on days/times, with coach(es). | `training_groups` + `training_group_assignments` |
| Equipo de competencia | Tournament/league roster. Can be created from a group but is not always equal to that group. | `teams` + tournament stack |
| Nivel | Legacy/development label. Useful as fallback/display during transition, but not the operating source of truth. | `players.level` / `training_groups.level_label` as legacy display |

## Operating Decisions

1. `Nivel` becomes legacy.
   - Do not delete it yet.
   - Do not use it as the primary attendance or grouping axis going forward.
   - Treat `training_groups.program` plus YOB/gender/campus as the cleaner operational model.

2. Competition teams remain hidden / WIP until the tournament model is cleaned up.
   - `teams`, `team_assignments`, tournament source teams, squads, and signup logic should not be repointed casually.
   - Tournament cleanup should be the next major sports issue after attendance/group simplification.

3. Front desk can see attendance group views read-only.
   - They should not manage schedules, cancel sessions, or correct attendance.
   - They can use group/month views to answer operational questions.

4. Monthly attendance is strict calendar month.
   - Use Monterrey calendar month boundaries.
   - Do not map attendance months to tuition periods if they ever differ.
   - Historical attendance must remain queryable month by month and eventually year-round per player.

5. Cancelled sessions remain visible in calendar/session context.
   - Cancelled sessions should not affect attendance percentage.
   - Monthly summary views can omit cancelled sessions from the main counted rows because they do not contribute to rate calculations.

## Training Groups Vs Competition Teams

### Training Groups

Training groups answer:

- Who trains together?
- When do they train?
- At which campus?
- Under which program?
- Who is responsible for attendance?

Examples:

- `2014 Linda Vista Varonil Futbol Para Todos`
- `2014 Contry Selectivo`
- `2016 Contry Femenil Futbol Para Todos`

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

- simplify `Asistencia > Hoy`
- make session cards more field-friendly
- add clearer empty states
- add admin-only manual generation shortcut if today/week has no sessions
- keep cancellation/correction permissions intact

### Phase 3 — New `Asistencia > Grupos` Operational View

Add read-only group/month view.

- campus/month/program/YOB filters
- group cards
- group detail table with monthly attendance
- front desk read-only access
- no finance/contact exposure

### Phase 4 — Rename/Reposition Settings

Move current group-management meaning out of the user-facing `Grupos` label.

- current group management becomes configuration/settings
- preserve existing management functionality
- do not break current training group assignments

### Phase 5 — Tournament / Competition Team Cleanup

Separate follow-up issue.

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
4. Add safer manual session generation shortcut
5. Then move to tournament/team cleanup

This preserves current group data, keeps attendance safe, and avoids mixing tournament cleanup into the attendance UX pass.
