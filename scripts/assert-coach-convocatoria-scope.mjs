import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const migration = read("supabase/migrations/20260811010000_coach_schedule_reporting.sql");
const debugWriteMigration = read("supabase/migrations/20260811030000_preview_debug_coach_schedule_write.sql");
const gameRosterMigration = read("supabase/migrations/20260811120000_coach_game_roster_snapshots.sql");
const permissions = read("src/lib/auth/permissions.ts");
const layout = read("src/app/(protected)/layout.tsx");
const coachQuery = read("src/lib/queries/coach-schedules.ts");
const coachAction = read("src/server/actions/coach-schedules.ts");
const coachForm = read("src/components/weekly-callups/coach-schedule-form.tsx");
const composerForm = read("src/components/weekly-callups/composer-form.tsx");
const liveRefresh = read("src/components/weekly-callups/live-refresh.tsx");
const currentWeekDashboard = read("src/components/weekly-callups/current-week-dashboard.tsx");
const weeklyCallupQuery = read("src/lib/queries/weekly-callups.ts");
const weeklyCallupAction = read("src/server/actions/weekly-callups.ts");
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
assert(coachAction.includes('rpc("save_coach_weekly_schedule_report_v2"'), "Coach writes must use the stable game-roster database function.");
assert(coachAction.includes("isPreviewDebugEnabled()") && coachAction.includes("p_effective_user_id"), "Writable coach impersonation must remain Preview-only and identify the effective coach account.");
assert(gameRosterMigration.includes("coach_weekly_schedule_game_players") && gameRosterMigration.includes("weekly_callup_game_players"), "Game-specific coach and convocatoria rosters must be frozen separately.");
assert(gameRosterMigration.includes("competition_roster_squad_members") && gameRosterMigration.includes("game_roster_changed"), "Coach roster submissions must match the current permanent squad without changing it.");
assert(coachForm.includes("router.refresh()"), "A successful coach report must refresh persisted server state.");
assert(coachForm.includes("Reporte enviado a administracion") && coachForm.includes("Actualizar reporte"), "Coaches must see and edit their submitted schedule.");
assert(usersAction.includes("linkCoachUserAction") && usersAction.includes("coach.account_linked"), "Super Admin must explicitly link and audit coach accounts.");
assert(callupPage.includes("permission?.isCoach") && callupPage.includes("getCoachSchedulePageData"), "Coach route must render the scoped view.");
assert(callupPage.includes("Modo de prueba de coach") && callupPage.includes("El resto del modo Ver como permanece en solo lectura"), "The coach page must explain its narrow Preview write exception.");
assert(callupPage.includes("CoachScheduleLiveRefresh"), "The admin convocatoria view must refresh current coach reports.");
assert(callupPage.includes("getWeeklyCallupsFoundationData(params.week)"), "The admin handoff must load coach reports for the selected week.");
assert(liveRefresh.includes("10_000") && liveRefresh.includes("router.refresh()") && liveRefresh.includes('window.addEventListener("focus"'), "Coach reports must refresh periodically and when the admin returns to the page.");
assert(callupPage.includes("CurrentWeekDashboard"), "The admin view must put the current-week control panel before the composer.");
assert(currentWeekDashboard.includes("Control de esta semana") && currentWeekDashboard.includes("Preparar convocatoria"), "The weekly control panel must separate coach reporting from final convocatoria readiness.");
assert(currentWeekDashboard.includes("Pendiente") && currentWeekDashboard.includes("Reportado") && currentWeekDashboard.includes("Descanso"), "The traffic matrix must expose clear red/green operational states.");
assert(currentWeekDashboard.includes("auxiliaryCoachNames") && weeklyCallupQuery.includes("auxiliaryCoachNames"), "Shared groups must remain single rows with auxiliary coaches visible.");
assert(weeklyCallupQuery.includes("updated_at") && currentWeekDashboard.includes("updatedAt"), "The monitor must show persisted report freshness.");
assert(composerForm.includes('name={`games:${group.id}`}') && composerForm.includes("reported.games.map"), "The admin composer must preload every coach-reported game.");
assert(composerForm.includes("dirtyGroupIds.has(group.id)"), "Live refresh must not overwrite a group the admin has edited.");
assert(composerForm.includes("router.replace(`/convocatorias?campus="), "Changing the admin week must reload that week's coach reports.");
assert(weeklyCallupAction.includes("composerGamesValue") && weeklyCallupAction.includes("row.games!.map"), "Convocatoria creation must validate and persist all reported games.");
assert(!coachAction.includes('from("competition_roster_squad_members").insert') && !coachAction.includes('from("competition_roster_squad_members").delete'), "Coach actions must not edit permanent squad membership.");
assert(!gameRosterMigration.includes("payment_allocations") && !gameRosterMigration.includes("attendance_records"), "Game roster snapshots must not touch finance or attendance.");

console.log("Coach convocatoria scope assertions passed.");
