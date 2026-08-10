import { getPermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMonterreyWeekStart } from "@/lib/queries/weekly-callups";

export type CoachScheduleGame = {
  matchDate: string;
  arrivalTime: string;
  venue: string;
  opponent: string;
};

export type CoachScheduleGroup = {
  id: string;
  campusId: string;
  campusName: string;
  name: string;
  program: "selectivo" | "futbol_para_todos";
  categoryLabel: string;
  report: {
    id: string;
    tournamentId: string;
    isRest: boolean;
    notes: string;
    updatedAt: string;
    games: CoachScheduleGame[];
  } | null;
};

export type CoachSchedulePageData = {
  coachId: string;
  coachName: string;
  selectedWeekStart: string;
  groups: CoachScheduleGroup[];
  tournaments: Array<{ id: string; campusId: string; name: string }>;
};

type LinkRow = {
  training_group_id: string;
  training_groups: {
    id: string;
    campus_id: string;
    name: string;
    program: string;
    birth_year_min: number | null;
    birth_year_max: number | null;
    status: string;
    campuses: { name: string | null } | null;
  } | null;
};

type ReportRow = {
  id: string;
  training_group_id: string;
  tournament_id: string;
  is_rest: boolean;
  notes: string | null;
  updated_at: string;
};

type GameRow = {
  report_id: string;
  match_date: string;
  arrival_time: string;
  venue: string;
  opponent: string;
  sort_order: number;
};

function validMonday(value: string | undefined) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.getUTCDay() !== 1 ? null : value!;
}

function categoryLabel(group: NonNullable<LinkRow["training_groups"]>) {
  if (group.birth_year_min && group.birth_year_max) {
    return group.birth_year_min === group.birth_year_max
      ? String(group.birth_year_min)
      : `${group.birth_year_min}/${group.birth_year_max}`;
  }
  return group.name;
}

export async function getCoachSchedulePageData(week?: string): Promise<CoachSchedulePageData | null> {
  const context = await getPermissionContext();
  if (!context?.hasCoachScheduleAccess || !context.coachId) return null;
  const selectedWeekStart = validMonday(week) ?? getMonterreyWeekStart();
  const admin = createAdminClient();
  const [coachResult, linksResult] = await Promise.all([
    admin.from("coaches").select("id, first_name, last_name").eq("id", context.coachId).eq("is_active", true).maybeSingle<{ id: string; first_name: string | null; last_name: string | null }>(),
    admin
      .from("training_group_coaches")
      .select("training_group_id, training_groups(id, campus_id, name, program, birth_year_min, birth_year_max, status, campuses(name))")
      .eq("coach_id", context.coachId)
      .returns<LinkRow[]>(),
  ]);
  if (coachResult.error) throw coachResult.error;
  if (linksResult.error) throw linksResult.error;
  if (!coachResult.data) return null;

  const links = (linksResult.data ?? []).filter((link) =>
    link.training_groups?.status === "active"
    && (link.training_groups.program === "selectivo" || link.training_groups.program === "futbol_para_todos"),
  );
  const groupIds = links.map((link) => link.training_group_id);
  const campusIds = [...new Set(links.map((link) => link.training_groups!.campus_id))];
  const [tournamentsResult, reportsResult] = await Promise.all([
    campusIds.length
      ? admin.from("tournaments").select("id, campus_id, name, products(name)").in("campus_id", campusIds).eq("is_active", true).order("name")
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? admin.from("coach_weekly_schedule_reports").select("id, training_group_id, tournament_id, is_rest, notes, updated_at").eq("week_start", selectedWeekStart).in("training_group_id", groupIds).returns<ReportRow[]>()
      : Promise.resolve({ data: [] as ReportRow[], error: null }),
  ]);
  if (tournamentsResult.error) throw tournamentsResult.error;
  if (reportsResult.error) throw reportsResult.error;
  const reportIds = (reportsResult.data ?? []).map((report) => report.id);
  const gamesResult = reportIds.length
    ? await admin.from("coach_weekly_schedule_games").select("report_id, match_date, arrival_time, venue, opponent, sort_order").in("report_id", reportIds).order("sort_order").returns<GameRow[]>()
    : { data: [] as GameRow[], error: null };
  if (gamesResult.error) throw gamesResult.error;

  const reportsByGroup = new Map((reportsResult.data ?? []).map((report) => [report.training_group_id, report]));
  const gamesByReport = new Map<string, GameRow[]>();
  for (const game of gamesResult.data ?? []) {
    const current = gamesByReport.get(game.report_id) ?? [];
    current.push(game);
    gamesByReport.set(game.report_id, current);
  }

  return {
    coachId: context.coachId,
    coachName: [coachResult.data.first_name, coachResult.data.last_name].filter(Boolean).join(" ") || "Coach",
    selectedWeekStart,
    tournaments: (tournamentsResult.data ?? []).map((row: any) => ({
      id: row.id,
      campusId: row.campus_id,
      name: row.name || row.products?.name || "Torneo",
    })),
    groups: links
      .map((link) => {
        const group = link.training_groups!;
        const report = reportsByGroup.get(group.id);
        return {
          id: group.id,
          campusId: group.campus_id,
          campusName: group.campuses?.name ?? "Campus",
          name: group.name,
          program: group.program as CoachScheduleGroup["program"],
          categoryLabel: categoryLabel(group),
          report: report
            ? {
                id: report.id,
                tournamentId: report.tournament_id,
                isRest: report.is_rest,
                notes: report.notes ?? "",
                updatedAt: report.updated_at,
                games: (gamesByReport.get(report.id) ?? []).map((game) => ({
                  matchDate: game.match_date,
                  arrivalTime: game.arrival_time.slice(0, 5),
                  venue: game.venue,
                  opponent: game.opponent,
                })),
              }
            : null,
        };
      })
      .sort((a, b) => a.campusName.localeCompare(b.campusName, "es") || b.categoryLabel.localeCompare(a.categoryLabel, "es") || a.name.localeCompare(b.name, "es")),
  };
}
