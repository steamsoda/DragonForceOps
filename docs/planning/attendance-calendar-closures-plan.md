# Attendance Calendar And Closures Plan

Date: 2026-04-29
Status: planning

## Purpose

The attendance system now has recurring training schedules, generated concrete sessions, daily capture, group/month views, and a manual generation safeguard.

The next operational gap is closures and calendar visibility:

- vacation days or full vacation weeks
- rain days, sometimes by one campus only
- holidays
- special events
- manual checks that the generated week matches reality

This plan defines the intended behavior before adding schema or UI.

## Current State

Attendance sessions are generated from active schedule templates:

- global Supabase `pg_cron` runs Sundays at `06:00 UTC`
- cron creates next Monday-Sunday sessions
- app-level manual generation can create one selected campus/week
- generation is idempotent and skips existing group/date/time training sessions

Current cancellation behavior:

- a scheduled or completed session can be cancelled
- records remain for audit if a completed session is cancelled later
- cancelled sessions are excluded from attendance-rate calculations

## Target User Mental Model

### Field Admin

Field Admin should not manage templates, closures, or generation.

Their daily workflow stays:

1. Open `Asistencia > Hoy`
2. See the sessions for today
3. Take attendance
4. Move on

If sessions are missing or wrong, they notify direction.

### Director / Superadmin / Director Deportivo

Directors need operational controls:

- see the week/month calendar
- confirm generated sessions exist
- generate a campus week when needed
- cancel a rain day or holiday
- mark vacation days/weeks
- create special sessions/events

## Proposed Navigation

Keep the simple capture lane:

- `Asistencia > Hoy`
- `Asistencia > Grupos`
- `Asistencia > Reportes`

Add a director/admin surface later:

- `Asistencia > Calendario`

Or, if we want to avoid adding another normal field tab:

- `Super Admin > Calendario asistencia`

Recommendation: start as `Asistencia > Calendario`, but hide write controls for read-only roles. This makes the calendar useful operationally without turning it into another setup page.

## Calendar View v1

### Scope

Calendar v1 should show concrete `attendance_sessions`, not raw templates.

Views:

- month view
- week view later if needed
- campus filter required for write actions
- optional all-campus read overview for directors/superadmin

Each day should show:

- number of scheduled sessions
- number completed
- number cancelled
- notable closure/event label if present

Clicking a day should show:

- sessions grouped by start time
- training group name
- campus
- coach
- status
- actions allowed by role

## Closure Model Options

### Option A — Session-Only Cancellation

Use existing `attendance_sessions.status = cancelled` rows only.

Pros:

- no new table
- simple
- reports already exclude cancelled sessions

Cons:

- cannot mark a vacation week before sessions exist
- cannot explain why future generation should skip a day
- directors must cancel each generated session

This is acceptable as a short-term manual workflow, but weak for vacation periods.

### Option B — Add `attendance_closures`

Create a separate closure table:

- `id`
- `campus_id null` for all campuses or specific campus
- `starts_on date`
- `ends_on date`
- `reason_code`: `rain`, `holiday`, `vacation`, `event`, `other`
- `title`
- `notes`
- `created_by`
- timestamps

Generation behavior:

- if a generated session falls inside a closure range for its campus or all campuses:
  - either skip creation
  - or create it as `cancelled`

Recommendation: create it as `cancelled`, not skipped.

Reason:

- staff can still see that a session would have existed
- reports exclude it
- calendar remains explainable
- no one wonders if cron failed

### Option C — Hybrid

Use `attendance_closures` for planned closures and keep direct session cancellation for same-day rain/emergencies.

Recommendation: use hybrid.

## Recommended Data Model

Add later, not in this planning pass:

```sql
create table public.attendance_closures (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid null references public.campuses(id) on delete restrict,
  starts_on date not null,
  ends_on date not null,
  reason_code text not null check (reason_code in ('rain', 'holiday', 'vacation', 'event', 'other')),
  title text not null,
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
```

Recommended generation behavior:

- keep generating attendance sessions from schedule templates
- if a matching closure exists, insert the session with:
  - `status = cancelled`
  - `cancelled_reason_code = reason_code` where compatible
  - `cancelled_reason = title` plus optional notes
- if sessions already exist, applying a closure should update matching scheduled sessions to cancelled
- do not automatically cancel completed sessions without an explicit director confirmation

## Role Rules

Read:

- `attendance_admin`: assigned campuses
- `front_desk`: assigned campuses, read-only
- `director_deportivo`: assigned/global sports campuses
- `director_admin` / `superadmin`: all campuses

Write closures:

- `director_admin` / `superadmin`
- `director_deportivo` only for campuses in sports/attendance scope, if directors approve this operationally

Field Admin:

- no closure creation
- no schedule generation
- no template editing
- can still cancel individual same-day sessions only if we explicitly decide that is needed

Recommendation: keep Field Admin out of closures in v1.

## Reporting Rules

Cancelled sessions:

- visible in calendar/day detail
- visible as secondary counts in group/month cards
- excluded from attendance-rate denominator
- excluded from player monthly matrix cells unless we add a small day header marker later

Closures:

- do not hurt attendance
- should be auditable
- should explain why a training day has no attendance requirement

## Implementation Phases

### Phase 1 — Planning And Calendar Read View

- `v1.16.90` adds `Asistencia > Calendario`.
- Reads concrete sessions by campus/month.
- No new closure table yet.
- Shows scheduled/completed/cancelled counts per day.
- Day drilldown links to existing sessions.

### Phase 2 — Manual Day/Campus Closure

- Add `attendance_closures`
- Add director/admin closure form
- Apply closure to already scheduled sessions
- Keep completed-session cancellation behind explicit confirmation

### Phase 3 — Generator Integration

- Update `generate_attendance_sessions(...)`
- Update `generate_attendance_sessions_for_campus(...)`
- Generated sessions inside closure ranges are created as cancelled
- Keep idempotency by group/date/time/type

### Phase 4 — Vacation Weeks And Special Events

- Add multi-day closure UX
- Add labels in calendar
- Add special event display or session creation if needed

## Safety Boundaries

- Do not change payment, Caja, tuition, nutrition, or tournament workflows.
- Do not backfill historical closures.
- Do not delete generated sessions.
- Do not let closures change enrollment status.
- Do not let closures affect monthly tuition generation.

## Open Questions

1. Should Director Deportivo be allowed to create rain/vacation closures for their campus, or should only director/admin/superadmin do that?
2. Should Field Admin be allowed to cancel an individual same-day rain session from `Hoy`, or should that also require director/admin?
3. For planned vacation weeks, should sessions be generated as cancelled or omitted? Recommendation: generated as cancelled for operational visibility.
4. Should calendar all-campus view be read-only even for directors, requiring a specific campus before write actions? Recommendation: yes.

## Recommendation

Implement next in this order:

1. Read-only attendance calendar using existing `attendance_sessions`.
2. Manual campus/day closure with `attendance_closures`.
3. Generator integration so future generated sessions inside closures are auto-cancelled.

This avoids mixing calendar layout, closure rules, and generator mutation into one risky release.
