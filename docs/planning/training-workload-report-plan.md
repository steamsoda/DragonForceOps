# Training Workload Report Plan

Status: Passes 1-4 implemented in preview through `v1.16.234`; print-layout polish remains parked.

## Purpose

Give academy leadership a compact, campus-scoped view of how many players each coach or coaching unit serves in each training group and time block during the previous 30 Monterrey calendar days.

This is a staffing-capacity report. It does not replace player attendance percentages, mutate attendance, or read financial data.

## Confirmed Views

1. `Por coach`
   - One section per unique coach combination.
   - Shared-coach groups appear once under the combined coaching unit.
   - Rows show group, YOB, schedule, each held session, and rolling averages.
2. `Por horario`
   - `Bloque previo`: 15:00-16:00 at Linda Vista.
   - Standard blocks: 16:00-17:10, 17:20-18:30, 18:40-19:50, and 20:00-21:10.
   - Rows show group, YOB, coaching unit, session counts, and rolling averages.

## Counting Rules

- The window is exactly 30 natural days in `America/Monterrey`, including the selected/current day.
- Cancelled sessions are excluded.
- Future sessions on the current day are excluded.
- `A Asistio` records count as official attendance.
- Tryout visits remain separately visible as `+1P`, `+2P`, and so on.
- Tryouts count toward combined coach workload.
- Three group averages are exposed: official attendance, tryouts, and total served.
- Averages use completed sessions only.
- Past scheduled sessions remain visible as `Sin registrar` and do not silently lower or improve the average.

## Coach History

- Sessions capture the current group coach combination when generated.
- The snapshot refreshes and freezes when attendance is first completed.
- Later group-coach changes do not rewrite completed-session history.
- Existing sessions are backfilled from current assignments and explicitly marked `legacy_backfill_current_assignment`; they are useful as a baseline but are not presented as guaranteed historical truth.

## Passes

1. Coach snapshots plus the aggregated rolling 30-day RPC.
2. Compact `Por coach` report UI and direct validation against representative groups. Implemented in preview `v1.16.232`.
3. `Por horario` mode and print layout. Implemented in preview `v1.16.233`.
4. Role regression, performance validation, and historical-snapshot monitoring. Implemented in preview `v1.16.234`.
   - Read access remains limited to the established attendance-read roles and their allowed campuses.
   - The report remains finance-free and uses one aggregated RPC call.
   - Preview medians on 2026-08-05 were about 220-227 ms for 216 Contry rows and 299 Linda Vista rows.
   - The page now distinguishes exact creation/completion snapshots, explicit legacy backfill, and missing snapshots.

## Parked Polish

- Refine the browser print-preview layout after the operational report and monitoring behavior have been validated.
