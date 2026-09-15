import "server-only";
import { z } from "zod";
import type { PermissionContext } from "@/lib/auth/permissions";
import { getMonterreyDateString, getMonterreyMonthString, getMonterreyWeekBounds } from "@/lib/time";
import { formatTrainingGroupDisplayName } from "@/lib/training-groups/shared";

const id = z.string().uuid();
const text = z.string().nullable();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// Subset schemas discard other reviewed operational columns, never query base tables.
const resources = {
  campuses: z.object({ id, name: z.string(), code: z.string() }),
  enrollments: z.object({ id, player_id: id, campus_id: id, status: z.string(), start_date: dateOnly, end_date: dateOnly.nullable(), inscription_date: dateOnly, created_at: z.string() }),
  players: z.object({ id, public_player_id: text, first_name: text, last_name: text, birth_date: text, gender: text, status: z.string(), level: z.union([z.string(), z.number()]).nullable() }),
  guardians: z.object({ id, first_name: text, last_name: text, phone_primary: text, phone_secondary: text, email: text, relationship_label: text }),
  player_guardians: z.object({ id, player_id: id, guardian_id: id, is_primary: z.boolean() }),
  training_groups: z.object({ id, name: z.string(), program: z.string(), level_label: text, group_code: text, gender: z.string(), birth_year_min: z.number().int().nullable(), birth_year_max: z.number().int().nullable() }),
  training_group_assignments: z.object({ id, enrollment_id: id, training_group_id: id, start_date: text, end_date: text }),
  teams: z.object({ id, name: z.string(), level: z.union([z.string(), z.number()]).nullable() }),
  team_assignments: z.object({ id, enrollment_id: id, team_id: id, start_date: text, end_date: text, is_primary: z.boolean() }),
  player_measurement_sessions: z.object({ id, enrollment_id: id }),
  products: z.object({ id, name: z.string(), is_active: z.boolean() }),
  attendance_sessions: z.object({ id, campus_id: id, session_date: z.string(), status: z.string() }),
  attendance_records: z.object({ id, session_id: id, player_id: id, status: z.string() }),
  trial_prospects: z.object({ id, campus_id: id, preferred_training_group_id: id.nullable(), first_name: z.string(), last_name: z.string(), birth_date: z.string(), gender: z.enum(["male", "female"]), guardian_name: text, guardian_phone: z.string(), status: z.enum(["active", "converted", "closed"]), created_at: z.string() }),
  trial_visits: z.object({ id, prospect_id: id, campus_id: id, training_group_id: id, visit_date: z.string(), visit_number: z.number().int() }),
  uniform_orders: z.object({ id, player_id: id, enrollment_id: id, uniform_type: z.enum(["training", "game"]), size: text, status: z.enum(["pending_order", "ordered", "delivered"]), ordered_at: text, delivered_at: text }),
};
type Resource = keyof typeof resources;
type Filters = Record<string, string | undefined>;
type Row<K extends Resource> = z.infer<(typeof resources)[K]>;

export function managementReader(context: PermissionContext) {
  return async function rows<K extends Resource>(resource: K, ids?: string[]): Promise<Row<K>[]> {
    if (!context.isDirectorReadOnly || context.canViewFinancials) throw new Error("reader_required");
    const output: Row<K>[] = [];
    // IDs always refer to the resource's primary key, including measurement IDs.
    const uniqueIds = ids ? [...new Set(ids)] : undefined;
    const chunks = uniqueIds ? Array.from({ length: Math.ceil(uniqueIds.length / 100) }, (_, i) => uniqueIds.slice(i * 100, (i + 1) * 100)) : [null];
    for (const chunk of chunks) {
      for (let offset = 0; ; offset += 500) {
        const loadPage = () => {
          if (resource !== "player_measurement_sessions") return context.supabase.rpc("director_readonly_rows", { p_resource: resource, p_ids: chunk, p_limit: 500, p_offset: offset });
          let query = context.supabase.from("v_director_readonly_player_measurement_sessions").select("id,enrollment_id");
          if (chunk) query = query.in("id", chunk);
          return query.order("id").range(offset, offset + 499);
        };
        const { data, error } = await loadPage();
        if (error) throw new Error("safe_projection_unavailable");
        const parsed = z.array(resources[resource]).parse(data) as Row<K>[];
        output.push(...parsed);
        if (parsed.length < 500) break;
        // Never silently return a truncated result at the DB reader's offset limit.
        if (offset >= 1_000_000) throw new Error("safe_projection_too_large");
      }
    }
    return output;
  };
}
type Reader = ReturnType<typeof managementReader>;
function groupName(group: Row<"training_groups"> | undefined) { return group ? formatTrainingGroupDisplayName(group) : "Sin grupo"; }
function name(row: { first_name: string | null; last_name: string | null }) { return [row.first_name, row.last_name].filter(Boolean).join(" ").trim(); }
function year(value: string | null) { return value ? Number(value.slice(0, 4)) : null; }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function search(filters: Filters) { const value = (filters.q ?? "").trim(); if (value.length > 100) throw new Error("invalid_search"); return value; }
function matches(value: string, q: string) { return normalize(value).includes(normalize(q)); }
function choice<T extends string>(value: string | undefined, options: readonly T[], fallback: T): T {
  if (!value) return fallback;
  if (!options.includes(value as T)) throw new Error("invalid_filter");
  return value as T;
}
function birthYear(value: string | undefined) {
  if (!value || value === "all") return null;
  if (!/^(19|20)\d{2}$/.test(value)) throw new Error("invalid_birth_year");
  return Number(value);
}
function paginate<T>(rows: T[], filters: Filters) {
  const requested = Number(filters.page || "1");
  if (!Number.isSafeInteger(requested) || requested < 1) throw new Error("invalid_page");
  const pageSize = 50, totalRows = rows.length, page = Math.min(requested, Math.max(1, Math.ceil(totalRows / pageSize)));
  return { page, pageSize, totalRows, rows: rows.slice((page - 1) * pageSize, page * pageSize) };
}
function day(value: string) { return getMonterreyDateString(new Date(value)); }
function range(from: string | undefined, to: string | undefined) {
  const today = getMonterreyDateString();
  const start = from || `${today.slice(0, 7)}-01`, end = to || today;
  for (const date of [start, end]) if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("invalid_date");
  if (start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 366) throw new Error("invalid_range");
  return { start, end };
}
async function scope(read: Reader, filters: Filters) {
  const campuses = (await read("campuses")).sort((a, b) => a.name.localeCompare(b.name, "es-MX"));
  const selectedCampusId = filters.campus === "all" ? "" : filters.campus || "";
  if (selectedCampusId && !campuses.some((c) => c.id === selectedCampusId)) throw new Error("campus_denied");
  return { campuses, selectedCampusId, campusMap: new Map(campuses.map((c) => [c.id, c])) };
}
async function roster(read: Reader, filters: Filters, activeOnly = true) {
  const scoped = await scope(read, filters);
  const enrollments = (await read("enrollments")).filter((e) => (!scoped.selectedCampusId || e.campus_id === scoped.selectedCampusId) && (!activeOnly || e.status === "active"));
  const players = await read("players", [...new Set(enrollments.map((e) => e.player_id))]);
  const playerMap = new Map(players.filter((p) => !activeOnly || p.status === "active").map((p) => [p.id, p]));
  return { ...scoped, enrollments: enrollments.filter((e) => playerMap.has(e.player_id)), playerMap };
}
async function groups(read: Reader) {
  const all = await read("training_groups");
  const assignments = (await read("training_group_assignments")).filter((a) => !a.end_date).sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? "") || a.id.localeCompare(b.id));
  const groupMap = new Map(all.map((g) => [g.id, g]));
  return { assignments, groupMap };
}
async function contactRows(read: Reader, filters: Filters) {
  const data = await roster(read, filters);
  const groupData = await groups(read);
  const links = (await read("player_guardians")).filter((link) => data.playerMap.has(link.player_id)).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.id.localeCompare(b.id));
  const guardianMap = new Map((await read("guardians", [...new Set(links.map((l) => l.guardian_id))])).map((g) => [g.id, g]));
  const rows = data.enrollments.map((e) => {
    const p = data.playerMap.get(e.player_id)!, c = data.campusMap.get(e.campus_id)!;
    const assigned = groupData.assignments.filter((a) => a.enrollment_id === e.id).flatMap((a) => groupData.groupMap.get(a.training_group_id) ?? []);
    const guardians = links.filter((l) => l.player_id === p.id).flatMap((l) => {
      const g = guardianMap.get(l.guardian_id); if (!g) return [];
      return [{ id: g.id, firstName: g.first_name?.trim() ?? "", lastName: g.last_name?.trim() ?? "", fullName: name(g), phonePrimary: g.phone_primary?.trim() ?? "", phoneSecondary: g.phone_secondary?.trim() ?? "", email: g.email?.trim() ?? "", relationshipLabel: g.relationship_label ?? "", isPrimary: l.is_primary }];
    });
    const primaryGuardian = guardians[0] ?? null;
    return { enrollmentId: e.id, playerId: p.id, publicPlayerId: p.public_player_id ?? "", playerName: name(p), birthYear: year(p.birth_date), gender: p.gender,
      campusId: c.id, campusName: c.name, campusCode: c.code, groupNames: assigned.map(groupName), trainingGroupName: groupName(assigned[0]), trainingGroupSubtitle: assigned[0]?.level_label ?? "",
      guardians, primaryGuardian, missingGuardian: !guardians.length, missingGuardianName: !primaryGuardian?.firstName || !primaryGuardian.lastName,
      missingPrimaryPhone: !primaryGuardian?.phonePrimary, missingSecondaryPhone: !!primaryGuardian && !primaryGuardian.phoneSecondary, missingEmail: !primaryGuardian?.email };
  }).sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999) || a.playerName.localeCompare(b.playerName, "es-MX") || a.enrollmentId.localeCompare(b.enrollmentId));
  return { ...data, rows };
}

export async function assembleManagementData(resource: string, filters: Filters, context: PermissionContext): Promise<unknown> {
  const read = managementReader(context);
  if (resource === "director_readonly_caja_v1") {
    const data = await roster(read, filters), q = search(filters);
    if (filters.enrollmentId && !data.enrollments.some((e) => e.id === filters.enrollmentId)) throw new Error("enrollment_denied");
    const players = data.enrollments.filter((e) => e.id === filters.enrollmentId || matches(`${name(data.playerMap.get(e.player_id)!)} ${data.playerMap.get(e.player_id)!.public_player_id ?? ""}`, q)).map((e) => ({ enrollmentId: e.id, playerName: name(data.playerMap.get(e.player_id)!), campusName: data.campusMap.get(e.campus_id)!.name, birthYear: year(data.playerMap.get(e.player_id)!.birth_date) }));
    const products = filters.enrollmentId ? (await read("products")).filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.name })) : [];
    return { campuses: data.campuses.map(({ id, name }) => ({ id, name })), players, products };
  }
  if (resource === "director_readonly_contacts_v1") {
    const data = await contactRows(read, filters), q = search(filters);
    const selectedYear = birthYear(filters.year);
    const gender = choice(filters.gender, ["", "male", "female"], "");
    const candidates = data.rows.filter((r) => !gender || r.gender === gender);
    const birthYears = [...new Set(candidates.flatMap((r) => r.birthYear === null ? [] : [r.birthYear]))].sort((a, b) => b - a);
    const selected = candidates.filter((r) => (selectedYear === null || r.birthYear === selectedYear) && matches([r.playerName, r.publicPlayerId, ...r.groupNames, ...r.guardians.flatMap((g) => [g.fullName, g.phonePrimary, g.phoneSecondary, g.email])].join(" "), q));
    const status = choice(filters.status, ["incomplete", "missing_primary_phone", "missing_secondary_phone", "missing_email", "missing_guardian", "all"], "incomplete");
    const predicates = { incomplete: (r: typeof selected[number]) => r.missingGuardian || r.missingGuardianName || r.missingPrimaryPhone || r.missingSecondaryPhone || r.missingEmail,
      missing_primary_phone: (r: typeof selected[number]) => r.missingPrimaryPhone, missing_secondary_phone: (r: typeof selected[number]) => r.missingSecondaryPhone,
      missing_email: (r: typeof selected[number]) => r.missingEmail, missing_guardian: (r: typeof selected[number]) => r.missingGuardian, all: () => true };
    return { campuses: data.campuses, selectedCampusId: data.selectedCampusId, selectedBirthYear: selectedYear, selectedGender: gender, birthYears, q, status,
      counts: Object.fromEntries(Object.entries(predicates).map(([key, fn]) => [key, selected.filter(fn).length])),
      rows: selected.filter(predicates[status]).map(({ gender: _gender, groupNames: _groups, ...r }) => r) };
  }
  if (resource === "director_readonly_intake_v1") {
    // Campus boards retain the complete campus cohort; selected campus narrows rows only.
    const selectedScope = await scope(read, filters), data = await roster(read, {}, false), bounds = range(filters.start, filters.end);
    const { assignments, groupMap } = await groups(read);
    const teamMap = new Map((await read("teams")).map((t) => [t.id, t]));
    const teams = (await read("team_assignments")).filter((a) => !a.end_date && a.is_primary).sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? "") || a.id.localeCompare(b.id));
    const measured = new Set((await read("player_measurement_sessions")).map((m) => m.enrollment_id));
    const status = choice(filters.status, ["all", "pending_sports", "pending_nutrition", "complete"], "all"), selectedYear = birthYear(filters.birthYear);
    const allRows = data.enrollments.filter((e) => day(e.created_at) >= bounds.start && day(e.created_at) <= bounds.end).map((e) => {
      const p = data.playerMap.get(e.player_id)!, c = data.campusMap.get(e.campus_id)!;
      const group = groupMap.get(assignments.find((a) => a.enrollment_id === e.id)?.training_group_id ?? ""), team = teamMap.get(teams.find((a) => a.enrollment_id === e.id)?.team_id ?? "");
      return { enrollmentId: e.id, playerId: p.id, playerName: name(p), campusId: c.id, campusName: c.name, campusCode: c.code, status: e.status, createdAt: e.created_at, inscriptionDate: e.inscription_date,
        birthYear: year(p.birth_date), gender: p.gender, genderLabel: p.gender === "male" ? "Varonil" : p.gender === "female" ? "Femenil" : "Sin genero",
        currentTeamId: team?.id ?? null, currentTeamName: team?.name ?? null, currentTrainingGroupId: group?.id ?? null, currentTrainingGroupName: group ? groupName(group) : null,
        resolvedLevel: team?.level == null && p.level == null ? null : String(team?.level ?? p.level), sportsComplete: e.status === "active" && !!group, nutritionComplete: e.status === "active" && measured.has(e.id),
        sportsActionHref: `/attendance/settings?campus=${c.id}${year(p.birth_date) ? `&birthYear=${year(p.birth_date)}` : ""}`, nutritionActionHref: `/nutrition/players/${p.id}`, playerActionHref: `/players/${p.id}` };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.enrollmentId.localeCompare(b.enrollmentId));
    const filtered = allRows.filter((r) => (selectedYear === null || r.birthYear === selectedYear) && (status === "all" || (r.status === "active" && (status === "pending_sports" ? !r.sportsComplete : status === "pending_nutrition" ? !r.nutritionComplete : r.sportsComplete && r.nutritionComplete))));
    const counts = (rows: typeof allRows) => ({ total: rows.length, pendingSports: rows.filter((r) => r.status === "active" && !r.sportsComplete).length, pendingNutrition: rows.filter((r) => r.status === "active" && !r.nutritionComplete).length, complete: rows.filter((r) => r.status === "active" && r.sportsComplete && r.nutritionComplete).length });
    const rows = filtered.filter((r) => !selectedScope.selectedCampusId || r.campusId === selectedScope.selectedCampusId);
    return { campuses: data.campuses.map(({ id, name }) => ({ id, name })), selectedCampusId: selectedScope.selectedCampusId, selectedStartDate: bounds.start, selectedEndDate: bounds.end, selectedBirthYear: selectedYear === null ? "" : String(selectedYear), selectedStatus: status,
      campusBoards: data.campuses.map((c) => ({ campusId: c.id, campusName: c.name, ...counts(filtered.filter((r) => r.campusId === c.id)) })), birthYearOptions: [...new Set(allRows.flatMap((r) => r.birthYear === null ? [] : [r.birthYear]))].sort((a, b) => b - a), rows, totals: counts(rows), access: { canOpenSports: false, canOpenNutrition: false, canOpenPlayer: false } };
  }
  if (resource === "director_readonly_dashboard_v1") {
    const scoped = await scope(read, filters), month = filters.month || getMonterreyMonthString();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("invalid_month");
    const enrollments = (await read("enrollments")).filter((e) => !scoped.selectedCampusId || e.campus_id === scoped.selectedCampusId);
    const week = getMonterreyWeekBounds(), start = day(week.start), end = day(week.end);
    const completedSessions = (await read("attendance_sessions")).filter((s) => (!scoped.selectedCampusId || s.campus_id === scoped.selectedCampusId) && s.status === "completed");
    const sessions = new Set(completedSessions.filter((s) => s.session_date >= start && s.session_date < end).map((s) => s.id));
    const allRecords = await read("attendance_records");
    const records = allRecords.filter((r) => sessions.has(r.session_id));
    const monthlySessions = new Set(completedSessions.filter((s) => s.session_date.startsWith(month)).map((s) => s.id));
    const activePlayers = new Set(enrollments.filter((e) => e.status === "active").map((e) => e.player_id));
    const attendedPlayers = new Set(allRecords.filter((r) => monthlySessions.has(r.session_id) && r.status === "present" && activePlayers.has(r.player_id)).map((r) => r.player_id));
    return { campuses: scoped.campuses.map(({ id, name }) => ({ id, name })), selectedCampusId: scoped.selectedCampusId, selectedMonth: month,
      activeEnrollments: enrollments.filter((e) => e.status === "active").length, newEnrollmentsThisMonth: enrollments.filter((e) => day(e.created_at).startsWith(month)).length,
      bajasThisMonth: enrollments.filter((e) => e.status === "ended" && e.end_date?.startsWith(month)).length, attendanceRateThisWeek: records.length ? Math.round(records.filter((r) => r.status === "present").length / records.length * 1000) / 10 : null, attendanceRecordsThisWeek: records.length,
      attendedPlayersThisMonth: attendedPlayers.size, playersWithoutAttendanceThisMonth: activePlayers.size - attendedPlayers.size };
  }
  if (resource === "director_readonly_uniforms_v1") {
    const data = await roster(read, filters, false), q = search(filters), type = choice(filters.type, ["", "training", "game"], ""), queue = choice(filters.queue, ["all", "pending_order", "ordered", "pending_delivery", "delivered"], "all");
    const enrollmentMap = new Map(data.enrollments.map((e) => [e.id, e]));
    const allRows = (await read("uniform_orders")).flatMap((o) => {
      const e = enrollmentMap.get(o.enrollment_id), p = data.playerMap.get(o.player_id);
      if (!e || !p || e.player_id !== p.id || (type && o.uniform_type !== type) || !matches(name(p), q)) return [];
      return [{ id: o.id, playerName: name(p), campusId: e.campus_id, campusName: data.campusMap.get(e.campus_id)!.name, birthYear: year(p.birth_date), uniformType: o.uniform_type, size: o.size, status: o.status, orderedAt: o.ordered_at, deliveredAt: o.delivered_at }];
    }).sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999) || a.playerName.localeCompare(b.playerName, "es-MX") || a.id.localeCompare(b.id));
    return { campuses: data.campuses.map(({ id, name }) => ({ id, name })), selectedCampusId: data.selectedCampusId, selectedType: type, selectedQueue: queue, q,
      counts: { pendingOrder: allRows.filter((r) => r.status === "pending_order").length, ordered: allRows.filter((r) => r.status === "ordered").length, delivered: allRows.filter((r) => r.status === "delivered").length },
      ...paginate(allRows.filter((r) => queue === "all" || (queue === "pending_delivery" ? r.status !== "delivered" : r.status === queue)), filters) };
  }
  if (resource === "director_readonly_trials_v1") {
    const scoped = await scope(read, filters), q = search(filters), status = choice(filters.status, ["all", "active", "converted", "closed"], "active"), bounds = range(filters.reportFrom, filters.reportTo);
    const prospects = (await read("trial_prospects")).filter((p) => !scoped.selectedCampusId || p.campus_id === scoped.selectedCampusId);
    const prospectIds = new Set(prospects.map((p) => p.id)), groupMap = new Map((await read("training_groups")).map((g) => [g.id, g]));
    const visits = (await read("trial_visits")).filter((v) => prospectIds.has(v.prospect_id) && (!scoped.selectedCampusId || v.campus_id === scoped.selectedCampusId));
    const rows = prospects.filter((p) => (status === "all" || p.status === status) && matches(`${name(p)} ${p.guardian_name ?? ""} ${p.guardian_phone}`, q)).sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)).map((p) => ({ id: p.id, campusName: scoped.campusMap.get(p.campus_id)!.name, firstName: p.first_name, lastName: p.last_name, birthDate: p.birth_date, gender: p.gender, guardianName: p.guardian_name, guardianPhone: p.guardian_phone, status: p.status, preferredGroupName: groupName(groupMap.get(p.preferred_training_group_id ?? "")),
      visits: visits.filter((v) => v.prospect_id === p.id).sort((a, b) => a.visit_number - b.visit_number).map((v) => ({ id: v.id, visitDate: v.visit_date, visitNumber: v.visit_number, groupName: groupName(groupMap.get(v.training_group_id)), coachNames: [] })) }));
    const cohort = prospects.filter((p) => day(p.created_at) >= bounds.start && day(p.created_at) <= bounds.end), periodVisits = visits.filter((v) => v.visit_date >= bounds.start && v.visit_date <= bounds.end), visitorIds = new Set(periodVisits.map((v) => v.prospect_id));
    const birthCounts = new Map<number | null, number>();
    for (const p of prospects.filter((p) => visitorIds.has(p.id))) birthCounts.set(year(p.birth_date), (birthCounts.get(year(p.birth_date)) ?? 0) + 1);
    const { rows: pageRows, ...pagination } = paginate(rows, filters);
    return { campuses: scoped.campuses.map(({ id, name }) => ({ id, name })), selectedCampusId: scoped.selectedCampusId, q, selectedStatus: status, ...pagination, prospects: pageRows,
      report: { dateFrom: bounds.start, dateTo: bounds.end, registeredProspects: cohort.length, convertedProspects: cohort.filter((p) => p.status === "converted").length, visits: periodVisits.length, visitingProspects: visitorIds.size, birthYears: [...birthCounts].map(([birthYear, count]) => ({ birthYear, count })).sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999)) } };
  }
  throw new Error("unsupported_management_resource");
}
