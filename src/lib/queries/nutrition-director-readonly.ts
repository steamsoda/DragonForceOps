import "server-only";
import { requireNutritionReadContext } from "@/lib/auth/permissions";
import type { AccessibleCampus } from "@/lib/auth/campuses";
import type { WhoGrowthReferenceRow } from "@/lib/nutrition/growth";
import type {
  ActiveNutritionEnrollmentRow, GuardianLinkRow, MeasurementSessionRow,
  NutritionTrainingGroupRow, NutritionTrainingGroupAssignmentRow, RecentMeasurementRow,
} from "./nutrition";

type Resource = "campuses" | "players" | "enrollments" | "training_groups" |
  "training_group_assignments" | "player_measurement_sessions" | "player_guardians" |
  "guardians" | "who_growth_reference";
type Filters = {
  eq?: Record<string, string>;
  ids?: { column: string; values: string[] };
  nullColumn?: string;
  start?: string;
  end?: string;
  order?: Array<[string, boolean]>;
  limit?: number;
};
const MEASUREMENTS = "id,player_id,enrollment_id,campus_id,measured_at,source,weight_kg,height_cm,waist_circumference_cm,created_at,updated_at";
const GROUPS = "id,campus_id,name,program,level_label,group_code,gender,birth_year_min,birth_year_max,start_time,end_time,status";
const CONTACT = "id,first_name,last_name,phone_primary,phone_secondary,email,relationship_label";

// Only authenticated, guarded projections. Never fall back to service credentials.
async function rows<T>(resource: Resource, columns: string, filters: Filters = {}): Promise<T[]> {
  const context = await requireNutritionReadContext();
  if (!context.isDirectorReadOnly) throw new Error("director_readonly_required");
  if (filters.ids?.values.length === 0) return [];
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = context.supabase.from(`v_director_readonly_${resource}`).select(columns);
    for (const [column, value] of Object.entries(filters.eq ?? {})) query = query.eq(column, value);
    if (filters.ids) query = query.in(filters.ids.column, filters.ids.values);
    if (filters.nullColumn) query = query.is(filters.nullColumn, null);
    if (filters.start) query = query.gte("measured_at", filters.start);
    if (filters.end) query = query.lt("measured_at", filters.end);
    for (const [column, ascending] of filters.order ?? []) query = query.order(column, { ascending });
    // Every page has a deterministic tie-breaker, including compound-key references.
    if (resource === "who_growth_reference") {
      query = query.order("indicator").order("age_months");
    } else query = query.order("id");
    const pageSize = filters.limit ?? 500;
    const { data, error } = await query.range(offset, offset + pageSize - 1).returns<T[]>();
    if (error) throw new Error(`nutrition_read_failed:${resource}`);
    result.push(...(data ?? []));
    if (filters.limit || (data?.length ?? 0) < 500) return result;
  }
}

async function byIds<T>(resource: Resource, columns: string, column: string, ids: string[], filters: Filters = {}) {
  const unique = [...new Set(ids)];
  const result: T[] = [];
  for (let offset = 0; offset < unique.length; offset += 100) {
    result.push(...await rows<T>(resource, columns, { ...filters, ids: { column, values: unique.slice(offset, offset + 100) } }));
  }
  return result;
}

export function campuses() {
  return rows<AccessibleCampus>("campuses", "id,code,name", { eq: { is_active: "true" }, order: [["name", true]] });
}

type Player = NonNullable<ActiveNutritionEnrollmentRow["players"]> & { id: string };
async function players(ids: string[]) {
  const data = await byIds<Omit<Player, "medical_notes">>("players", "id,public_player_id,first_name,last_name,birth_date,gender,level", "id", ids);
  return data.map(row => ({ ...row, medical_notes: null }));
}

export async function enrollments(campusIds: string[], playerId?: string): Promise<ActiveNutritionEnrollmentRow[]> {
  const data = await rows<Omit<ActiveNutritionEnrollmentRow, "players" | "campuses">>("enrollments",
    "id,player_id,campus_id,created_at,start_date,inscription_date", {
      eq: { status: "active", ...(playerId ? { player_id: playerId } : {}) },
      ids: { column: "campus_id", values: campusIds },
      order: [[playerId ? "start_date" : "created_at", false]],
    });
  const [playerRows, campusRows] = await Promise.all([players(data.map(row => row.player_id)), campuses()]);
  const playerMap = new Map(playerRows.map(row => [row.id, row]));
  const campusMap = new Map(campusRows.map(row => [row.id, row]));
  return data.map(row => ({ ...row, players: playerMap.get(row.player_id) ?? null, campuses: campusMap.get(row.campus_id) ?? null }));
}

export async function groups(campusId: string, gender = "") {
  const data = await rows<NutritionTrainingGroupRow>("training_groups", GROUPS, {
    eq: { campus_id: campusId, status: "active" }, order: [["program", true], ["start_time", true]],
  });
  return gender ? data.filter(row => row.gender === gender || row.gender === "mixed") : data;
}

export async function assignments(campusId: string): Promise<NutritionTrainingGroupAssignmentRow[]> {
  const groupRows = await groups(campusId);
  const groupMap = new Map(groupRows.map(row => [row.id, row]));
  const data = await byIds<{ enrollment_id: string; training_group_id: string }>("training_group_assignments",
    "id,enrollment_id,training_group_id", "training_group_id", groupRows.map(row => row.id), { nullColumn: "end_date" });
  return data.map(row => ({ ...row, training_groups: groupMap.get(row.training_group_id) ?? null }));
}

export async function measurements(playerIds: string[]) {
  const data = await byIds<MeasurementSessionRow>("player_measurement_sessions", MEASUREMENTS, "player_id", playerIds,
    { order: [["measured_at", false], ["created_at", false]] });
  return data.map(row => ({ ...row, notes: null })).sort((a, b) => b.measured_at.localeCompare(a.measured_at) || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
}

export async function guardians(playerIds: string[]): Promise<GuardianLinkRow[]> {
  const links = await byIds<{ player_id: string; guardian_id: string; is_primary: boolean | null }>("player_guardians",
    "id,player_id,guardian_id,is_primary", "player_id", playerIds, { order: [["is_primary", false]] });
  const contacts = await byIds<NonNullable<GuardianLinkRow["guardians"]> & { id: string }>("guardians", CONTACT, "id", links.map(row => row.guardian_id));
  const contactMap = new Map(contacts.map(row => [row.id, row]));
  return links.map(row => ({ ...row, guardians: contactMap.get(row.guardian_id) ?? null }));
}

export async function dashboardSessions(campusIds: string[], bounds: { start: string; end: string }): Promise<[
  Array<{ id: string; waist_circumference_cm: number | string | null }>, { data: RecentMeasurementRow[] },
]> {
  const [current, recent] = await Promise.all([
    rows<{ id: string; waist_circumference_cm: number | string | null }>("player_measurement_sessions", "id,waist_circumference_cm", {
      ids: { column: "campus_id", values: campusIds }, start: bounds.start, end: bounds.end,
    }),
    rows<MeasurementSessionRow>("player_measurement_sessions", MEASUREMENTS, {
      ids: { column: "campus_id", values: campusIds }, order: [["measured_at", false], ["created_at", false]], limit: 8,
    }),
  ]);
  // Recent activity needs names only, not the clinical player profile projection.
  const [names, campusRows] = await Promise.all([
    byIds<{ id: string; first_name: string; last_name: string }>("players", "id,first_name,last_name", "id", recent.map(row => row.player_id)),
    campuses(),
  ]);
  const playerMap = new Map(names.map(row => [row.id, row]));
  const campusMap = new Map(campusRows.map(row => [row.id, row]));
  return [current, { data: recent.map(row => ({ ...row, notes: null, players: playerMap.get(row.player_id) ?? null, campuses: campusMap.get(row.campus_id) ?? null })) }];
}

export function growthReferences(sex: string) {
  return rows<WhoGrowthReferenceRow>("who_growth_reference", "indicator,sex,age_months,l,m,s", { eq: { sex } });
}
