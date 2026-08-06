import { getPermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export type WeeklyCallupProgram = "selectivo" | "futbol_para_todos";

export type WeeklyCallupTournamentOption = {
  id: string;
  campusId: string;
  productId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  signupDeadline: string | null;
};

export type WeeklyCallupListRow = {
  id: string;
  campusId: string;
  campusName: string;
  tournamentName: string;
  program: WeeklyCallupProgram;
  weekStart: string;
  status: "draft" | "ready" | "shared";
  snapshotAt: string;
  categoryCount: number;
  playerCount: number;
};

export type WeeklyCallupsFoundationData = {
  campuses: Array<{ id: string; name: string }>;
  defaultCampusId: string;
  currentWeekStart: string;
  tournaments: WeeklyCallupTournamentOption[];
  callups: WeeklyCallupListRow[];
};

type TournamentRow = {
  id: string;
  campus_id: string;
  product_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  signup_deadline: string | null;
  products: { name: string | null } | null;
};

type CallupRow = {
  id: string;
  campus_id: string;
  tournament_id: string;
  program: WeeklyCallupProgram;
  week_start: string;
  status: "draft" | "ready" | "shared";
  roster_snapshot_at: string;
  tournaments: { name: string | null } | null;
};

type CategoryRow = { id: string; weekly_callup_id: string };
type PlayerRow = { weekly_callup_category_id: string };

export function getMonterreyWeekStart(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const localDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const isoDay = localDate.getUTCDay() || 7;
  localDate.setUTCDate(localDate.getUTCDate() - isoDay + 1);
  return localDate.toISOString().slice(0, 10);
}

export async function getWeeklyCallupsFoundationData(): Promise<WeeklyCallupsFoundationData | null> {
  const context = await getPermissionContext();
  if (!context || (!context.hasOperationalAccess && !context.hasSportsAccess)) return null;

  const campusAccess = context.campusAccess;
  if (!campusAccess || campusAccess.campusIds.length === 0) return null;

  const admin = createAdminClient();
  const [tournamentsResult, callupsResult] = await Promise.all([
    admin
      .from("tournaments")
      .select("id, campus_id, product_id, name, start_date, end_date, signup_deadline, products(name)")
      .in("campus_id", campusAccess.campusIds)
      .eq("is_active", true)
      .order("start_date", { ascending: true, nullsFirst: false })
      .returns<TournamentRow[]>(),
    admin
      .from("weekly_callups")
      .select("id, campus_id, tournament_id, program, week_start, status, roster_snapshot_at, tournaments(name)")
      .in("campus_id", campusAccess.campusIds)
      .order("week_start", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<CallupRow[]>(),
  ]);

  if (tournamentsResult.error) throw tournamentsResult.error;
  if (callupsResult.error) throw callupsResult.error;

  const callupIds = (callupsResult.data ?? []).map((row) => row.id);
  const categoriesResult = callupIds.length
    ? await admin
        .from("weekly_callup_categories")
        .select("id, weekly_callup_id")
        .in("weekly_callup_id", callupIds)
        .returns<CategoryRow[]>()
    : { data: [] as CategoryRow[], error: null };
  if (categoriesResult.error) throw categoriesResult.error;

  const categoryIds = (categoriesResult.data ?? []).map((row) => row.id);
  const playersResult = categoryIds.length
    ? await admin
        .from("weekly_callup_players")
        .select("weekly_callup_category_id")
        .in("weekly_callup_category_id", categoryIds)
        .eq("roster_status", "included")
        .returns<PlayerRow[]>()
    : { data: [] as PlayerRow[], error: null };
  if (playersResult.error) throw playersResult.error;

  const categoriesByCallup = new Map<string, CategoryRow[]>();
  for (const category of categoriesResult.data ?? []) {
    const current = categoriesByCallup.get(category.weekly_callup_id) ?? [];
    current.push(category);
    categoriesByCallup.set(category.weekly_callup_id, current);
  }
  const playerCountByCategory = new Map<string, number>();
  for (const player of playersResult.data ?? []) {
    playerCountByCategory.set(
      player.weekly_callup_category_id,
      (playerCountByCategory.get(player.weekly_callup_category_id) ?? 0) + 1,
    );
  }

  const campusNameById = new Map(campusAccess.campuses.map((campus) => [campus.id, campus.name]));

  return {
    campuses: campusAccess.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    defaultCampusId: campusAccess.defaultCampusId ?? campusAccess.campusIds[0],
    currentWeekStart: getMonterreyWeekStart(),
    tournaments: (tournamentsResult.data ?? []).map((row) => ({
      id: row.id,
      campusId: row.campus_id,
      productId: row.product_id,
      name: row.name || row.products?.name || "Torneo",
      startDate: row.start_date,
      endDate: row.end_date,
      signupDeadline: row.signup_deadline,
    })),
    callups: (callupsResult.data ?? []).map((row) => {
      const categories = categoriesByCallup.get(row.id) ?? [];
      return {
        id: row.id,
        campusId: row.campus_id,
        campusName: campusNameById.get(row.campus_id) ?? "Campus",
        tournamentName: row.tournaments?.name ?? "Torneo",
        program: row.program,
        weekStart: row.week_start,
        status: row.status,
        snapshotAt: row.roster_snapshot_at,
        categoryCount: categories.length,
        playerCount: categories.reduce(
          (total, category) => total + (playerCountByCategory.get(category.id) ?? 0),
          0,
        ),
      };
    }),
  };
}
