import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const migration = read("supabase/migrations/20260811010000_coach_schedule_reporting.sql");
const permissions = read("src/lib/auth/permissions.ts");
const layout = read("src/app/(protected)/layout.tsx");
const coachQuery = read("src/lib/queries/coach-schedules.ts");
const coachAction = read("src/server/actions/coach-schedules.ts");
const usersAction = read("src/server/actions/users.ts");
const callupPage = read("src/app/(protected)/convocatorias/page.tsx");

assert(migration.includes("add column if not exists user_id uuid null references auth.users(id)"), "Coach auth link must be explicit.");
assert(migration.includes("coaches_user_id_key"), "A coach account must link to at most one coach.");
assert(migration.includes("join public.training_group_coaches"), "Coach schedule access must derive from assigned groups.");
assert(migration.includes("coach_weekly_schedule_reports"), "Coach schedules must remain separate from final callups.");
assert(!migration.includes("payment_allocations") && !migration.includes("attendance_records"), "Coach schedule migration must not mutate finance or attendance.");
assert(permissions.includes("hasCoachScheduleAccess: isCoach && Boolean(coachId)"), "Coach access must require an active linked coach.");
assert(layout.includes('items: [{ href: "/convocatorias", label: "Mis horarios" }]'), "Coach navigation must expose only the schedule route.");
assert(coachQuery.includes('.eq("coach_id", context.coachId)'), "Coach query must filter by the linked coach.");
assert(coachQuery.includes("training_group_coaches"), "Coach query must use current group assignments.");
assert(coachAction.includes('rpc("save_coach_weekly_schedule_report"'), "Coach writes must use the scoped database function.");
assert(usersAction.includes("linkCoachUserAction") && usersAction.includes("coach.account_linked"), "Super Admin must explicitly link and audit coach accounts.");
assert(callupPage.includes("permission?.isCoach") && callupPage.includes("getCoachSchedulePageData"), "Coach route must render the scoped view.");
assert(!coachAction.includes("weekly_callup_players") && !coachAction.includes("competition_roster"), "Coach actions must not edit roster membership.");

console.log("Coach convocatoria scope assertions passed.");
