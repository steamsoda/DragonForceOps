import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260720120000_trial_classes_v1.sql", "utf8");
const action = fs.readFileSync("src/server/actions/trial-classes.ts", "utf8");
const query = fs.readFileSync("src/lib/queries/trial-classes.ts", "utf8");
const page = fs.readFileSync("src/app/(protected)/trial-classes/page.tsx", "utf8");
const prospectForm = fs.readFileSync("src/components/trial-classes/trial-prospect-form.tsx", "utf8");
const visitControls = fs.readFileSync("src/components/trial-classes/trial-visit-controls.tsx", "utf8");
const attendanceQuery = fs.readFileSync("src/lib/queries/attendance.ts", "utf8");
const attendanceTodayPage = fs.readFileSync("src/app/(protected)/attendance/page.tsx", "utf8");
const attendanceSessionPage = fs.readFileSync("src/app/(protected)/attendance/sessions/[sessionId]/page.tsx", "utf8");
const printer = fs.readFileSync("src/lib/printer.ts", "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(migration.includes("create table public.trial_prospects"), "Missing isolated trial prospects table");
assert(migration.includes("create table public.trial_visits"), "Missing isolated trial visits table");
assert(migration.includes("unique (prospect_id, attendance_session_id)"), "Visit check-in must be idempotent per session");
assert(migration.includes("visit_number between 1 and 3"), "Ordinary visits must be capped at three");
assert(migration.includes("pg_advisory_xact_lock"), "Visit counter must be transactionally serialized");
assert(migration.indexOf("where prospect_id = p_prospect_id", migration.indexOf("pg_advisory_xact_lock")) > migration.indexOf("pg_advisory_xact_lock"), "Visit RPC must recheck duplicates after acquiring its lock");
assert(migration.includes("grant execute on function public.record_trial_visit") && migration.includes("to service_role"), "Visit RPC must remain service-role only");
assert(!/insert into public\.(players|enrollments|attendance_records|charges|payments)/i.test(migration), "Pass 1 must not mutate academy attendance, enrollment, or finance tables");
assert(action.includes("canAccessCampus"), "Server actions must enforce campus scope");
assert(action.includes("trial_prospect.created") && action.includes("trial_visit.checked_in"), "Pass 1 writes must be audited");
assert(action.includes("phone.length !== 10"), "Prospect intake must enforce a ten-digit phone on the server");
assert(query.includes("eq(\"session_date\", today)"), "Check-in choices must use today's generated sessions");
assert(page.includes("Las visitas de prueba no alteran planteles, asistencia oficial ni finanzas"), "Operator boundary must be explicit");
assert(prospectForm.includes('pattern="[0-9]{10}"'), "Prospect intake must validate ten-digit phones before submission");
assert(prospectForm.includes("event.preventDefault()"), "Prospect intake must preserve form state on server errors");
assert(prospectForm.includes("formRef.current?.reset()"), "Prospect intake should reset only after a successful save");
assert(prospectForm.includes("startTransition(() => router.refresh())"), "Prospect refresh must not hold the save button pending");
assert(visitControls.indexOf("setIsSaving(false)") < visitControls.indexOf("setIsPrinting(true)"), "Arrival save state must finish before printer connection begins");
assert(visitControls.includes("La llegada ya esta guardada; puedes continuar"), "Slow printers must clearly preserve the saved-arrival state");
assert(attendanceQuery.includes('.from("trial_visits")'), "Attendance awareness must read the isolated trial visit ledger");
assert(attendanceQuery.includes("trialVisitors: trialVisitorsBySession.get(row.id) ?? []"), "Today's sessions must receive trial visitors separately");
assert(attendanceTodayPage.includes("clase de prueba"), "Today's attendance cards must show the separate trial count");
assert(attendanceSessionPage.includes("No cuentan en el plantel ni en la asistencia oficial"), "Session detail must explain the official-metric boundary");
assert(attendanceSessionPage.includes("roster={session.roster}"), "The official recorder must continue receiving only the enrolled roster");
assert(printer.includes("printTrialClassTicket"), "Thermal ticket printer is missing");

console.log("Trial classes v1 assertions passed.");
