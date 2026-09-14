import "server-only";
import type { PermissionContext } from "@/lib/auth/permissions";
import type { DirectorReadOnlyRosterData, DirectorReadOnlyRosterSection } from "@/components/players/director-readonly-roster-types";
import { formatTrainingGroupDisplayName, formatTrainingGroupBirthYearRange, TRAINING_GROUP_PROGRAM_LABELS, TRAINING_GROUP_GENDER_LABELS } from "@/lib/training-groups/shared";
import { getMonterreyDateString } from "@/lib/time";
import { readDirectorCore, readDirectorRows, type DirectorGroup, type DirectorGroupAssignment } from "./director-readonly-data";
import { readDirectorAttendance, recentDirectorAttendance, directorAttendanceRisk } from "./director-readonly-attendance";

export async function readDirectorRoster(context: PermissionContext, filters: { campusId?: string; gender?: string; birthYear?: string | number } = {}): Promise<DirectorReadOnlyRosterData | null> {
  const { players, enrollments, campuses: allCampuses } = await readDirectorCore(context);
  const campuses = allCampuses.filter((row) => row.is_active).map(({ id, code, name }) => ({ id, code, name }));
  const selectedCampus = filters.campusId ? campuses.find((row) => row.id === filters.campusId)
    : campuses.find((row) => row.id === context.campusAccess?.defaultCampusId) ?? campuses[0];
  if (!selectedCampus) return null;
  const gender = filters.gender === "male" || filters.gender === "female" ? filters.gender : "";
  const yearValue = Number(filters.birthYear);
  const year = Number.isInteger(yearValue) && yearValue >= 2000 && yearValue <= 2100 ? yearValue : null;
  const playersById = new Map(players.filter((row) => row.status === "active").map((row) => [row.id, row]));
  const campusEnrollments = enrollments.filter((row) => row.status === "active" && row.campus_id === selectedCampus.id)
    .filter((row) => { const player = playersById.get(row.player_id); return player && (!gender || player.gender === gender); });
  const birthYears = [...new Set(campusEnrollments.map((row) => Number(playersById.get(row.player_id)!.birth_date.slice(0, 4))))].sort((a, b) => b - a);
  const rosterEnrollments = campusEnrollments.filter((row) => !year || Number(playersById.get(row.player_id)!.birth_date.slice(0, 4)) === year);
  const groups = (await readDirectorRows<DirectorGroup>(context, "training_groups", { key: "campus_id", equals: selectedCampus.id }))
    .filter((row) => row.status === "active" && (!gender || row.gender === gender || row.gender === "mixed"));
  const assignments = await readDirectorRows<DirectorGroupAssignment>(context, "training_group_assignments", { key: "enrollment_id", ids: rosterEnrollments.map((row) => row.id), nullKey: "end_date" });
  assignments.sort((a, b) => b.start_date.localeCompare(a.start_date) || a.id.localeCompare(b.id));
  const assignedByEnrollment = new Map<string, string>();
  for (const assignment of assignments) if (!assignedByEnrollment.has(assignment.enrollment_id)) assignedByEnrollment.set(assignment.enrollment_id, assignment.training_group_id);
  const sections = new Map<string, DirectorReadOnlyRosterSection>();
  for (const group of groups) {
    const category = formatTrainingGroupBirthYearRange(group.birth_year_min, group.birth_year_max);
    const programLabel = TRAINING_GROUP_PROGRAM_LABELS[group.program] ?? group.program;
    const subtitle = [programLabel, `Cat. ${category}`, TRAINING_GROUP_GENDER_LABELS[group.gender] ?? group.gender,
      group.start_time && group.end_time ? `${group.start_time.slice(0, 5)}-${group.end_time.slice(0, 5)}` : ""].filter(Boolean).join(" | ");
    const groupName = formatTrainingGroupDisplayName(group).replace(/^\s*\d{4}(?:\s*[\/-]\s*\d{4})?\s*[-\u2013\u2014:]?\s*/i, "").replace(/^\s*femenil\s*[-\u2013\u2014:]?\s*/i, "").trim() || "Grupo";
    sections.set(group.id, { id: group.id, name: [category, group.gender === "female" ? "Femenil" : "", groupName].filter(Boolean).join(" - "), subtitle,
      program: group.program, programLabel, levelLabel: group.level_label,
      sortKey: `${9999 - Math.max(group.birth_year_min ?? 0, group.birth_year_max ?? 0)}:${group.start_time ?? "99:99"}:${group.name}`, rows: [] });
  }
  const unassigned: DirectorReadOnlyRosterSection = { id: "sin-grupo", name: "Sin grupo", subtitle: "Jugadores activos sin grupo de entrenamiento asignado",
    program: null, programLabel: "Sin grupo", levelLabel: null, sortKey: "zzzz", rows: [] };
  const today = getMonterreyDateString();
  const attendance = await readDirectorAttendance(context, rosterEnrollments.map((row) => row.player_id), today);
  for (const enrollment of rosterEnrollments) {
    const player = playersById.get(enrollment.player_id)!;
    const assignedId = assignedByEnrollment.get(enrollment.id);
    const section = (assignedId && sections.get(assignedId)) || unassigned;
    const entries = attendance.get(player.id) ?? [];
    const date = enrollment.inscription_date || enrollment.start_date;
    section.rows.push({ enrollmentId: enrollment.id, playerId: player.id, trainingGroupId: section === unassigned ? null : section.id,
      publicPlayerId: player.public_player_id ?? "Pendiente", fullName: `${player.first_name} ${player.last_name}`.trim(), birthYear: Number(player.birth_date.slice(0, 4)),
      levelGroup: section.programLabel, inscriptionDate: date.split("-").reverse().join("/"), startDate: enrollment.start_date,
      recentAttendance: recentDirectorAttendance(entries), attendanceRisk: directorAttendanceRisk(player.id, enrollment.id, entries, today) });
  }
  const visibleSections = [...sections.values()].filter((section) => {
    if (!year || section.rows.length) return true;
    const group = groups.find((row) => row.id === section.id)!;
    if (group.birth_year_min == null && group.birth_year_max == null) return true;
    if (group.birth_year_min != null && group.birth_year_max != null) return year >= group.birth_year_min && year <= group.birth_year_max;
    return year === (group.birth_year_min ?? group.birth_year_max);
  });
  if (unassigned.rows.length) visibleSections.push(unassigned);
  for (const section of visibleSections) section.rows.sort((a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999) || a.fullName.localeCompare(b.fullName, "es-MX"));
  visibleSections.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return { campuses, selectedCampusId: selectedCampus.id, selectedCampusName: selectedCampus.name,
    selectedGender: gender, selectedBirthYear: year, canViewFinancials: false, canEditTrainingGroups: false, birthYears,
    groupOptions: visibleSections.filter((row) => row !== unassigned).map(({ id, name, subtitle }) => ({ id, name, subtitle })),
    sections: visibleSections, totalPlayers: rosterEnrollments.length, unassignedCount: unassigned.rows.length };
}
