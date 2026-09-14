import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Execute the real page and query with controlled dependencies, not source regexes.
function load(path, mocks) {
  const exports = {};
  const js = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(js, { exports, URLSearchParams, console, require(id) {
    if (id in mocks) return mocks[id];
    throw new Error(`Unmocked dependency: ${id}`);
  } }, { filename: path });
  return exports;
}
const jsx = (type, props) => ({ type, props: props ?? {} });
function render(value) {
  if (value == null || typeof value === "boolean") return "";
  if (Array.isArray(value)) return value.map(render).join("");
  if (typeof value !== "object") return String(value);
  if (typeof value.type === "function") return render(value.type(value.props));
  return render(value.props.children);
}
const campus = { id: "campus", name: "Campus", code: "C" };
const player = { id: "player", first_name: "Player", last_name: "One", birth_date: "2015-01-01", public_player_id: "DF-TEST" };
const viewer = { isDirectorReadOnly: true, canViewFinancials: false, isDirector: false, isFrontDesk: false };
const cases = [
  ["viewer", viewer, false, false],
  ["director", { ...viewer, isDirectorReadOnly: false, canViewFinancials: true, isDirector: true }, true, true],
  ["front desk", { ...viewer, isDirectorReadOnly: false, canViewFinancials: true, isFrontDesk: true }, true, true],
  ["office", { ...viewer, isDirectorReadOnly: false, isOfficeAdmin: true }, false, false],
  ["sports", { ...viewer, isDirectorReadOnly: false, isSportsDirector: true }, false, false],
  ["finance veto", { ...viewer, isDirectorReadOnly: false, isDirector: true }, false, true],
  ["mixed role veto", { ...viewer, isDirector: true, isFrontDesk: true, canViewFinancials: true }, false, false],
];
const time = {
  getMonterreyMonthString: () => "2026-09",
  getMonterreyMonthBounds: () => ({ periodMonth: "2026-09-01", end: "2026-10-01T00:00:00Z" }),
  getMonterreyWeekBounds: () => ({ startDate: "2026-09-14", endDate: "2026-09-20" }),
};
const shared = { TRAINING_GROUP_GENDER_LABELS: {}, TRAINING_GROUP_PROGRAM_LABELS: {}, formatTrainingGroupBirthYearRange: () => "2015" };

for (const [name, context, balances, phones] of cases) {
  const reads = [];
  const tables = {
    training_groups: [{ id: "group", campus_id: campus.id, name: "Group", campuses: campus, birth_year_min: 2015, birth_year_max: 2015 }],
    training_group_assignments: [{ id: "assignment", training_group_id: "group", enrollment_id: "enrollment", player_id: player.id, enrollments: { id: "enrollment", status: "active", players: player } }],
    training_group_coaches: [], attendance_sessions: [], attendance_records: [],
    v_enrollment_balances: [{ enrollment_id: "enrollment", balance: 987654 }],
    player_guardians: [{ player_id: player.id, is_primary: true, guardians: { phone_primary: "PHONE_SECRET", phone_secondary: null } }],
  };
  const client = { from(table) {
    assert.ok(table in tables, `Unexpected table ${table}`);
    reads.push(table);
    const result = { data: tables[table], error: null };
    const builder = new Proxy({}, { get: (_, method) => method === "then"
      ? (resolve, reject) => Promise.resolve(result).then(resolve, reject)
      : () => builder });
    return builder;
  } };
  const query = load("src/lib/queries/attendance.ts", {
    "@/lib/auth/campuses": { getAttendanceCampusAccess: async () => ({ campuses: [campus], campusIds: [campus.id] }), canAccessAttendanceCampus: () => true },
    "@/lib/auth/permissions": { getPermissionContext: async () => context },
    "@/lib/attendance/month-range": { resolveAttendanceMonthRange: () => ({ monthFrom: "2026-09", monthTo: "2026-09", error: null }) },
    "@/lib/contacts/guardian-phones": { resolveGuardianPhones: () => ({ phone1: "PHONE_SECRET", phone2: null }) },
    "@/lib/attendance/risk": {}, "@/lib/queries/player-rpc-batching": {},
    "@/lib/supabase/admin": { createAdminClient: () => client },
    "@/lib/time": time, "@/lib/training-groups/shared": shared,
  });
  // A caller cannot request finance by bypassing the page's flag computation.
  const data = await query.getAttendanceGroupsMonthlyData({ groupId: "group", includePendingBalances: true, includeGuardianPhones: true });
  assert.equal(reads.includes("v_enrollment_balances"), balances, `${name}: balance query`);
  assert.equal(reads.includes("player_guardians"), phones, `${name}: phone query`);
  assert.equal(Object.hasOwn(data.players[0], "pendingBalance"), balances, `${name}: balance payload`);
  assert.equal(Object.hasOwn(data.players[0], "guardianPhone1"), phones, `${name}: phone payload`);
  assert.equal(Object.hasOwn(data.players[0], "guardianPhone2"), phones, `${name}: second phone payload`);

  let requested;
  const page = load("src/app/(protected)/attendance/groups/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "next/link": { default: "link" },
    "@/components/attendance/attendance-campus-buttons": { AttendanceCampusButtons: "campuses" },
    "@/components/ui/page-shell": { PageShell: "shell" },
    "@/lib/auth/permissions": { requireAttendanceReadContext: async () => context },
    "@/lib/queries/attendance": { getAttendanceGroupsMonthlyData: async filters => {
      requested = filters;
      // Even an overbroad query payload must not render financial columns.
      return { ...data, players: data.players.map(p => ({ ...p, pendingBalance: 987654, guardianPhone1: "PHONE_SECRET" })) };
    }, ATTENDANCE_STATUS_LABELS: {} },
  });
  const markup = render(await page.default({ searchParams: Promise.resolve({ group: "group", sort: "balance" }) }));
  assert.equal(requested.includePendingBalances, balances, `${name}: page balance flag`);
  assert.equal(requested.includeGuardianPhones, phones, `${name}: page phone flag`);
  assert.equal(markup.includes("Saldo pendiente"), balances, `${name}: balance header`);
  assert.equal(markup.includes("PHONE_SECRET"), phones, `${name}: rendered phone`);
  if (!balances) assert.doesNotMatch(markup, /987[,.]?654/, `${name}: rendered financial value`);
}
for (const [name, context] of [
  ["viewer", viewer],
  ["mixed viewer", { ...viewer, isDirector: true, canViewFinancials: true, hasOperationalAccess: true }],
  ["attendance admin", { ...viewer, isDirectorReadOnly: false, isAttendanceAdmin: true }],
  ["sports director", { ...viewer, isDirectorReadOnly: false, isSportsDirector: true }],
  ["coach", { ...viewer, isDirectorReadOnly: false, isCoach: true }],
  ["director", { ...viewer, isDirectorReadOnly: false, isDirector: true, canViewFinancials: true, hasOperationalAccess: true }],
]) {
  const calls = [];
  const page = load("src/app/(protected)/attendance/reports/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx }, "next/link": {},
    "@/components/attendance/attendance-risk-badge": {},
    "@/components/attendance/attendance-campus-buttons": {},
    "@/components/attendance/recent-attendance-chips": {},
    "@/components/attendance/weekly-coach-packet-print-button": {},
    "@/components/ui/page-shell": {},
    "@/lib/auth/permissions": { requireAttendanceReadContext: async () => context },
    "@/lib/queries/attendance": {
      getAttendanceReports: () => Promise.reject(new Error("stop-after-queries")),
      getAttendanceDailyReport: async () => ({}),
    },
    "@/lib/queries/attendance-collections-risk": { getAttendanceCollectionsRiskReport: async () => { calls.push("collections"); } },
    "@/lib/queries/weekly-coach-packet": { getWeeklyCoachPacket: async () => { calls.push("packet"); } },
  });
  await assert.rejects(page.default({ searchParams: Promise.resolve({}) }), /stop-after-queries/);
  assert.equal(calls.includes("packet"), !context.isDirectorReadOnly, `${name}: prior packet behavior`);
  assert.equal(calls.includes("collections"), !context.isDirectorReadOnly && Boolean(context.hasOperationalAccess && context.canViewFinancials), `${name}: collection gate`);
}
const projectionAdapter = load("src/lib/queries/attendance-readonly-report-data.ts", {
  "server-only": {}, "@/lib/time": time,
});
const safeRows = {
  training_groups: [{ id: "group", campus_id: campus.id, name: "Group", status: "active" }],
  campuses: [campus],
  training_group_assignments: [{ id: "assignment", training_group_id: "group", enrollment_id: "enrollment", player_id: player.id, end_date: null }],
  enrollments: [{ id: "enrollment", player_id: player.id, status: "active", campus_id: campus.id }],
  players: [{ ...player, status: "active" }],
  training_group_coaches: [{ id: "link", training_group_id: "group", coach_id: "coach", is_primary: true }],
  coaches: [{ id: "coach", first_name: "Coach", last_name: "One", is_active: true }],
  attendance_sessions: Array.from({ length: 501 }, (_, i) => ({ id: `s${i}`, training_group_id: "group", status: "completed", session_date: "2026-09-10" })),
  attendance_records: Array.from({ length: 501 }, (_, i) => ({ id: `r${i}`, session_id: `s${i}`, player_id: player.id, status: "present" })),
};
const projectionCalls = [];
const projectionClient = { rpc: async name => {
  assert.equal(name, "is_director_readonly");
  return { data: true, error: null };
}, from(view) {
  assert.ok(view.startsWith("v_director_readonly_"), "Never read raw tables");
  const resource = view.slice("v_director_readonly_".length);
  assert.ok(resource in safeRows, `Unexpected projection: ${view}`);
  let rows = safeRows[resource], columns, start = 0, end = 499;
  const builder = {
    select(value) { assert.doesNotMatch(value, /\*|amount|balance|payment|phone|notes|snapshot/); columns = value.split(","); return this; },
    in(key, ids) { assert.ok(ids.length <= 100, "Bound ID fan-out"); rows = rows.filter(r => ids.includes(r[key])); return this; },
    eq(key, value) { rows = rows.filter(r => r[key] === value); return this; },
    is(key, value) { return this.eq(key, value); },
    gte(key, value) { rows = rows.filter(r => r[key] >= value); return this; },
    lt(key, value) { rows = rows.filter(r => r[key] < value); return this; },
    order() { return this; }, range(from, to) { start = from; end = to; return this; }, returns() { return this; },
    then(resolve, reject) {
      projectionCalls.push({ view, start, end });
      return Promise.resolve({ data: rows.slice(start, end + 1).map(r => Object.fromEntries(columns.map(c => [c, r[c]]))), error: null }).then(resolve, reject);
    },
  };
  return builder;
} };
const inputs = await projectionAdapter.getReadOnlyCoachAttendanceInputs(projectionClient, [campus.id], "2026-09");
assert.equal(inputs.assignments.length, 1);
assert.equal(inputs.assignments[0].enrollments.players.id, player.id);
assert.equal(inputs.coachLinks[0].coaches.first_name, "Coach");
assert.equal(inputs.sessions.length, 501);
assert.equal(inputs.presentRecords.length, 501);
assert.ok(projectionCalls.some(c => c.start === 500), "Read subsequent pages");
assert.ok(projectionCalls.every(c => c.end - c.start === 499));
await assert.rejects(projectionAdapter.getReadOnlyCoachAttendanceInputs({
  rpc: async () => ({ data: false, error: null }), from: () => { throw new Error("must not read"); },
}, [campus.id], "2026-09"), /database_access_required/);
await assert.rejects(projectionAdapter.getReadOnlyCoachAttendanceInputs({
  ...projectionClient, rpc: async () => ({ data: null, error: { code: "PGRST202" } }),
}, [campus.id], "2026-09"), /database_access_required/);
await assert.rejects(projectionAdapter.getReadOnlyCoachAttendanceInputs({
  ...projectionClient, from: () => {
    const denied = new Proxy({}, { get: (_, name) => name === "then"
      ? resolve => resolve({ data: null, error: { code: "42501" } }) : () => denied });
    return denied;
  },
}, [campus.id], "2026-09"), /projection_unavailable/);
const commonReportRow = { campus_id: campus.id, campus_name: campus.name, training_group_id: "group", training_group_name: "Group", birth_year_min: 2015, birth_year_max: 2015 };
const workloadRow = { ...commonReportRow, session_id: "session", session_date: "2026-09-10", start_time: "16:00:00", end_time: "17:10:00", session_status: "completed",
  coach_snapshot: [{ coach_id: "historical", name: "Historical Coach", is_primary: true }], coach_snapshot_source: "completion",
  official_attended_count: "3", official_roster_count: "4", tryout_count: "1", total_served_count: "4" };
const frequencyRow = { ...commonReportRow, week_start: "2026-09-07", week_end: "2026-09-13", coach_ids: ["historical"], coach_names: "Historical Coach",
  sessions_offered: "3", player_weeks: "4", bucket_0: "1", bucket_1: "1", bucket_2: "1", bucket_3: "1", bucket_4_plus: "0",
  attended_session_records: "6", opportunity_records: "12", average_sessions_attended: "1.5", attendance_rate: "50" };
for (const [file, fn, staffRpc, viewerRpc, row] of [
  ["training-workload-report.ts", "getTrainingWorkloadReport", "get_training_workload_30d", "director_readonly_training_workload_30d", workloadRow],
  ["weekly-attendance-frequency-report.ts", "getWeeklyAttendanceFrequencyReport", "get_weekly_attendance_frequency_v1", "director_readonly_weekly_attendance_frequency_v1", frequencyRow],
]) {
  async function run(isViewer, error = null, campusId = campus.id) {
    const rpcCalls = [];
    let adminCalls = 0, campusCalls = 0;
    const client = { from(view) {
      assert.ok(isViewer, "Staff should retain its campus loader");
      assert.equal(view, "v_director_readonly_campuses", "No raw lookup dependency");
      const builder = new Proxy({}, { get: (_, key) => key === "then"
        ? resolve => resolve({ data: [campus], error: null }) : () => builder });
      return builder;
    }, rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      assert.equal(name, isViewer ? viewerRpc : staffRpc);
      assert.equal(args.p_campus_id, campus.id);
      if (fn === "getTrainingWorkloadReport") assert.ok(!Number.isNaN(Date.parse(args.p_as_of)));
      else assert.equal(args.p_week_count, 8);
      return { data: error ? null : [row], error };
    } };
    const query = load(`src/lib/queries/${file}`, {
      "@/lib/auth/permissions": { getPermissionContext: async () => ({ ...viewer, isDirectorReadOnly: isViewer, hasAttendanceReadAccess: true, supabase: client }) },
      "@/lib/auth/campuses": {
        getAttendanceCampusAccess: async () => { campusCalls++; assert.equal(isViewer, false); return { campuses: [campus], campusIds: [campus.id], defaultCampusId: campus.id }; },
        canAccessAttendanceCampus: () => true,
      },
      "@/lib/supabase/admin": { createAdminClient: () => { adminCalls++; assert.equal(isViewer, false, "No viewer admin client or fallback"); return client; } },
      "@/lib/time": { ...time, getMonterreyDateString: () => "2026-09-14" },
    });
    if (error || campusId !== campus.id) {
      await assert.rejects(query[fn]({ campusId }), e => Boolean(e && (e === error || /fixture_denied|fixture_missing|campus_denied/.test(e.message))));
    } else {
      const result = await query[fn]({ campusId });
      assert.equal(adminCalls, isViewer ? 0 : 1);
      assert.equal(campusCalls, isViewer ? 0 : 1);
      assert.equal(rpcCalls.length, 1);
      assert.match(JSON.stringify(result), /Historical Coach/);
      return JSON.parse(JSON.stringify(result));
    }
    assert.equal(adminCalls, 0);
    assert.equal(rpcCalls.length, campusId === campus.id ? 1 : 0);
  }
  assert.deepEqual(await run(true), await run(false), `${fn}: viewer/staff report math parity`);
  await run(true, { code: "42501", message: "fixture_denied" });
  await run(true, { code: "PGRST202", message: "fixture_missing" });
  await run(true, null, "outside-campus");
}
for (const isViewer of [true, false]) {
  const secret = "FINANCIAL_FREEFORM_SENTINEL";
  const reads = [];
  const context = { ...viewer, isDirectorReadOnly: isViewer, hasAttendanceReadAccess: true, hasAttendanceWriteAccess: !isViewer, isDirector: !isViewer };
  const session = { id: "session", campus_id: campus.id, team_id: null, training_group_id: "group", session_type: "training", status: "completed",
    session_date: "2026-09-10", start_time: "16:00", end_time: "17:10", opponent_name: null, notes: secret, cancelled_reason: secret,
    cancelled_reason_code: "rain", campuses: campus, training_groups: { name: "Group", birth_year_min: 2015, birth_year_max: 2015 } };
  const tables = {
    attendance_sessions: [session],
    attendance_closures: [{ id: "closure", campus_id: campus.id, starts_on: "2026-09-10", ends_on: "2026-09-10", reason_code: "rain", title: "Rain", notes: secret, campuses: campus }],
    attendance_records: [{ id: "record", session_id: "session", enrollment_id: "enrollment", player_id: player.id, status: "present", source: "manual", incident_id: "incident", note: secret, players: player }],
    enrollment_incidents: [{ id: "incident", enrollment_id: "enrollment", incident_type: "injury", note: secret }],
    training_group_assignments: [{ id: "assignment", training_group_id: "group", enrollment_id: "enrollment", player_id: player.id, enrollments: { id: "enrollment", status: "active", players: player } }],
    training_group_coaches: [], team_assignments: [], trial_visits: [],
  };
  const client = { from(table) {
    assert.ok(table in tables, `Unexpected core table: ${table}`);
    const call = { table, columns: "" }; reads.push(call);
    let single = false;
    const builder = new Proxy({}, { get: (_, method) => {
      if (method === "select") return columns => { call.columns = columns; return builder; };
      if (method === "maybeSingle") return () => { single = true; return builder; };
      // Deliberately return extra note fields to exercise explicit null mapping too.
      if (method === "then") return (resolve, reject) => Promise.resolve({ data: single ? tables[table][0] : tables[table], error: null }).then(resolve, reject);
      return () => builder;
    } });
    return builder;
  } };
  const query = load("src/lib/queries/attendance.ts", {
    "@/lib/auth/campuses": { getAttendanceCampusAccess: async () => ({ campuses: [campus], campusIds: [campus.id] }), canAccessAttendanceCampus: () => true, canWriteAttendanceCampus: () => !isViewer },
    "@/lib/auth/permissions": { getPermissionContext: async () => context },
    "@/lib/attendance/month-range": {}, "@/lib/contacts/guardian-phones": {},
    "@/lib/attendance/risk": {}, "@/lib/queries/player-rpc-batching": {},
    "@/lib/supabase/admin": { createAdminClient: () => client },
    "@/lib/time": { ...time, getMonterreyDateString: () => "2026-09-10" }, "@/lib/training-groups/shared": shared,
  });
  const landing = await query.listAttendanceSessions({ date: "2026-09-10" });
  const detail = await query.getAttendanceSessionDetail("session");
  const calendar = await query.getAttendanceCalendarData({ month: "2026-09" });
  const daily = await query.getAttendanceDailyReport({ date: "2026-09-10" });
  assert.equal(landing.sessions.length, 1);
  assert.equal(detail.roster.length, 1);
  assert.equal(daily.totals.present, 1);
  assert.equal(calendar.totals.completed, 1);
  assert.equal(detail.notes, isViewer ? null : secret);
  assert.equal(detail.cancelledReason, isViewer ? null : secret);
  assert.equal(detail.roster[0].note, isViewer ? null : secret);
  assert.equal(detail.roster[0].incidentNote, isViewer ? null : secret);
  assert.equal(daily.sessions[0].notes, isViewer ? null : secret);
  assert.equal(daily.sessions[0].cancelledReason, isViewer ? null : secret);
  assert.equal(daily.closures[0].notes, isViewer ? null : secret);
  assert.equal(daily.totals.sessionNotes, isViewer ? 0 : 1);
  assert.equal(daily.totals.playerNotes, isViewer ? 0 : 1);
  assert.equal(calendar.days.find(d => d.date === "2026-09-10").closures[0].notes, isViewer ? null : secret);
  assert.equal(reads.some(r => r.table === "enrollment_incidents"), !isViewer, "Skip incident query for viewer");
  if (isViewer) {
    for (const read of reads) assert.doesNotMatch(read.columns, /(?:^|,\s*)(?:note|notes|cancelled_reason)(?:,|$)/, `Forbidden select in ${read.table}`);
    assert.ok(!JSON.stringify({ landing, detail, calendar, daily }).includes(secret), "No freeform content anywhere in viewer payload");
    const count = reads.length;
    await assert.rejects(query.getAttendanceDailyNotes({ date: "2026-09-10" }), /attendance_freeform_denied/);
    assert.equal(reads.length, count, "Notes-only query denied before any table read");
    const notesPage = load("src/app/(protected)/attendance/notes/page.tsx", {
      "react/jsx-runtime": { jsx, jsxs: jsx }, "next/link": {},
      "next/navigation": { redirect: path => { assert.equal(path, "/unauthorized"); throw new Error("viewer_notes_redirect"); } },
      "@/components/attendance/attendance-campus-buttons": {}, "@/components/ui/page-shell": {},
      "@/lib/auth/permissions": { requireAttendanceReadContext: async () => context },
      "@/lib/queries/attendance": { getAttendanceDailyNotes: () => { throw new Error("must_not_fetch_notes"); } },
    });
    await assert.rejects(notesPage.default({ searchParams: Promise.resolve({}) }), /viewer_notes_redirect/);
  } else {
    const notes = await query.getAttendanceDailyNotes({ date: "2026-09-10" });
    assert.ok(JSON.stringify(notes).includes(secret), "Staff notes-only behavior retained");
  }
}
console.log(`Attendance privacy checks passed (group/packet permissions, projection/RPC contracts, core freeform omission and staff parity).`);
