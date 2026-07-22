import { canAccessCampus, type OperationalCampusAccess } from "@/lib/auth/campuses";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonterreyDateString } from "@/lib/time";

export type TrialCampus = { id: string; name: string; code: string };
export type TrialTrainingGroup = {
  id: string;
  campusId: string;
  name: string;
  gender: string;
  birthYearMin: number | null;
  birthYearMax: number | null;
};
export type TrialSession = {
  id: string;
  trainingGroupId: string;
  groupName: string;
  startTime: string;
  endTime: string;
  coachNames: string[];
};
export type TrialVisit = {
  id: string;
  attendanceSessionId: string;
  visitDate: string;
  visitNumber: number;
  checkedInAt: string;
  groupName: string;
  coachNames: string[];
  note: string | null;
};
export type TrialNote = {
  id: string;
  body: string;
  createdAt: string;
  createdByEmail: string | null;
};
export type TrialProspect = {
  id: string;
  campusId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  guardianName: string | null;
  guardianPhone: string;
  status: string;
  preferredTrainingGroupId: string;
  preferredGroupName: string;
  createdAt: string;
  visits: TrialVisit[];
  notes: TrialNote[];
};

export type TrialEnrollmentPrefill = {
  trialProspectId: string;
  campusId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: "male" | "female";
  guardianFirstName: string;
  guardianLastName: string;
  guardianPhone: string;
  preferredGroupName: string;
  visitCount: number;
};

type TrialProspectRow = {
  id: string;
  campus_id: string;
  preferred_training_group_id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
  guardian_name: string | null;
  guardian_phone: string;
  status: string;
  created_at: string;
};

type TrialVisitRow = {
  id: string;
  prospect_id: string;
  training_group_id: string;
  attendance_session_id: string;
  visit_date: string;
  visit_number: number;
  checked_in_at: string;
  coach_snapshot: Array<{ name?: string }> | null;
  note: string | null;
};

function searchable(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX");
}

function splitGuardianName(value: string | null) {
  const parts = (value ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  if (parts.length <= 3) return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  return { firstName: parts.slice(0, 2).join(" "), lastName: parts.slice(2).join(" ") };
}

export async function getTrialEnrollmentPrefill({
  prospectId,
  allowedCampusIds,
}: {
  prospectId: string;
  allowedCampusIds: string[];
}): Promise<TrialEnrollmentPrefill | null> {
  if (!prospectId || allowedCampusIds.length === 0) return null;

  const admin = createAdminClient();
  const { data: prospect } = await admin
    .from("trial_prospects")
    .select("id, campus_id, preferred_training_group_id, first_name, last_name, birth_date, gender, guardian_name, guardian_phone, status")
    .eq("id", prospectId)
    .eq("status", "active")
    .maybeSingle();

  if (!prospect || !allowedCampusIds.includes(prospect.campus_id)) return null;

  const [{ count }, { data: group }] = await Promise.all([
    admin
      .from("trial_visits")
      .select("id", { count: "exact", head: true })
      .eq("prospect_id", prospect.id),
    admin
      .from("training_groups")
      .select("name")
      .eq("id", prospect.preferred_training_group_id)
      .maybeSingle<{ name: string }>(),
  ]);
  const guardian = splitGuardianName(prospect.guardian_name);

  return {
    trialProspectId: prospect.id,
    campusId: prospect.campus_id,
    firstName: prospect.first_name,
    lastName: prospect.last_name,
    birthDate: prospect.birth_date,
    gender: prospect.gender === "female" ? "female" : "male",
    guardianFirstName: guardian.firstName,
    guardianLastName: guardian.lastName,
    guardianPhone: prospect.guardian_phone,
    preferredGroupName: group?.name ?? "Grupo",
    visitCount: count ?? 0,
  };
}

export async function getTrialClassesData({
  campusAccess,
  campusId,
  query,
}: {
  campusAccess: OperationalCampusAccess;
  campusId?: string | null;
  query?: string | null;
}) {
  const campuses: TrialCampus[] = campusAccess.campuses.map((campus) => ({
    id: campus.id,
    name: campus.name,
    code: campus.code,
  }));
  const selectedCampusId = campusId && canAccessCampus(campusAccess, campusId)
    ? campusId
    : campusAccess.defaultCampusId;

  if (!selectedCampusId) {
    return { campuses, selectedCampusId: null, groups: [], sessions: [], prospects: [] };
  }

  const admin = createAdminClient();
  const today = getMonterreyDateString();
  const [{ data: groupRows }, { data: sessionRows }, { data: prospectRows }] = await Promise.all([
    admin
      .from("training_groups")
      .select("id, campus_id, name, gender, birth_year_min, birth_year_max")
      .eq("campus_id", selectedCampusId)
      .eq("status", "active")
      .order("birth_year_max", { ascending: false })
      .order("name"),
    admin
      .from("attendance_sessions")
      .select("id, training_group_id, start_time, end_time")
      .eq("campus_id", selectedCampusId)
      .eq("session_date", today)
      .not("training_group_id", "is", null)
      .neq("status", "cancelled")
      .order("start_time"),
    admin
      .from("trial_prospects")
      .select("id, campus_id, preferred_training_group_id, first_name, last_name, birth_date, gender, guardian_name, guardian_phone, status, created_at")
      .eq("campus_id", selectedCampusId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1000)
      .returns<TrialProspectRow[]>(),
  ]);

  const groups: TrialTrainingGroup[] = (groupRows ?? []).map((row) => ({
    id: row.id,
    campusId: row.campus_id,
    name: row.name,
    gender: row.gender,
    birthYearMin: row.birth_year_min,
    birthYearMax: row.birth_year_max,
  }));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const sessionGroupIds = [...new Set((sessionRows ?? []).map((row) => row.training_group_id).filter(Boolean))] as string[];
  const { data: coachRows } = sessionGroupIds.length === 0
    ? { data: [] }
    : await admin
        .from("training_group_coaches")
        .select("training_group_id, is_primary, coaches(first_name, last_name)")
        .in("training_group_id", sessionGroupIds);
  const coachesByGroup = new Map<string, string[]>();
  for (const row of coachRows ?? []) {
    const coachRelation = row.coaches as unknown as { first_name: string | null; last_name: string | null } | Array<{ first_name: string | null; last_name: string | null }> | null;
    const coach = Array.isArray(coachRelation) ? coachRelation[0] ?? null : coachRelation;
    const name = [coach?.first_name, coach?.last_name].filter(Boolean).join(" ");
    if (!name) continue;
    const names = coachesByGroup.get(row.training_group_id) ?? [];
    names.push(name);
    coachesByGroup.set(row.training_group_id, names);
  }
  const sessions: TrialSession[] = (sessionRows ?? []).flatMap((row) => {
    if (!row.training_group_id) return [];
    return [{
      id: row.id,
      trainingGroupId: row.training_group_id,
      groupName: groupById.get(row.training_group_id)?.name ?? "Grupo",
      startTime: String(row.start_time).slice(0, 5),
      endTime: String(row.end_time).slice(0, 5),
      coachNames: coachesByGroup.get(row.training_group_id) ?? [],
    }];
  });

  const normalizedQuery = searchable(query?.trim() ?? "");
  const filteredRows = (prospectRows ?? []).filter((row) => {
    if (!normalizedQuery) return true;
    return searchable(`${row.first_name} ${row.last_name} ${row.guardian_name ?? ""} ${row.guardian_phone}`).includes(normalizedQuery);
  });
  const prospectIds = filteredRows.map((row) => row.id);
  const [{ data: visitRows }, { data: noteRows }] = prospectIds.length === 0
    ? [{ data: [] }, { data: [] }]
    : await Promise.all([
        admin
          .from("trial_visits")
          .select("id, prospect_id, training_group_id, attendance_session_id, visit_date, visit_number, checked_in_at, coach_snapshot, note")
          .in("prospect_id", prospectIds)
          .order("visit_number")
          .returns<TrialVisitRow[]>(),
        admin
          .from("trial_prospect_notes")
          .select("id, prospect_id, body, created_at, created_by_email")
          .in("prospect_id", prospectIds)
          .order("created_at", { ascending: false }),
      ]);

  const visitsByProspect = new Map<string, TrialVisit[]>();
  for (const visit of visitRows ?? []) {
    const visits = visitsByProspect.get(visit.prospect_id) ?? [];
    visits.push({
      id: visit.id,
      attendanceSessionId: visit.attendance_session_id,
      visitDate: visit.visit_date,
      visitNumber: visit.visit_number,
      checkedInAt: visit.checked_in_at,
      groupName: groupById.get(visit.training_group_id)?.name ?? "Grupo",
      coachNames: (visit.coach_snapshot ?? []).map((coach) => coach.name ?? "").filter(Boolean),
      note: visit.note,
    });
    visitsByProspect.set(visit.prospect_id, visits);
  }
  const notesByProspect = new Map<string, TrialNote[]>();
  for (const note of noteRows ?? []) {
    const notes = notesByProspect.get(note.prospect_id) ?? [];
    notes.push({ id: note.id, body: note.body, createdAt: note.created_at, createdByEmail: note.created_by_email });
    notesByProspect.set(note.prospect_id, notes);
  }

  const prospects: TrialProspect[] = filteredRows.map((row) => ({
    id: row.id,
    campusId: row.campus_id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthDate: row.birth_date,
    gender: row.gender,
    guardianName: row.guardian_name,
    guardianPhone: row.guardian_phone,
    status: row.status,
    preferredTrainingGroupId: row.preferred_training_group_id,
    preferredGroupName: groupById.get(row.preferred_training_group_id)?.name ?? "Grupo",
    createdAt: row.created_at,
    visits: visitsByProspect.get(row.id) ?? [],
    notes: notesByProspect.get(row.id) ?? [],
  }));

  return { campuses, selectedCampusId, groups, sessions, prospects };
}
