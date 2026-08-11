import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [migration, action, query, form, dashboard, page] = await Promise.all([
  readFile("supabase/migrations/20260811220000_staff_schedule_reporting.sql", "utf8"),
  readFile("src/server/actions/coach-schedules.ts", "utf8"),
  readFile("src/lib/queries/coach-schedules.ts", "utf8"),
  readFile("src/components/weekly-callups/coach-schedule-form.tsx", "utf8"),
  readFile("src/components/weekly-callups/current-week-dashboard.tsx", "utf8"),
  readFile("src/app/(protected)/convocatorias/page.tsx", "utf8"),
]);

assert.match(migration, /auth\.role\(\) <> 'service_role'/);
assert.match(migration, /'superadmin', 'director_admin'/);
assert.match(migration, /app_role\.code = 'director_deportivo'/);
assert.match(migration, /user_role\.campus_id = v_campus_id or user_role\.campus_id is null/);
assert.match(migration, /can_manage_competition_squad_schedule/);
assert.match(migration, /save_coach_weekly_schedule_report_v3/);
assert.doesNotMatch(migration, /payment_allocations|attendance_records|competition_roster_squad_members\s+set|delete from public\.competition_roster_squad_members/);

assert.match(action, /writeMode.*director/);
assert.match(action, /context\.isSportsDirector/);
assert.match(action, /save_staff_weekly_schedule_report_v1/);
assert.match(action, /coach_schedule\.director_saved/);
assert.doesNotMatch(action, /competition_roster_squad_members"\)\.insert|competition_roster_squad_members"\)\.delete/);

assert.match(query, /getAdminScheduleDetailData/);
assert.match(query, /competition_roster_squad_members/);
assert.match(query, /\.range\(offset, offset \+ pageSize - 1\)/);
assert.match(query, /savedStatusByEnrollment/);
assert.match(form, /name="writeMode"/);
assert.match(form, /writeMode="director"|writeMode\?: "coach" \| "director"/);
assert.match(form, /Este equipo no tiene profesor responsable/);

assert.match(dashboard, /canManageSchedules/);
assert.match(dashboard, /detail=horarios#detalle-horarios/);
assert.match(page, /getAdminScheduleDetailData/);
assert.match(page, /id="detalle-horarios"/);
assert.match(page, /writeMode="director"/);
assert.match(page, /sin modificar equipos, planteles, pagos ni asistencias/i);

console.log("Director schedule editor assertions passed.");
