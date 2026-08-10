import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const migration = read("supabase/migrations/20260811010000_coach_schedule_reporting.sql");
const debugWriteMigration = read("supabase/migrations/20260811030000_preview_debug_coach_schedule_write.sql");
const permissions = read("src/lib/auth/permissions.ts");
const layout = read("src/app/(protected)/layout.tsx");
const coachQuery = read("src/lib/queries/coach-schedules.ts");
const coachAction = read("src/server/actions/coach-schedules.ts");
const coachForm = read("src/components/weekly-callups/coach-schedule-form.tsx");
const usersAction = read("src/server/actions/users.ts");
const callupPage = read("src/app/(protected)/convocatorias/page.tsx");

assert(migration.includes("add column if not exists user_id uuid null references auth.users(id)"), "Coach auth link must be explicit.");
assert(migration.includes("coaches_user_id_key"), "A coach account must link to at most one coach.");
assert(migration.includes("join public.training_group_coaches"), "Coach schedule access must derive from assigned groups.");
assert(migration.includes("coach_weekly_schedule_reports"), "Coach schedules must remain separate from final callups.");
assert(!migration.includes("payment_allocations") && !migration.includes("attendance_records"), "Coach schedule migration must not mutate finance or attendance.");
assert(debugWriteMigration.includes("auth.role() <> 'service_role'"), "Debug coach writes must require the service role.");
assert(debugWriteMigration.includes("ar.code = 'superadmin'"), "Debug coach writes must verify the real Super Admin actor.");
assert(debugWriteMigration.includes("c.user_id = p_effective_user_id") && debugWriteMigration.includes("training_group_coaches"), "Debug coach writes must verify the explicit coach link and assigned group.");
assert(debugWriteMigration.includes("grant execute") && debugWriteMigration.includes("to service_role") && debugWriteMigration.includes("from public, anon, authenticated"), "The debug RPC must not be executable by normal API roles.");
assert(!debugWriteMigration.includes("payment_allocations") && !debugWriteMigration.includes("attendance_records"), "Debug schedule writes must not touch finance or attendance.");
assert(permissions.includes("hasCoachScheduleAccess: isCoach && Boolean(coachId)"), "Coach access must require an active linked coach.");
assert(layout.includes('items: [{ href: "/convocatorias", label: "Mis horarios" }]'), "Coach navigation must expose only the schedule route.");
assert(coachQuery.includes('.eq("coach_id", context.coachId)'), "Coach query must filter by the linked coach.");
assert(coachQuery.includes("training_group_coaches"), "Coach query must use current group assignments.");
assert(coachAction.includes('rpc("save_coach_weekly_schedule_report"'), "Coach writes must use the scoped database function.");
assert(coachAction.includes("isPreviewDebugEnabled()") && coachAction.includes('rpc("save_debug_coach_weekly_schedule_report"'), "Writable coach impersonation must remain Preview-only and use the guarded helper.");
assert(coachForm.includes("router.refresh()"), "A successful coach report must refresh persisted server state.");
assert(coachForm.includes("Reporte enviado a administracion") && coachForm.includes("Actualizar reporte"), "Coaches must see and edit their submitted schedule.");
assert(usersAction.includes("linkCoachUserAction") && usersAction.includes("coach.account_linked"), "Super Admin must explicitly link and audit coach accounts.");
assert(callupPage.includes("permission?.isCoach") && callupPage.includes("getCoachSchedulePageData"), "Coach route must render the scoped view.");
assert(callupPage.includes("Modo de prueba de coach") && callupPage.includes("El resto del modo Ver como permanece en solo lectura"), "The coach page must explain its narrow Preview write exception.");
assert(!coachAction.includes("weekly_callup_players") && !coachAction.includes("competition_roster"), "Coach actions must not edit roster membership.");

console.log("Coach convocatoria scope assertions passed.");
