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

// ── Enrollment edit context ───────────────────────────────────────────────────

type EnrollmentEditRow = {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  campus_id: string;
  dropout_reason: string | null;
  dropout_notes: string | null;
  campuses: { id: string; name: string; code: string } | null;
  players: { first_name: string; last_name: string } | null;
};

export type EnrollmentEditContext = {
  enrollment: {
    id: string;
    status: string;
    startDate: string;
    endDate: string | null;
    notes: string | null;
    campusId: string;
    campusName: string;
    playerName: string;
    dropoutReason: string | null;
    dropoutNotes: string | null;
  };
  campuses: Array<{ id: string; code: string; name: string }>;
};

export async function getEnrollmentEditContext(enrollmentId: string): Promise<EnrollmentEditContext | null> {
  const supabase = await createClient();

  const [enrollmentResult, campusResult] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, status, start_date, end_date, notes, campus_id, dropout_reason, dropout_notes, campuses(id, name, code), players(first_name, last_name)")
      .eq("id", enrollmentId)
      .maybeSingle()
      .returns<EnrollmentEditRow | null>(),
    supabase
      .from("campuses")
      .select("id, code, name")
      .eq("is_active", true)
      .order("name")
      .returns<CampusRow[]>()
  ]);

  if (!enrollmentResult.data) return null;

  const e = enrollmentResult.data;
  return {
    enrollment: {
      id: e.id,
      status: e.status,
      startDate: e.start_date,
      endDate: e.end_date,
      notes: e.notes,
      campusId: e.campus_id,
      campusName: e.campuses?.name ?? "-",
      playerName: `${e.players?.first_name ?? ""} ${e.players?.last_name ?? ""}`.trim(),
      dropoutReason: e.dropout_reason,
      dropoutNotes: e.dropout_notes
    },
    campuses: campusResult.data ?? []
  };
}

// ── Enrollment creation form context ─────────────────────────────────────────

type PlayerRow = { id: string; first_name: string; last_name: string };
type CampusRow = { id: string; code: string; name: string };
type PlanRow = { id: string; name: string; currency: string };
type ActiveEnrollmentRow = { id: string };
type PlanItemRow = { amount: number; charge_types: { code: string } | null };

const DEFAULT_INSCRIPTION_AMOUNT = 1800;
const DEFAULT_FIRST_MONTH_AMOUNT = 600;

export type EnrollmentCreateFormContext = {
  player: { id: string; fullName: string };
  hasActiveEnrollment: boolean;
  campuses: Array<{ id: string; code: string; name: string }>;
  plan: { id: string; name: string; currency: string } | null;
  defaultInscriptionAmount: number;
  defaultFirstMonthAmount: number;
};

export async function getEnrollmentCreateFormContext(
  playerId: string
): Promise<EnrollmentCreateFormContext | null> {
  const supabase = await createClient();

  const [playerResult, campusResult, planResult, activeEnrollmentResult] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name")
      .eq("id", playerId)
      .maybeSingle()
      .returns<PlayerRow | null>(),
    supabase
      .from("campuses")
      .select("id, code, name")
      .eq("is_active", true)
      .order("name")
      .returns<CampusRow[]>(),
    supabase
      .from("pricing_plans")
      .select("id, name, currency")
      .eq("is_active", true)
      .order("name")
      .limit(1)
      .maybeSingle()
      .returns<PlanRow | null>(),
    supabase
      .from("enrollments")
      .select("id")
      .eq("player_id", playerId)
      .eq("status", "active")
      .maybeSingle()
      .returns<ActiveEnrollmentRow | null>()
  ]);

  if (!playerResult.data) return null;

  // Read default inscription amount from DB; fall back to the constant if not found
  let defaultInscriptionAmount = DEFAULT_INSCRIPTION_AMOUNT;
  if (planResult.data) {
    const { data: planItems } = await supabase
      .from("pricing_plan_items")
      .select("amount, charge_types(code)")
      .eq("pricing_plan_id", planResult.data.id)
      .eq("is_active", true)
      .returns<PlanItemRow[]>();

    const inscriptionItem = (planItems ?? []).find((item) => item.charge_types?.code === "inscription");
    if (inscriptionItem) defaultInscriptionAmount = inscriptionItem.amount;
  }

  const p = playerResult.data;
  return {
    player: { id: p.id, fullName: `${p.first_name} ${p.last_name}`.trim() },
    hasActiveEnrollment: !!activeEnrollmentResult.data,
    campuses: campusResult.data ?? [],
    plan: planResult.data,
    defaultInscriptionAmount,
    defaultFirstMonthAmount: DEFAULT_FIRST_MONTH_AMOUNT
  };
}
