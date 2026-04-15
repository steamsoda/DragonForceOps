import { getOperationalCampusAccess } from "@/lib/auth/campuses";
import { getPermissionContext } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

type TournamentRow = {
  id: string;
  name: string;
  campus_id: string | null;
  product_id: string | null;
};

type ProductRow = {
  id: string;
  name: string;
};

type EntryRow = {
  tournament_id: string;
  enrollment_id: string;
};

type EnrollmentRow = {
  id: string;
  player_id: string;
  campus_id: string;
  players: {
    first_name: string;
    last_name: string;
    birth_date: string | null;
  } | null;
};

type TeamAssignmentRow = {
  enrollment_id: string;
  teams: {
    name: string | null;
  } | null;
};

const FAMILY_CONFIG = [
  {
    key: "superliga_regia",
    label: "Superliga Regia",
    tokens: ["superliga regia", "super liga regia", "slr"],
  },
  {
    key: "rosa_power_cup",
    label: "Rosa Power Cup",
    tokens: ["rosa power cup", "rosa power", "rpc"],
  },
  {
    key: "cecaff",
    label: "CECAFF",
    tokens: ["cecaff", "cecaf"],
  },
] as const;

type FamilyKey = (typeof FAMILY_CONFIG)[number]["key"];

export type CompetitionSignupPlayerRow = {
  enrollmentId: string;
  playerId: string;
  playerName: string;
  birthYear: number | null;
  campusId: string;
  campusName: string;
  baseTeamName: string | null;
  tournaments: string[];
};

export type CompetitionSignupCategoryGroup = {
  key: string;
  label: string;
  birthYear: number | null;
  confirmedCount: number;
  players: CompetitionSignupPlayerRow[];
};

export type CompetitionSignupCampusGroup = {
  campusId: string;
  campusName: string;
  confirmedCount: number;
  categories: CompetitionSignupCategoryGroup[];
};

export type CompetitionSignupFamilyGroup = {
  key: FamilyKey;
  label: string;
  totalConfirmed: number;
  campuses: CompetitionSignupCampusGroup[];
};

export type CompetitionSignupDashboardData = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string;
  families: CompetitionSignupFamilyGroup[];
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getBirthYear(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCFullYear();
}

function getCompetitionFamily(tournamentName: string, productName: string | null): FamilyKey | null {
  const haystack = `${normalizeText(tournamentName)} ${normalizeText(productName)}`;
  const match = FAMILY_CONFIG.find((family) => family.tokens.some((token) => haystack.includes(token)));
  return match?.key ?? null;
}

function sortPlayerRows(players: CompetitionSignupPlayerRow[]) {
  return [...players].sort((a, b) => a.playerName.localeCompare(b.playerName, "es-MX"));
}

export async function getCompetitionSignupDashboardData(filters?: {
  campusId?: string | null;
}): Promise<CompetitionSignupDashboardData | null> {
  const permissionContext = await getPermissionContext();
  if (!permissionContext || (!permissionContext.hasOperationalAccess && !permissionContext.hasSportsAccess)) {
    return null;
  }

  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campuses.length === 0) return null;

  const admin = createAdminClient();
  const selectedCampusId =
    filters?.campusId && campusAccess.campusIds.includes(filters.campusId) ? filters.campusId : "";
  const targetCampusIds = selectedCampusId ? [selectedCampusId] : campusAccess.campusIds;

  const { data: tournaments } = await admin
    .from("tournaments")
    .select("id, name, campus_id, product_id")
    .eq("is_active", true)
    .in("campus_id", targetCampusIds)
    .returns<TournamentRow[]>();

  const activeTournaments = tournaments ?? [];
  const productIds = Array.from(
    new Set(activeTournaments.map((tournament) => tournament.product_id).filter((value): value is string => Boolean(value))),
  );

  const { data: products } = productIds.length
    ? await admin.from("products").select("id, name").in("id", productIds).returns<ProductRow[]>()
    : { data: [] as ProductRow[] };

  const productNameById = new Map((products ?? []).map((product) => [product.id, product.name]));
  const matchedTournaments = activeTournaments
    .map((tournament) => ({
      ...tournament,
      familyKey: getCompetitionFamily(tournament.name, tournament.product_id ? productNameById.get(tournament.product_id) ?? null : null),
    }))
    .filter((tournament): tournament is TournamentRow & { familyKey: FamilyKey } => Boolean(tournament.familyKey));

  const tournamentIds = matchedTournaments.map((tournament) => tournament.id);
  const { data: entries } = tournamentIds.length
    ? await admin
        .from("tournament_player_entries")
        .select("tournament_id, enrollment_id")
        .eq("entry_status", "confirmed")
        .in("tournament_id", tournamentIds)
        .returns<EntryRow[]>()
    : { data: [] as EntryRow[] };

  const uniqueEnrollmentIds = Array.from(new Set((entries ?? []).map((entry) => entry.enrollment_id)));
  const [{ data: enrollments }, { data: teamAssignments }] = await Promise.all([
    uniqueEnrollmentIds.length
      ? admin
          .from("enrollments")
          .select("id, player_id, campus_id, players(first_name, last_name, birth_date)")
          .in("id", uniqueEnrollmentIds)
          .returns<EnrollmentRow[]>()
      : Promise.resolve({ data: [] as EnrollmentRow[] }),
    uniqueEnrollmentIds.length
      ? admin
          .from("team_assignments")
          .select("enrollment_id, teams(name)")
          .in("enrollment_id", uniqueEnrollmentIds)
          .eq("is_primary", true)
          .is("end_date", null)
          .returns<TeamAssignmentRow[]>()
      : Promise.resolve({ data: [] as TeamAssignmentRow[] }),
  ]);

  const campusNameById = new Map(campusAccess.campuses.map((campus) => [campus.id, campus.name]));
  const enrollmentById = new Map((enrollments ?? []).map((enrollment) => [enrollment.id, enrollment]));
  const baseTeamByEnrollmentId = new Map((teamAssignments ?? []).map((row) => [row.enrollment_id, row.teams?.name ?? null]));
  const tournamentById = new Map(matchedTournaments.map((tournament) => [tournament.id, tournament]));

  const families = FAMILY_CONFIG.map<CompetitionSignupFamilyGroup>((family) => {
    const playerAccumulator = new Map<string, CompetitionSignupPlayerRow>();

    for (const entry of entries ?? []) {
      const tournament = tournamentById.get(entry.tournament_id);
      if (!tournament || tournament.familyKey !== family.key) continue;
      const enrollment = enrollmentById.get(entry.enrollment_id);
      if (!enrollment || !targetCampusIds.includes(enrollment.campus_id)) continue;

      const existing = playerAccumulator.get(enrollment.id);
      const playerName = enrollment.players
        ? `${enrollment.players.first_name} ${enrollment.players.last_name}`.trim()
        : "Jugador";
      const birthYear = getBirthYear(enrollment.players?.birth_date);

      if (existing) {
        if (!existing.tournaments.includes(tournament.name)) existing.tournaments.push(tournament.name);
        continue;
      }

      playerAccumulator.set(enrollment.id, {
        enrollmentId: enrollment.id,
        playerId: enrollment.player_id,
        playerName,
        birthYear,
        campusId: enrollment.campus_id,
        campusName: campusNameById.get(enrollment.campus_id) ?? "Campus",
        baseTeamName: baseTeamByEnrollmentId.get(enrollment.id) ?? null,
        tournaments: [tournament.name],
      });
    }

    const campusMap = new Map<string, CompetitionSignupCampusGroup>();
    for (const player of playerAccumulator.values()) {
      const campusGroup =
        campusMap.get(player.campusId) ??
        {
          campusId: player.campusId,
          campusName: player.campusName,
          confirmedCount: 0,
          categories: [],
        };

      campusGroup.confirmedCount += 1;

      const categoryKey = player.birthYear !== null ? String(player.birthYear) : "sin_categoria";
      const categoryLabel = player.birthYear !== null ? `Cat. ${player.birthYear}` : "Sin categoría";
      const category = campusGroup.categories.find((item) => item.key === categoryKey);
      if (category) {
        category.confirmedCount += 1;
        category.players.push(player);
      } else {
        campusGroup.categories.push({
          key: categoryKey,
          label: categoryLabel,
          birthYear: player.birthYear,
          confirmedCount: 1,
          players: [player],
        });
      }

      campusMap.set(player.campusId, campusGroup);
    }

    const campuses = Array.from(campusMap.values())
      .map<CompetitionSignupCampusGroup>((campusGroup) => ({
        ...campusGroup,
        categories: campusGroup.categories
          .map((category) => ({
            ...category,
            players: sortPlayerRows(category.players).map((player) => ({
              ...player,
              tournaments: [...player.tournaments].sort((a, b) => a.localeCompare(b, "es-MX")),
            })),
          }))
          .sort((a, b) => {
            if (a.birthYear === null && b.birthYear === null) return a.label.localeCompare(b.label, "es-MX");
            if (a.birthYear === null) return 1;
            if (b.birthYear === null) return -1;
            return b.birthYear - a.birthYear;
          }),
      }))
      .sort((a, b) => a.campusName.localeCompare(b.campusName, "es-MX"));

    return {
      key: family.key,
      label: family.label,
      totalConfirmed: playerAccumulator.size,
      campuses,
    };
  });

  return {
    campuses: campusAccess.campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    selectedCampusId,
    families,
  };
}
