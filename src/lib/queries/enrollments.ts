import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

export type PendingBalanceBucket = "all" | "small" | "medium" | "high";
export type PendingOverdueFilter = "all" | "overdue" | "7plus" | "30plus";

export type PendingEnrollmentsFilters = {
  q?: string;
  campusId?: string;
  teamId?: string;
  balanceBucket?: PendingBalanceBucket;
  overdue?: PendingOverdueFilter;
  page?: number;
};

type EnrollmentBalanceRow = {
  enrollment_id: string;
  balance: number;
};

type EnrollmentRow = {
  id: string;
  player_id: string;
  campus_id: string;
  players: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  campuses: {
    name: string | null;
    code: string | null;
  } | null;
};

type GuardianLinkRow = {
  player_id: string;
  is_primary: boolean;
  guardians: {
    phone_primary: string | null;
  } | null;
};

type TeamAssignmentRow = {
  enrollment_id: string;
  teams: {
    id: string;
    name: string;
  } | null;
};

type ChargeDueRow = {
  enrollment_id: string;
  due_date: string | null;
};

type TeamOptionRow = {
  id: string;
  name: string;
};

export async function listTeamsForPending(campusId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("teams")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (campusId) {
    query = query.eq("campus_id", campusId);
  }

  const { data } = await query.returns<TeamOptionRow[]>();
  return data ?? [];
}

function getOverdueDays(dueDate: string | null) {
  if (!dueDate) return 0;
  const today = new Date();
  const due = new Date(dueDate);
  const diffMs = today.getTime() - due.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(days, 0);
}

function balanceBucketMatches(balance: number, bucket: PendingBalanceBucket) {
  if (bucket === "all") return true;
  if (bucket === "small") return balance <= 1000;
  if (bucket === "medium") return balance > 1000 && balance <= 3000;
  if (bucket === "high") return balance > 3000;
  return true;
}

function overdueMatches(overdueDays: number, filter: PendingOverdueFilter) {
  if (filter === "all") return true;
  if (filter === "overdue") return overdueDays > 0;
  if (filter === "7plus") return overdueDays >= 7;
  if (filter === "30plus") return overdueDays >= 30;
  return true;
}

export async function listPendingEnrollments(filters: PendingEnrollmentsFilters) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const balanceBucket = filters.balanceBucket ?? "all";
  const overdueFilter = filters.overdue ?? "all";
  const textQuery = (filters.q ?? "").trim().toLowerCase();

  const { data: balanceRows } = await supabase
    .from("v_enrollment_balances")
    .select("enrollment_id, balance")
    .gt("balance", 0)
    .returns<EnrollmentBalanceRow[]>();

  const pendingBalanceRows = balanceRows ?? [];
  if (pendingBalanceRows.length === 0) {
    return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
  }

  const balanceByEnrollment = new Map(pendingBalanceRows.map((row) => [row.enrollment_id, row.balance]));
  const enrollmentIds = pendingBalanceRows.map((row) => row.enrollment_id);

  let enrollmentQuery = supabase
    .from("enrollments")
    .select("id, player_id, campus_id, players(first_name, last_name), campuses(name, code)")
    .eq("status", "active")
    .in("id", enrollmentIds);

  if (filters.campusId) {
    enrollmentQuery = enrollmentQuery.eq("campus_id", filters.campusId);
  }

  const { data: enrollments } = await enrollmentQuery.returns<EnrollmentRow[]>();
  const enrollmentRows = enrollments ?? [];
  if (enrollmentRows.length === 0) {
    return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
  }

  const filteredEnrollmentIds = enrollmentRows.map((row) => row.id);
  const playerIds = [...new Set(enrollmentRows.map((row) => row.player_id))];

  const [{ data: guardians }, { data: teamAssignments }, { data: dueDates }] = await Promise.all([
    supabase
      .from("player_guardians")
      .select("player_id, is_primary, guardians(phone_primary)")
      .in("player_id", playerIds)
      .returns<GuardianLinkRow[]>(),
    supabase
      .from("team_assignments")
      .select("enrollment_id, teams(id, name)")
      .in("enrollment_id", filteredEnrollmentIds)
      .is("end_date", null)
      .eq("is_primary", true)
      .returns<TeamAssignmentRow[]>(),
    supabase
      .from("charges")
      .select("enrollment_id, due_date")
      .in("enrollment_id", filteredEnrollmentIds)
      .neq("status", "void")
      .not("due_date", "is", null)
      .returns<ChargeDueRow[]>()
  ]);

  const guardiansByPlayer = new Map<string, GuardianLinkRow[]>();
  (guardians ?? []).forEach((row) => {
    const items = guardiansByPlayer.get(row.player_id) ?? [];
    items.push(row);
    guardiansByPlayer.set(row.player_id, items);
  });

  const teamByEnrollment = new Map<string, { id: string; name: string }>();
  (teamAssignments ?? []).forEach((row) => {
    if (!row.teams) return;
    if (!teamByEnrollment.has(row.enrollment_id)) {
      teamByEnrollment.set(row.enrollment_id, {
        id: row.teams.id,
        name: row.teams.name
      });
    }
  });

  const earliestDueByEnrollment = new Map<string, string>();
  (dueDates ?? []).forEach((row) => {
    if (!row.due_date) return;
    const existing = earliestDueByEnrollment.get(row.enrollment_id);
    if (!existing || new Date(row.due_date) < new Date(existing)) {
      earliestDueByEnrollment.set(row.enrollment_id, row.due_date);
    }
  });

  const rows = enrollmentRows
    .map((enrollment) => {
      const guardianRows = guardiansByPlayer.get(enrollment.player_id) ?? [];
      const primaryPhone =
        guardianRows.find((row) => row.is_primary)?.guardians?.phone_primary ??
        guardianRows.find((row) => row.guardians?.phone_primary)?.guardians?.phone_primary ??
        null;
      const team = teamByEnrollment.get(enrollment.id) ?? null;
      const dueDate = earliestDueByEnrollment.get(enrollment.id) ?? null;
      const overdueDays = getOverdueDays(dueDate);
      const balance = balanceByEnrollment.get(enrollment.id) ?? 0;
      const playerName = `${enrollment.players?.first_name ?? ""} ${enrollment.players?.last_name ?? ""}`.trim();

      return {
        enrollmentId: enrollment.id,
        playerName,
        campusName: enrollment.campuses?.name ?? "-",
        campusCode: enrollment.campuses?.code ?? "-",
        teamId: team?.id ?? null,
        teamName: team?.name ?? "-",
        primaryPhone,
        balance,
        dueDate,
        overdueDays
      };
    })
    .filter((row) => {
      if (filters.teamId && row.teamId !== filters.teamId) return false;
      if (!balanceBucketMatches(row.balance, balanceBucket)) return false;
      if (!overdueMatches(row.overdueDays, overdueFilter)) return false;
      if (textQuery.length > 0) {
        const haystack = `${row.playerName} ${row.primaryPhone ?? ""} ${row.teamName}`.toLowerCase();
        if (!haystack.includes(textQuery)) return false;
      }
      return true;
    })
    .sort((a, b) => b.balance - a.balance || b.overdueDays - a.overdueDays || a.playerName.localeCompare(b.playerName));

  const total = rows.length;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE;
  const paged = rows.slice(from, to);

  return { rows: paged, total, page, pageSize: PAGE_SIZE };
}
