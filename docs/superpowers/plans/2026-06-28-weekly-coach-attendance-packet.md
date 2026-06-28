# Weekly Coach Attendance Packet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only weekly coach packet in `Asistencia > Reportes` that can be viewed in-app and printed by campus or coach.

**Architecture:** Add one focused query module that composes active training-group rosters, week attendance records, pending-month boolean tags, and existing attendance-risk helpers. Render a new report section in the existing attendance reports page with print-friendly layout and a small client print button. Keep all finance detail reduced to `Pendiente de pago` / `Al corriente`.

**Tech Stack:** Next.js App Router, React Server Components, Supabase service-role server queries, Tailwind print utilities, existing attendance/pending helpers.

---

### Task 1: Query And Week Helpers

**Files:**
- Create: `src/lib/queries/weekly-coach-packet.ts`

- [x] Add week parsing/label helpers for Monterrey Monday-Sunday weeks.
- [x] Add a read-only query that loads active training-group assignments by attendance campus scope.
- [x] Load week sessions and records for selected training groups.
- [x] Load pending monthly tuition as a boolean only.
- [x] Load attendance risk with the existing batch helper and map it to `hasAbsenceRisk`.

### Task 2: Print Button

**Files:**
- Create: `src/components/attendance/weekly-coach-packet-print-button.tsx`

- [x] Add a small client component that calls `window.print()`.

### Task 3: Report UI

**Files:**
- Modify: `src/app/(protected)/attendance/reports/page.tsx`

- [x] Add `week` and `coach` search params.
- [x] Load the weekly coach packet in parallel with existing reports.
- [x] Preserve week/coach params in campus buttons.
- [x] Add the weekly coach packet controls and report section.
- [x] Hide other report sections when printing.
- [x] Print a black-and-white friendly coach packet grouped by coach and training group.

### Task 4: Regression Assertion

**Files:**
- Create: `scripts/assert-weekly-coach-packet.mjs`
- Modify: `package.json`

- [x] Assert the query file exposes a boolean payment tag and does not export money fields.
- [x] Assert the report page renders `Reporte semanal para coaches`, week labels, and the print button.
- [x] Add `npm run test:weekly-coach-packet`.

### Task 5: Version And Docs

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `docs/devlog.md`
- Modify: `docs/roadmap-post-alpha.md`

- [x] Bump to `v1.16.180`.
- [x] Add devlog notes.
- [x] Mark the roadmap weekly coach packet as preview implementation.

### Task 6: Verification And Push

**Commands:**
- [x] `npm run test:weekly-coach-packet`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `git diff --check`
- [ ] Commit and push `preview`.
