# Training Groups, Teams, And Attendance Model

Date: 2026-04-22
Status: active v1.17 program, training-group, and tournament-squad transition plan

## Approved Program And Tournament-Squad Model (2026-08-07)

Staff retired B1/B2/B3 as academy-facing player levels. The previous proposal to synchronize Futbol Para Todos players to `B1` is superseded by this decision.

### Canonical Responsibilities

| Concept | Authoritative meaning |
|---|---|
| Category / YOB | Derived from `players.birth_date`; the simple operational grouping used heavily by Front Desk. |
| Program | Exactly `Futbol Para Todos`, `Selectivo`, or `Little Dragons`. Enrollment confirms this through the selected training group. |
| Training group | Current practice roster, campus, schedule, coach ownership, attendance, and operational movement history. Existing IDs and history remain intact. |
| Tournament registration | Existing paid or explicitly confirmed eligibility in `tournament_player_entries`. Registration does not assign a permanent team. |
| Tournament squad | Tournament-specific sporting selection. Most registrations form one squad automatically; exceptional categories can split into `Azul` and `Blanco`. |
| Legacy level | Existing `players.level`, `teams.level`, `training_groups.level_label`, and `training_groups.group_code` values are retained temporarily for compatibility but are not future roster truth. |

### Approved Operational Rules

- New enrollment requires campus, program, and a confirmed active training group.
- New enrollment does not assign B1, B2, B3, Azul, Blanco, or a competition team.
- Ordinary one-squad tournament categories use the registered players from the relevant training group.
- Azul/Blanco exists only inside a specific tournament and may change in the next tournament.
- A player may belong to multiple tournament squads, including helping another YOB.
- A paid player may be excluded from a final roster, but this is exceptional and must be explicit and auditable.
- Several training groups may feed one tournament squad, including combined female competition rosters.
- New registrations join a normal single squad automatically while registration remains open. In an Azul/Blanco split, later registrations remain pending until assigned.
- Coaches may eventually prepare convocatorias for assigned squads. Directors/admins retain review and final WhatsApp-image generation.

### Safe Legacy Containment

- Do not delete or bulk-null legacy level data during the transition.
- Remove level from enrollment and ordinary player profile/editing first.
- Stop new ordinary writes to `players.level`.
- Replace every active read dependency before removing the column or metadata.
- Preserve historical migrations and audit records.
- Rename academy-facing Futbol Para Todos group labels through a reviewed mapping. Preserve group IDs, assignments, schedules, sessions, attendance, and coach links.
- Do not revive the dormant generic `teams` model. Build tournament-specific squads from the live tournament-registration foundation.

### Dependency Audit And Replacement Map

The first repository audit found these active dependency classes:

| Dependency | Current behavior | Replacement / containment |
|---|---|---|
| Enrollment review | Displays a program-derived B1/Selectivo/Little Dragons level | Show confirmed program and training group only. |
| Player profile/edit | Displays and edits `players.level` | Hide the field and preserve its legacy stored value during ordinary edits. |
| Enrollment group ranking | Prefers FPT groups with `group_code = B1` | Replace with campus + program + YOB + gender + reviewed group priority; do not change until duplicate-group rules are reviewed. |
| Training-group suggestions | Parses B1/B2/B3 from player/team level | Resolve by explicit program and current group assignment. |
| `Inscripciones Torneos` detail | Groups paid/unpaid players by team/player level | Sunset quietly; replace with YOB, training-group, and later tournament-squad views. |
| Exports and operational tables | Several surfaces label or sort by Nivel | Replace with program or training-group label according to the surface. |
| Legacy team actions | Can overwrite `players.level` | Contain/retire writes before any hidden team route is reused. |
| Training-group metadata | Names, `level_label`, and `group_code` contain B1/B2/B3 | Keep internally until matching no longer depends on them; use reviewed FPT-facing labels. |

### Ordered Transition Passes

1. Record the approved model, complete the B1/B2/B3 dependency map, hide Nivel from enrollment/player surfaces, and stop ordinary player edits from overwriting legacy level.
2. Replace level-dependent enrollment/group matching, then apply reviewed Futbol Para Todos display names without changing group identity or history.
3. Completed in `v1.17.7`: add `Por grupo` to `Inscripciones Torneos`, backed by current active training-group assignments and existing paid-registration truth. Keep `Sin grupo` visible.
4. Add tournament-specific squads: normal single squad, optional Azul/Blanco split, combined source groups, multi-squad players, exceptional exclusions, and audit history.
5. Scope coach access to assigned groups/squads and let coaches save prepared convocatorias; directors/admins review and generate the final image.
6. After all reads and writes are replaced, decide whether to remove legacy level fields and hidden generic team routes.

No bulk production data repair, group rename, or tournament-roster rewrite is approved in Pass 1.

### Transition Progress

- `v1.17.5` completed Pass 1: dependency map, safe Nivel removal from enrollment/player surfaces, and preservation of legacy stored values.
- `v1.17.6` completed the new-enrollment portion of Pass 2: the intake contract and ranking no longer read or prefer B1/B2/B3 metadata. FPT-facing labels are mapped at read time in enrollment and `Jugadores`; database group names and identities are unchanged.
- The historical assignment-review tool under attendance settings still derives suggestions from legacy level/group codes. It is intentionally contained until its replacement can be reviewed separately because it can write existing assignments.
- `v1.17.7` completed `Inscripciones Torneos > Por grupo`, using active training-group assignments plus existing paid/confirmed tournament truth. It also removed the B1/B2 detail segmentation and exports legacy `Nivel`/`Equipo base` no longer appear on this surface.
- `v1.17.8` applied current product invitation and strict pricing-rule eligibility to the group view, while `v1.17.9` added complete Excel/PNG packets grouped by current program and training group.
- `v1.17.10` adds the independent `competition_roster_*` foundation. It supports one or several source training groups, single/Azul/Blanco/custom squads, multi-squad players, manual helper players, explicit paid-player exclusions, immutable snapshots, and append-only audit events without referencing legacy `teams`.
- Paid/confirmed `tournament_player_entries` remain the candidate pool. A typed read model identifies assigned candidates, excluded candidates, and later paid registrations still awaiting assignment after a split.
- `v1.17.11` adds the practical default organizer inside `Inscripciones Torneos`. Directors can transactionally create or synchronize the ordinary one-source-group / one-squad case from confirmed entries without changing finance, registration, attendance, or training-group truth; operational users can inspect it read-only.
- `v1.17.13` adds the guarded one-source-group Azul/Blanco editor. It converts an ordinary single squad or creates a new split, requires at least one confirmed eligible player on each side, and refuses combined/manual/cross-group structures rather than rewriting them.
- `v1.17.14` adds combined-source squads. Directors can combine two or more ordinary source groups into one competition team, re-edit its source groups, and preserve absorbed ordinary squads as archived audit history. Split/custom/manual/conflicting structures remain guarded.
- `v1.17.15` adds audited manual helpers and explicit paid-player exclusions. Exclusion leaves the confirmed registration intact, removes only active squad membership, and reinstatement returns the player as pending; helper operations remain same-campus and never alter finance or training assignments.
- Next implementation pass: capture approved snapshots and connect them to exports and `Convocatorias`.

## v1.17 Production Audit And Accepted Direction (2026-08-06)

> Historical decision note: the level-synchronization direction in this section was accepted on 2026-08-06 and superseded by the staff decision above on 2026-08-07. It remains here to preserve decision history.

The read-only audit was rerun against production project `hjvytfaalnfcqfgbxsmj`. No application or database records were changed.

### Production Inventory

- 655 active enrollments.
- 646 enrollments have exactly one active training-group assignment.
- 9 active enrollments have no training group: 3 in Contry and 6 in Linda Vista.
- No enrollment has duplicate active training-group assignments.
- No active assignment has a campus or gender mismatch.
- 9 active assignments sit outside the training group's configured YOB range and require individual review.
- Current assigned program distribution: 485 Futbol Para Todos, 137 Selectivo, and 24 Little Dragons.
- The active group catalog still contains 23 single-YOB groups and 15 multi-YOB groups. Code must use configured ranges instead of assuming one YOB per group.

Only one of the 9 unassigned players currently resolves to a unique Futbol Para Todos match. Most of the others are YOB 2021/2022 players affected by the fact that enrollment auto-assignment only searches Futbol Para Todos. Contry has no Little Dragons program; Contry `Iniciacion B1` must be updated to include YOB 2022.

### Confirmed `Jugadores` Attendance Defect

The production `Sin registros` cases are not caused by `players.level` or missing attendance records. The recent-attendance helper sends 150 players per RPC chunk while requesting up to 15 records per player. A full chunk can produce 2,250 rows, but PostgREST caps the response at 1,000 rows.

Production evidence:

- every full 150-player chunk stopped at exactly 1,000 rows;
- 646 active players had direct non-cancelled attendance records;
- only 471 players appeared in the batched RPC response;
- 175 players with real attendance received no roster chips;
- 612 players received fewer than their actual last 15 records;
- `DF-0487` had a valid Little Dragons assignment and direct attendance on August 3-5, but received zero rows from the truncated batch.

First implementation pass: reduce or dynamically size the recent-attendance chunks below the response ceiling and add a regression test. This is a read-path repair only; it must not rewrite attendance.

### Accepted Canonical Responsibilities

Keep all three sporting concepts, but give each one an authoritative purpose:

| Concept | Authoritative meaning |
|---|---|
| Category / YOB | Derived from `players.birth_date`; the simple operational grouping used heavily by Front Desk. |
| Training group | Current practice roster, campus, schedule, coach ownership, attendance, and operational movement history. |
| Competition roster/team | Tournament-specific sporting selection; separate from enrollment and training-group assignment. |
| Level | Retained and synchronized from current training program, not independently used to determine rosters. |

Accepted level synchronization rule:

- Futbol Para Todos -> `B1`
- Selectivo -> `Selectivo`
- Little Dragons -> `Little Dragons`

Changing a player's active training group/program should synchronize the current level while preserving time-bounded assignment and attendance history. Competition-team membership must never overwrite the training level.

### Enrollment Direction

- Enrollment must require a training-group assignment before completion.
- Front Desk chooses or confirms the program: Futbol Para Todos, Selectivo, or age-appropriate Little Dragons.
- The app suggests the closest compatible active group using campus, program, YOB, and gender.
- Front Desk sees and confirms the actual group before the existing Caja handoff.
- A compatible group selector remains available for authorized correction.
- If the nearest option is outside the configured YOB range, show an explicit warning and require confirmation instead of silently leaving the player unassigned.
- Do not assign a competition team during enrollment.
- Remove the dormant B2 team auto-assignment and `players.level = 'B2'` overwrite from both enrollment paths before any competition-team UI is reactivated.

### Hidden Team And Tournament Surfaces

Production currently contains:

- 0 `teams` rows;
- 0 `team_assignments` rows;
- 12 active tournament records;
- 482 persistent tournament player entries;
- 0 tournament source-team links;
- 0 tournament squads.

The hidden `/teams` and `/tournaments` routes and their write actions still exist, but the generic team/squad layer is operationally unused. The live paid-registration foundation is `tournaments` plus `tournament_player_entries`, direct/Combo entitlement handling, and `Inscripciones Torneos`.

Recommended direction: evolve `Inscripciones Torneos` into the working tournament-roster surface. Keep the current YOB view, add a current-training-group view with `Sin grupo`, and later add tournament-specific roster selection. Do not revive automatic generic team assignment.

### Ordered v1.17 Passes

1. Repair and regression-test the recent-attendance RPC batching limit.
2. Add explicit enrollment program selection, deterministic group suggestion, visible confirmation, and a server-enforced no-group boundary.
3. Remove legacy B2 competition-team auto-assignment and synchronize `players.level` from training program.
4. Update Contry `Iniciacion B1` eligibility to include YOB 2022.
5. Review and repair the 9 unassigned production enrollments and 9 YOB-range mismatches individually. Preserve historical assignments and attendance.
6. Add `Por grupo` to `Inscripciones Torneos`, backed by active training-group assignments and the existing paid-registration truth.
7. Plan the tournament-specific roster/team workflow inside `Inscripciones Torneos`; explicitly retire or contain the unused hidden team builder.
8. Add a controlled promotion/movement workflow for Little Dragons -> Futbol Para Todos and Futbol Para Todos -> Selectivo, with effective dates, audit history, and level synchronization.

No bulk data repair is approved until passes 1-4 are implemented and the production discrepancy list is reviewed.

## v1.17 Re-entry Note (2026-08-06)

This document captured the problem before first-class training groups and the current attendance/group workflows were implemented. It remains useful for domain definitions and original risks, but its statements about the live schema and route behavior must not be treated as current truth.

The `v1.17` Nivel/Grupo pass starts with a read-only audit of the current database and application paths. It must reconcile:

- player `level` and any operational-level labels;
- active enrollment campus and status;
- active training-group assignments and group metadata;
- YOB, gender, program, and combined-year eligibility;
- coach ownership and historical attendance/session references;
- competition teams and tournament eligibility, which must remain separate from training groups.

No bulk repair, assignment backfill, or schema rewrite is approved by this note. The audit must first produce a discrepancy inventory and deterministic repair rules that preserve attendance history, enrollment history, finance, permissions, and tournament records.

## Why This Exists

Attendance v1 was implemented on preview using `teams(type = 'class')` as the roster source for recurring training sessions. After reviewing the current app model and Julio's training-group guide, that is probably not the right long-term abstraction.

The operational distinction should be:

- **Training Groups**: who trains together, at what campus, day, time, coach, and level block.
- **Teams**: competition rosters used for tournaments, squads, signups, and competition planning.
- **Category / YOB**: birth-year grouping used for filtering, eligibility, and many boards.
- **Nivel**: sports level label or development stage, not necessarily a unique roster by itself.

The key risk is using one database object called `teams` to mean both "training group" and "competition team". That keeps working for simple cases, but it becomes confusing once the academy has training groups that are mixed-year, split by gender, split by time, or different from tournament rosters.

## Current App Organization

### Players

`players` stores identity plus fields like:

- `birth_date`: used to derive `Categoria / YOB`.
- `gender`: used in sports/nutrition/intake filtering.
- `level`: current loose sports level label.

Important: `players.level` is currently synced from primary team assignment in several sports actions. It is not independent today.

### Enrollments

`enrollments` is still the active operational membership source:

- active enrollment determines whether the player is active.
- campus comes from enrollment.
- most finance and intake workflows hang from enrollment.

For attendance, the active enrollment should remain the source of "is this player active and eligible to appear in a roster?"

### Teams

`teams` currently has:

- `campus_id`
- `name`
- `birth_year`
- `gender`
- `level`
- `type`: `competition` or `class`
- `coach_id`
- `season_label`
- `is_active`

`team_assignments` links active enrollments to teams. The app uses primary assignments heavily:

- sports boards
- team roster pages
- tournament source teams
- new enrollment sports status
- tuition/pending display fallbacks for `Nivel`
- attendance v1 roster resolution

### Attendance v1 Preview

Attendance v1 currently creates:

- `attendance_schedule_templates.team_id`
- `attendance_sessions.team_id`
- `attendance_records.team_assignment_id`

That means attendance is team-based right now. The migration also enforces recurring training schedules only for active `class` teams.

This is acceptable for preview validation, but should not be hardened to production if the real field workflow is "take attendance by training group".

## What The Training Guide Shows

The uploaded guide describes real training groups by campus, program, level block, YOB, gender, time, and coach.

Examples:

- Linda Vista has Little Dragons as a mixed multi-year training group.
- Linda Vista has several one-year B1 groups from 2020 down to 2010.
- Linda Vista also has B2/B3 female groups that combine two birth years.
- Linda Vista Selectivos are mostly one YOB, but some are projected or currently empty.
- Contry Futbol Para Todos has several mixed two-year groups.
- Contry Selectivos include 2012/2013 and 2010/2011 combined groups.

That means the real grouping is not simply:

- one category = one group
- one `Nivel` = one group
- one competition team = one group

It is usually `campus + program + level block + gender + one or more YOBs + time + coach`.

## Recommended Domain Model

### Add First-Class `training_groups`

Do not continue overloading `teams(type='class')` as the permanent training model. Add a dedicated training model.

Suggested table:

```sql
training_groups
  id uuid primary key
  campus_id uuid not null
  name text not null
  program text not null -- futbol_para_todos, selectivo, little_dragons, other
  level_label text null -- Little Dragons, Iniciacion B1, Basico B1, Intermedio B1, Avanzado B1, Expert B1, etc.
  gender text null -- male, female, mixed
  birth_year_min int null
  birth_year_max int null
  coach_id uuid null
  is_active boolean not null default true
  notes text null
  created_at timestamptz
  updated_at timestamptz
```

For groups like `2012/2013`, use min/max. For non-contiguous groups later, add a child table.

Suggested child table if needed:

```sql
training_group_birth_years
  id uuid primary key
  training_group_id uuid not null
  birth_year int not null
  unique(training_group_id, birth_year)
```

For v1, min/max is probably enough because the guide uses either one YOB or adjacent combined YOB ranges.

### Add `training_group_assignments`

Do not reuse `team_assignments` for training groups.

Suggested table:

```sql
training_group_assignments
  id uuid primary key
  training_group_id uuid not null
  enrollment_id uuid not null
  player_id uuid not null
  start_date date not null
  end_date date null
  is_primary boolean not null default true
  assigned_by uuid null
  created_at timestamptz
  updated_at timestamptz
  unique(enrollment_id, training_group_id, start_date)
```

This keeps training membership separate from competition membership.

### Point Attendance To Training Groups

Change attendance tables before production hardening:

- `attendance_schedule_templates.training_group_id`
- `attendance_sessions.training_group_id`
- `attendance_records.training_group_assignment_id`

Keep match/special sessions flexible:

- training sessions should use `training_group_id`.
- match sessions may use a `team_id` if they are for a competition team.
- special sessions could target either a training group or a team, but only one at a time.

This avoids breaking the future case where a selectivo training group and a tournament roster are not the same players.

## How This Should Affect Existing Surfaces

### `Equipos`

Keep `Equipos` focused on competition/base teams.

Potential rename later:

- `Equipos` = competition/base teams
- `Grupos de entrenamiento` = training groups

Do not hide competition team logic inside training groups. Tournament signups, source teams, squads, refuerzos, and roster approvals should remain team-centered.

### `Nuevas Inscripciones`

Sports pending status should eventually mean:

- pending training group assignment, not just pending primary team assignment.

Today the page checks active primary team assignment / resolved level. That should be revisited when training groups become first-class.

### Player Profile

Player profile should show both:

- Grupo de entrenamiento actual
- Equipo(s) de competencia, if any

This is more accurate than showing one `Nivel` and implying it explains all sports organization.

### Attendance

Attendance should use:

- training group roster for regular practices.
- competition team roster for match sessions only if Julio wants match attendance tied to tournament teams.

Reports should be able to group by:

- campus
- training group
- level label
- YOB
- coach

## Recommended Implementation Path

### Step 1: Confirm Operating Rules With Julio

Before changing schema, confirm:

- Is attendance always taken by training group?
- Can a player belong to more than one training group at the same time?
- Should Selectivo players also appear in Futbol Para Todos attendance, or only Selectivo?
- Are girls groups separate training groups even when they share field/time?
- Do coaches take attendance by group, by field, or by time block?
- Should Little Dragons be one group or split internally by age later?
- Are training groups campus-specific only, or can a player from one campus train at another?
- Should new players without group assignment appear in an "Sin grupo" queue?

### Step 2: Freeze Attendance v1 As Preview-Only

Do not merge Attendance v1 to production until the roster source is decided.

The current preview version is still useful for validating:

- role access
- attendance UI
- session cancellation
- incident prefill
- reports layout

But the roster source likely needs to change.

### Step 3: Add Training Groups Additively

Create new tables instead of rewriting `teams`:

- `training_groups`
- `training_group_assignments`

Then build a small management UI:

- list groups by campus/program/time
- create/edit group metadata
- assign players to a training group
- show unassigned active players

### Step 4: Migrate Attendance Preview To Training Groups

Before production:

- update schedule templates to point at `training_group_id`.
- update session generation to create group-based training sessions.
- update roster resolver to use active `training_group_assignments`.
- keep match/special sessions able to use teams if needed.

### Step 5: Revisit `players.level`

`players.level` should probably stop being treated as the source of truth for sports grouping.

Options:

- Keep it as a derived/display label from primary training group.
- Replace it with `current_training_group_id` indirectly through assignments.
- Keep manual `Nivel` for rough filtering, but do not use it for attendance or roster truth.

Recommendation: do not delete `players.level`; demote it to display/legacy until the new group model is stable.

## Recommendation

Use this distinction going forward:

| Concept | Meaning | Source Of Truth |
|---|---|---|
| Category / YOB | Birth-year cohort | `players.birth_date` |
| Nivel | Development label | training group metadata or `players.level` as fallback |
| Training Group | Who trains together | new `training_groups` + `training_group_assignments` |
| Team | Competition/base roster | `teams` + `team_assignments` |
| Attendance Session | A concrete practice/match/special event | `attendance_sessions` |

The safest path is to add `training_groups` as a new layer and leave existing `teams` intact for competitions. This avoids destructive data changes, avoids confusing tournament logic, and matches how the academy now operates.

## Near-Term Decision

Do not build more on top of `teams(type='class')` until Julio's full training schedule is confirmed.

Once Julio provides the final list, use it to seed training groups and recurring attendance schedules in preview. Then test with Contry/Linda Vista field users before merging attendance to production.
