# Clases de Prueba

## Objective

Track pre-enrollment children who attend up to three tryout classes, give Front Desk a fast arrival/ticket workflow, and preserve a clean path into the existing enrollment flow without contaminating academy attendance or finance data.

## Non-Negotiable Boundaries

- A prospect is not a `player` or an `enrollment` until conversion.
- A trial visit is not an `attendance_record` and never enters roster counts, attendance rates, absence streaks, coach participation denominators, tuition status, charges, or payments.
- The visit may reference the real generated `attendance_session` and stores a coach snapshot for historical attribution.
- Check-in commits before printing. Printer failure cannot erase the visit, and the ticket can be reprinted.
- Duplicate clicks for the same prospect/session return the existing visit instead of creating another one.
- Monterrey time is canonical for visit dates and printed timestamps.

## Passes

### Pass 1 - Intake, Visits, And Ticket

- Add isolated `trial_prospects` and `trial_visits` tables.
- Front Desk and directors can search by child name or tutor phone within their campus scope.
- Intake requires child first/last name, a non-future birth date, gender, campus, a 10-digit tutor phone, and preferred active training group. Tutor name and notes are optional.
- Invalid input is blocked before submission; server validation remains authoritative, and rejected saves keep the operator's entered values visible for correction.
- Show progress as `0/3`, `1/3`, `2/3`, or `3/3` and a dated visit history.
- Register arrival against today's generated training session, automatically counting the trial visit as attended in the trial ledger.
- Print and reprint a compact thermal ticket with child, campus, group, date/time, visit number, and reference.
- Stop normal check-in at three visits. A fourth visit is reserved for the later override pass.

### Pass 2 - Attendance Awareness Without Metric Drift

- Show trial visitors separately on the daily attendance surface, for example `+1 clase de prueba`.
- Give Field Admin/attendance staff visibility that a prospect is expected/present.
- Keep all existing player roster totals, attendance records, percentages, absence streaks, coach reports, and dashboards unchanged.
- Preview `v1.16.212` implements this as a read-only `trial_visits` layer on `Asistencia > Hoy` and session detail. The official attendance recorder still receives only enrolled roster rows.
- Preview `v1.16.213` separates database-save confirmation from page refresh and QZ printing, so a slow or unavailable printer cannot leave intake or arrival controls looking unsaved.

### Pass 3 - Convert To Enrollment

- Convert the prospect into the existing player/enrollment intake flow with fields prefilled.
- Preserve the existing confirmation, guarded B1 auto-assignment, and Caja handoff.
- Link the prospect to the created player/enrollment without rewriting trial history.
- Preview `v1.16.214` adds this conversion path with a nullable unique source link on `enrollments`, campus-scoped server validation, duplicate-submit protection, conversion audit history, and rollback if the prospect cannot be linked after intake.

### Pass 4 - Reporting

- Report tryout volume, visit count, conversion count/rate, campus, group, and coach attribution.
- Keep trial statistics separate from academy attendance statistics.
- Preview `v1.16.215` adds a campus-scoped monthly report with fully paginated reads, group breakdowns, and immutable visit-time coach attribution. Overall conversion uses the selected month's newly registered prospect cohort; visit totals use the visit's real date.
- Preview `v1.16.216`-`v1.16.217` adds the deduplicated visitor roster, group campus/YOB metadata, a unique-visitor YOB chart, and consistent monthly/three-calendar-month/custom date ranges.

### Pass 5 - Hardening

- Add director/admin approval and audit detail for a fourth class.
- Improve duplicate review/merge handling and add an explicit abandoned/declined prospect closure workflow with reason, audit history, inactive queue, and stale-follow-up suggestions. Do not delete or silently auto-close prospect history.
- Add operational alerts only after real usage establishes useful thresholds.

## Pass 1 Acceptance

- A Front Desk user can register and find a prospect only in an allowed campus.
- Invalid phone or birth-date input cannot clear the intake form or create a prospect.
- A saved arrival remains saved if printing fails.
- Reprinting never creates another visit.
- Repeated check-in for one session is idempotent.
- The fourth ordinary visit is blocked.
- No player, enrollment, attendance record, charge, payment, or finance report changes are produced by this pass.
