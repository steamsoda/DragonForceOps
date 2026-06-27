# Weekly Coach Attendance Packet Design

Date: 2026-06-27
Target branch: `preview`
Priority: P1

## Goal

Create a weekly coach-facing attendance packet that office/admin staff can view in the app and print directly. The packet should help coaches receive one clear weekly roster per group with operational signals that matter for attendance accountability.

This feature is not meant to expose detailed finance information to coaches. It should only show simple coach-safe tags.

## Scope

Build the first version inside `Asistencia > Reportes`.

The report supports:

- Full campus packet for all coaches.
- Single-coach filter for reprints.
- Week picker using Monterrey Monday-Sunday calendar weeks.
- Direct browser print.
- Print-friendly black-and-white layout.

The selected week should be labeled clearly, for example:

`Semana 26 - 22 Jun al 28 Jun`

## Roles And Visibility

The report can live in the attendance reports surface, but the finance-derived pending-payment signal must remain reduced to a boolean coach-safe tag:

- `Pendiente de pago`
- `Al corriente`

No amounts, month counts, charge details, receipt data, payment method, or account balance should be rendered in this report.

Existing attendance read permissions can open the report page. If later staff decide coaches should access it directly, that should be a separate permission discussion. For v1, office/admin staff are expected to print or reprint the packet.

## Data Rules

### Week Definition

- Week starts Monday.
- Week ends Sunday.
- Date logic uses Monterrey time.
- Default week is the current week.
- Staff can select another week.

### Grouping

Rows are grouped in this order:

1. Coach
2. Training group
3. Players alphabetically

The page should support:

- `Todos los coaches`
- A single selected coach

### Player Inclusion

Include all active players assigned to active training groups in the selected campus scope.

Each player row includes:

- Row number inside the training group
- Player public ID
- Full player name
- Category / year of birth
- Enrollment start date
- Selected-week attendance summary
- New-player tag
- Pending-payment tag
- 3+ absence tag
- Notes space for paper use

### New Player Tag

Show `Nuevo` when the enrollment start date falls inside the selected Monday-Sunday week.

### Pending Payment Tag

Show `Pendiente de pago` when the player has any unpaid monthly tuition according to the existing pending tuition source.

Show `Al corriente` otherwise.

Do not show pending month count or money amounts.

### Absence Tag

Show `3+ faltas` when the existing attendance-risk source returns any active risk tier for that player.

Do not show detailed risk tiers like `4+ faltas`, `30+ dias`, or `60+ dias` in the coach packet.

The source must continue to count only confirmed `absent` records from completed attendance sessions. Missing records do not count.

### Weekly Attendance Summary

For each player, show a compact selected-week summary:

`2/3 asistencias`

Count as attendance:

- `present`
- `injury`
- `justified`

Count as non-attendance:

- `absent`

Cancelled sessions should not count in the denominator.

## UX Design

Add a section or action in `Asistencia > Reportes` named:

`Reporte semanal para coaches`

Controls:

- Campus selector, following existing `AttendanceCampusButtons` patterns.
- Week picker or date input that resolves to a labeled Monday-Sunday week.
- Coach selector with `Todos los coaches` default.
- `Imprimir reporte` button.

On-screen layout should be scannable:

- Summary header with campus, week label, and selected coach.
- Coach sections.
- Training group subsections.
- Table per group.

Print layout should be cleaner than the screen layout:

- Hide app navigation and filters.
- Black-and-white friendly.
- Avoid color-only meaning.
- Prefer page breaks before each coach; if that creates too much paper, page break before each coach and allow groups to flow naturally.
- Keep group headers with their table when possible.

## Technical Approach

Add a read-only query module for the report rather than extending existing page queries too much.

The query should compose existing sources:

- Active training group assignments for roster membership.
- Existing pending tuition source for pending-payment boolean.
- Existing attendance-risk helper for the `3+ faltas` boolean.
- Attendance sessions and records for selected-week attendance summary.
- Existing coach lookup conventions from attendance queries.

The report should avoid per-player requests. Use batched queries and maps keyed by player/enrollment/training group IDs.

No schema changes are expected for v1.

## Acceptance Criteria

- Staff can open `Asistencia > Reportes` and see `Reporte semanal para coaches`.
- Default view uses current Monterrey week.
- Week label reads clearly, e.g. `Semana 26 - 22 Jun al 28 Jun`.
- Staff can filter to all coaches or one coach.
- Full campus packet groups by coach, then training group.
- Single-coach reprint shows only that coach's groups.
- Players are alphabetical inside each training group.
- New players from the selected week show `Nuevo`.
- Players with any unpaid monthly tuition show `Pendiente de pago`.
- Players without pending monthly tuition show `Al corriente`.
- Players with active attendance risk show `3+ faltas`.
- No money amounts, pending month counts, charge details, payment methods, or balances are shown.
- Print button produces a clean coach handout.

## Verification Plan

Run:

- `npm run typecheck`
- `npm run build`

Add or extend a focused assertion script to guard:

- The coach packet uses a boolean payment signal, not amount fields.
- The coach packet uses existing attendance-risk helpers.
- The page includes print controls and week labeling.

Manual preview checks:

- Full campus packet for Linda Vista.
- Full campus packet for Contry.
- Single coach reprint.
- A week with a known new enrollment.
- A player with pending monthly tuition.
- A player with an active 3+ absence signal.
- Browser print preview.

## Out Of Scope

- Direct coach login or coach-only permissions.
- Automatic weekly email/export.
- PDF generation.
- Detailed finance exposure.
- Changing attendance capture behavior.
- Changing pending tuition calculations.
- Enrollment data validation popup.
- Tryout player tracking.
