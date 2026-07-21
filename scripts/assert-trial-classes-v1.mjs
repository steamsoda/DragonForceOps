import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260720120000_trial_classes_v1.sql", "utf8");
const action = fs.readFileSync("src/server/actions/trial-classes.ts", "utf8");
const query = fs.readFileSync("src/lib/queries/trial-classes.ts", "utf8");
const page = fs.readFileSync("src/app/(protected)/trial-classes/page.tsx", "utf8");
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
assert(query.includes("eq(\"session_date\", today)"), "Check-in choices must use today's generated sessions");
assert(page.includes("Las visitas de prueba no alteran planteles, asistencia oficial ni finanzas"), "Operator boundary must be explicit");
assert(printer.includes("printTrialClassTicket"), "Thermal ticket printer is missing");

console.log("Trial classes v1 assertions passed.");
