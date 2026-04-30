import { createClient } from "@/lib/supabase/server";
import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { resolveActiveIncident, type ActiveIncident } from "@/lib/incidents";
import { getEnrollmentLedger, type EnrollmentLedger } from "@/lib/queries/billing";

const PAGE_SIZE = 20;
const POSTGREST_PAGE_SIZE = 1000;
const IN_FILTER_CHUNK_SIZE = 100;

export type PlayerListFilters = {
  q?: string;
  phone?: string;
  campusId?: string;
  birthYear?: string;
  gender?: string;
  missingGender?: boolean;
  missingLevel?: boolean;
  missingTeam?: boolean;
  pendingMonth?: string;
  page?: number;
  enabledTags?: {
    payment: boolean;
    teamType: boolean;
    goalkeeper: boolean;
    uniform: boolean;
  };
};

type PlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  status: string;
};

type GuardianLinkRow = {
  player_id: string;
  is_primary: boolean;
  guardians: {
    phone_primary: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

type EnrollmentRow = {
  player_id: string;
  campus_id: string;
  status: string;
  campuses: {
    name: string | null;
    code: string | null;
  } | null;
};

type CampusRow = {
  id: string;
  name: string;
  code: string;
};

type PlayerDetailRow = {
  id: string;
  public_player_id: string | null;
  first_name: string;
  last_name: string;
  birth_date: string;
  status: string;
  gender: string | null;
  medical_notes: string | null;
  uniform_size: string | null;
  is_goalkeeper: boolean;
  level: string | null;
};

type JerseyNumberRow = { jersey_number: number | null };

type PlayerGuardianDetailRow = {
  is_primary: boolean;
  guardians: {
    id: string;
    first_name: string;
    last_name: string;
    phone_primary: string;
    phone_secondary: string | null;
    email: string | null;
    relationship_label: string | null;
  } | null;
};

type PlayerEnrollmentDetailRow = {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  inscription_date: string;
  dropout_reason: string | null;
  dropout_notes: string | null;
  campuses: {
    id: string;
    name: string;
    code: string;
  } | null;
  pricing_plans: {
    id: string;
    name: string;
    currency: string;
  } | null;
};

type BajaEnrollmentRow = {
  player_id: string;
  start_date: string;
  end_date: string | null;
  campus_id: string;
  dropout_reason: string | null;
  campuses: { name: string | null; code: string | null } | null;
  players: { first_name: string | null; last_name: string | null } | null;
};

type EnrollmentBalanceRow = {
  enrollment_id: string;
  total_charges: number;
  total_payments: number;
  balance: number;
};

type TeamAssignmentDetailRow = {
  id?: string;
  teams: {
    id: string;
    name: string;
    birth_year: number | null;
    gender: string | null;
    level: string | null;
    type?: string | null;
    coaches: {
      first_name: string;
      last_name: string;
    } | null;
  } | null;
};

type TrainingGroupAssignmentDetailRow = {
  training_groups: {
    id: string;
    name: string;
    program: string;
    level_label: string | null;
    group_code: string | null;
    gender: string;
    birth_year_min: number | null;
    birth_year_max: number | null;
  } | null;
};

type PlayerWithEnrollmentRow = {
  id: string;
  public_player_id: string | null;
  first_name: string;
  last_name: string;
  birth_date: string;
  status: string;
  gender: string | null;
  level: string | null;
  is_goalkeeper: boolean;
  enrollments: Array<{
    id: string;
    campus_id: string;
    status: string;
    campuses: { name: string | null; code: string | null } | null;
  }>;
};

type UniformOrderRow = {
  player_id: string;
  status: string;
};

type EnrollmentIncidentListRow = {
  enrollment_id: string;
  incident_type: string;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  cancelled_at: string | null;
};

type ListBalanceRow = {
  enrollment_id: string;
  balance: number;
};

type ListPendingBalanceRpcRow = {
  enrollment_id: string;
  balance: number | string;
};

type ListTeamRow = {
  enrollment_id: string;
  teams: { name: string | null; type: string; level: string | null } | null;
};

type PendingMonthChargeRow = {
  enrollment_id: string;
  amount: number;
  charge_types?: { code: string | null } | null;
  payment_allocations: Array<{ amount: number | null }> | null;
};

function normalizePendingMonth(value: string | undefined) {
  const raw = value?.trim() ?? "";
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}

type SupabaseArrayResult<T> = PromiseLike<{ data: T[] | null }>;

async function fetchPagedRows<T>(
  loadPage: (from: number, to: number) => SupabaseArrayResult<T>
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += POSTGREST_PAGE_SIZE) {
    const { data } = await loadPage(from, from + POSTGREST_PAGE_SIZE - 1);
    const page = data ?? [];
    rows.push(...page);

    if (page.length < POSTGREST_PAGE_SIZE) break;
  }

  return rows;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function fetchChunkedRows<T>(
  ids: string[],
  loadChunkPage: (chunk: string[], from: number, to: number) => SupabaseArrayResult<T>
): Promise<T[]> {
  const uniqueIds = uniqueValues(ids);
  const rows: T[] = [];

  for (let index = 0; index < uniqueIds.length; index += IN_FILTER_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(index, index + IN_FILTER_CHUNK_SIZE);
    rows.push(...await fetchPagedRows((from, to) => loadChunkPage(chunk, from, to)));
  }

  return rows;
}

export async function listPlayers(filters: PlayerListFilters) {
  const supabase = await createClient();
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campusIds.length === 0) {
    return { rows: [], total: 0, page: Math.max(1, filters.page ?? 1), pageSize: PAGE_SIZE };
  }

  const page = Math.max(1, filters.page ?? 1);
  const selectedCampusIds = filters.campusId
    ? canAccessCampus(campusAccess, filters.campusId)
      ? [filters.campusId]
      : []
    : campusAccess.campusIds;

  if (selectedCampusIds.length === 0) {
    return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
  }

  let phonePlayerIds: string[] | null = null;
  if (filters.phone?.trim()) {
    const phoneQuery = filters.phone.trim();
    const linksByPhone = await fetchPagedRows<{ player_id: string }>((from, to) =>
      supabase
        .from("player_guardians")
        .select("player_id, guardians!inner(phone_primary)")
        .ilike("guardians.phone_primary", `%${phoneQuery}%`)
        .range(from, to)
        .returns<Array<{ player_id: string }>>()
    );
    phonePlayerIds = uniqueValues(linksByPhone.map((row) => row.player_id));
    if (phonePlayerIds.length === 0) {
      return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
    }
  }

  const pendingMonth = normalizePendingMonth(filters.pendingMonth);

  const players = await fetchPagedRows<PlayerWithEnrollmentRow>((from, to) =>
    supabase
      .from("players")
      .select("id, public_player_id, first_name, last_name, birth_date, status, gender, level, is_goalkeeper, enrollments!inner(id, campus_id, status, campuses(name, code))")
      .eq("enrollments.status", "active")
      .in("enrollments.campus_id", selectedCampusIds)
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true })
      .range(from, to)
      .returns<PlayerWithEnrollmentRow[]>()
  );

  const playerIds = players.map((player) => player.id);
  if (playerIds.length === 0) {
    return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
  }

  const enrollmentIds = players.map((player) => player.enrollments[0]?.id).filter(Boolean) as string[];
  const enrollmentIdSet = new Set(enrollmentIds);
  const needsUniform = filters.enabledTags?.uniform === true;
  const pendingBalanceCampusId = selectedCampusIds.length === 1 ? selectedCampusIds[0] : null;

  const [guardianLinks, pendingBalanceRowsRaw, teamRows, uniformRows, pendingMonthRows, incidentRows] =
    await Promise.all([
      fetchChunkedRows<GuardianLinkRow>(playerIds, (chunk, from, to) =>
        supabase
          .from("player_guardians")
          .select("player_id, is_primary, guardians(phone_primary, first_name, last_name)")
          .in("player_id", chunk)
          .range(from, to)
          .returns<GuardianLinkRow[]>()
      ),
      fetchPagedRows<ListPendingBalanceRpcRow>((from, to) =>
        supabase
          .rpc("list_pending_enrollments_full", { p_campus_id: pendingBalanceCampusId })
          .range(from, to)
          .returns<ListPendingBalanceRpcRow[]>() as unknown as SupabaseArrayResult<ListPendingBalanceRpcRow>
      ),
      fetchChunkedRows<ListTeamRow>(enrollmentIds, (chunk, from, to) =>
        supabase
          .from("team_assignments")
          .select("enrollment_id, teams(name, type, level)")
          .in("enrollment_id", chunk)
          .is("end_date", null)
          .eq("is_primary", true)
          .range(from, to)
          .returns<ListTeamRow[]>()
      ),
      needsUniform
        ? fetchChunkedRows<UniformOrderRow>(enrollmentIds, (chunk, from, to) =>
            supabase
              .from("uniform_orders")
              .select("player_id, status")
              .in("enrollment_id", chunk)
              .range(from, to)
              .returns<UniformOrderRow[]>()
          )
        : Promise.resolve([]),
      pendingMonth
        ? fetchChunkedRows<PendingMonthChargeRow>(enrollmentIds, (chunk, from, to) =>
            supabase
              .from("charges")
              .select("enrollment_id, amount, charge_types!inner(code), payment_allocations(amount)")
              .in("enrollment_id", chunk)
              .eq("charge_types.code", "monthly_tuition")
              .eq("period_month", pendingMonth)
              .neq("status", "void")
              .range(from, to)
              .returns<PendingMonthChargeRow[]>()
          )
        : Promise.resolve([]),
      fetchChunkedRows<EnrollmentIncidentListRow>(enrollmentIds, (chunk, from, to) =>
        supabase
          .from("enrollment_incidents")
          .select("enrollment_id, incident_type, starts_on, ends_on, created_at, cancelled_at")
          .in("enrollment_id", chunk)
          .range(from, to)
          .returns<EnrollmentIncidentListRow[]>()
      ),
    ]);

  const pendingBalanceRows = Array.isArray(pendingBalanceRowsRaw)
    ? (pendingBalanceRowsRaw as ListPendingBalanceRpcRow[])
    : [];

  const uniformStatusByPlayer = new Map<string, "pending" | "delivered">();
  if (needsUniform && uniformRows) {
    const ordersByPlayer = new Map<string, string[]>();
    for (const row of uniformRows) {
      const arr = ordersByPlayer.get(row.player_id) ?? [];
      arr.push(row.status);
      ordersByPlayer.set(row.player_id, arr);
    }
    for (const [playerId, statuses] of ordersByPlayer) {
      uniformStatusByPlayer.set(
        playerId,
        statuses.some((status) => status === "pending_order" || status === "ordered") ? "pending" : "delivered"
      );
    }
  }

  const guardiansByPlayer = new Map<string, GuardianLinkRow[]>();
  for (const link of guardianLinks) {
    const arr = guardiansByPlayer.get(link.player_id) ?? [];
    arr.push(link);
    guardiansByPlayer.set(link.player_id, arr);
  }

  const balanceByEnrollment = new Map(
    pendingBalanceRows
      .filter((row) => enrollmentIdSet.has(row.enrollment_id))
      .map((row) => [row.enrollment_id, typeof row.balance === "string" ? Number(row.balance) : (row.balance ?? 0)]),
  );
  const teamByEnrollment = new Map(teamRows.map((row) => [row.enrollment_id, row.teams ?? null]));
  const activeIncidentByEnrollment = new Map<string, ActiveIncident>();

  if (incidentRows) {
    const incidentsByEnrollment = new Map<string, EnrollmentIncidentListRow[]>();
    for (const row of incidentRows) {
      const arr = incidentsByEnrollment.get(row.enrollment_id) ?? [];
      arr.push(row);
      incidentsByEnrollment.set(row.enrollment_id, arr);
    }

    for (const [enrollmentId, rows] of incidentsByEnrollment) {
      const activeIncident = resolveActiveIncident(
        rows.map((row) => ({
          incidentType: row.incident_type,
          startsOn: row.starts_on,
          endsOn: row.ends_on,
          createdAt: row.created_at,
          cancelledAt: row.cancelled_at,
        })),
      );
      if (activeIncident) {
        activeIncidentByEnrollment.set(enrollmentId, activeIncident);
      }
    }
  }

  const pendingEnrollmentIds = new Set<string>();
  for (const charge of pendingMonthRows) {
    const allocated = (charge.payment_allocations ?? []).reduce((sum, allocation) => sum + (allocation.amount ?? 0), 0);
    if (charge.amount - allocated > 0.009) {
      pendingEnrollmentIds.add(charge.enrollment_id);
    }
  }

  const queryText = filters.q?.trim().toLowerCase() ?? "";
  const genderFilter = filters.gender?.trim() ?? "";
  const phoneFilterSet = phonePlayerIds ? new Set(phonePlayerIds) : null;

  const allRows = players.map((player) => {
    const guardians = guardiansByPlayer.get(player.id) ?? [];
    const primaryPhone =
      guardians.find((guardian) => guardian.is_primary)?.guardians?.phone_primary ??
      guardians.find((guardian) => !!guardian.guardians?.phone_primary)?.guardians?.phone_primary ??
      null;
    const enrollment = player.enrollments[0];
    const enrollmentId = enrollment?.id ?? null;
    const team = enrollmentId ? (teamByEnrollment.get(enrollmentId) ?? null) : null;
    const resolvedLevel = team?.level ?? player.level ?? null;

    return {
      id: player.id,
      publicPlayerId: player.public_player_id,
      fullName: `${player.first_name} ${player.last_name}`,
      birthDate: player.birth_date,
      birthYear: parseInt(player.birth_date.slice(0, 4), 10),
      status: player.status,
      gender: player.gender,
      isGoalkeeper: player.is_goalkeeper,
      campusName: enrollment?.campuses?.name ?? "-",
      campusCode: enrollment?.campuses?.code ?? null,
      primaryPhone,
      balance: enrollmentId ? (balanceByEnrollment.get(enrollmentId) ?? 0) : 0,
      teamType: team?.type ?? null,
      teamName: team?.name ?? null,
      level: resolvedLevel,
      uniformStatus: uniformStatusByPlayer.get(player.id) ?? null,
      enrollmentId,
      hasPendingSelectedMonth: enrollmentId ? pendingEnrollmentIds.has(enrollmentId) : false,
      activeIncident: enrollmentId ? (activeIncidentByEnrollment.get(enrollmentId) ?? null) : null,
    };
  });

  const filteredRows = allRows.filter((row) => {
    if (phoneFilterSet && !phoneFilterSet.has(row.id)) return false;
    if (queryText && !row.fullName.toLowerCase().includes(queryText)) return false;
    if (filters.birthYear?.trim() && String(row.birthYear) !== filters.birthYear.trim()) return false;
    if (genderFilter && row.gender !== genderFilter) return false;
    if (filters.missingGender && !!row.gender) return false;
    if (filters.missingLevel && !!row.level?.trim()) return false;
    if (filters.missingTeam && !!row.teamName?.trim()) return false;
    if (pendingMonth && !row.hasPendingSelectedMonth) return false;
    return true;
  });

  const total = filteredRows.length;
  const from = (page - 1) * PAGE_SIZE;
  const rows = filteredRows.slice(from, from + PAGE_SIZE);

  return { rows, total, page, pageSize: PAGE_SIZE };
}
export type BajaListFilters = {
  q?: string;
  campusId?: string;
  page?: number;
};

export async function listBajas(filters: BajaListFilters) {
  const supabase = await createClient();
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campusIds.length === 0) {
    return { rows: [], total: 0, page: Math.max(1, filters.page ?? 1), pageSize: PAGE_SIZE };
  }
  const page = Math.max(1, filters.page ?? 1);

  // Exclude players that have an active enrollment
  const { data: activeRows } = await supabase.from("enrollments").select("player_id").eq("status", "active");
  const activePlayerIds = new Set((activeRows ?? []).map((row) => row.player_id as string));

  let query = supabase
    .from("enrollments")
    .select("id, player_id, start_date, end_date, campus_id, dropout_reason, players(first_name, last_name), campuses(name, code)")
    .in("status", ["ended", "cancelled"])
    .in("campus_id", campusAccess.campusIds)
    .order("end_date", { ascending: false });

  if (filters.campusId) {
    if (!canAccessCampus(campusAccess, filters.campusId)) {
      return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
    }
    query = query.eq("campus_id", filters.campusId);
  }

  const { data: rows } = await query.returns<Array<BajaEnrollmentRow & { id: string }>>();

  const endedEnrollmentIds = (rows ?? []).map((row) => row.id);
  const { data: endedBalanceRows } = endedEnrollmentIds.length
    ? await supabase
        .from("v_enrollment_balances")
        .select("enrollment_id, balance")
        .in("enrollment_id", endedEnrollmentIds)
        .returns<ListBalanceRow[]>()
    : { data: [] as ListBalanceRow[] };
  const endedBalanceMap = new Map((endedBalanceRows ?? []).map((row) => [row.enrollment_id, row.balance]));

  // Deduplicate: keep only most recent ended enrollment per player; exclude active players
  const seen = new Set<string>();
  const textQuery = (filters.q ?? "").trim().toLowerCase();

  const deduped = (rows ?? []).filter((row) => {
    if (activePlayerIds.has(row.player_id)) return false;
    if (seen.has(row.player_id)) return false;
    seen.add(row.player_id);
    if (textQuery) {
      const name = `${row.players?.first_name ?? ""} ${row.players?.last_name ?? ""}`.toLowerCase();
      if (!name.includes(textQuery)) return false;
    }
    return true;
  });

  const total = deduped.length;
  const from = (page - 1) * PAGE_SIZE;
  const paged = deduped.slice(from, from + PAGE_SIZE);

  const bajaRows = paged.map((row) => {
    const startDate = new Date(row.start_date);
    const endDate = row.end_date ? new Date(row.end_date) : null;
    const daysEnrolled = endDate ? Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
    return {
      playerId: row.player_id,
      fullName: `${row.players?.first_name ?? ""} ${row.players?.last_name ?? ""}`.trim(),
      startDate: row.start_date,
      endDate: row.end_date,
      daysEnrolled,
      dropoutReason: row.dropout_reason,
      campusName: row.campuses?.name ?? "-",
      campusCode: row.campuses?.code ?? "-",
      pendingBalance: endedBalanceMap.get(row.id) ?? 0,
    };
  });

  return { rows: bajaRows, total, page, pageSize: PAGE_SIZE };
}

export async function listCampuses() {
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess) return [];
  return campusAccess.campuses;
}

export async function listBirthYears(): Promise<number[]> {
  const supabase = await createClient();
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess || campusAccess.campusIds.length === 0) return [];

  const rows = await fetchPagedRows<{ birth_date: string; enrollments: Array<{ campus_id: string; status: string }> }>((from, to) =>
    supabase
      .from("players")
      .select("birth_date, enrollments!inner(campus_id, status)")
      .eq("enrollments.status", "active")
      .in("enrollments.campus_id", campusAccess.campusIds)
      .range(from, to)
      .returns<Array<{ birth_date: string; enrollments: Array<{ campus_id: string; status: string }> }>>()
  );

  return [...new Set(rows.map((row) => parseInt(row.birth_date.slice(0, 4), 10)).filter(Number.isFinite))].sort((a, b) => a - b);
}

export async function getPlayerDetail(playerId: string) {
  const supabase = await createClient();
  const campusAccess = await getOperationalCampusAccess();
  if (!campusAccess) return null;

  const [{ data: player }, { data: guardianRows }, { data: enrollmentRows }] = await Promise.all([
    supabase
      .from("players")
      .select("id, public_player_id, first_name, last_name, birth_date, status, gender, medical_notes, uniform_size, is_goalkeeper, level")
      .eq("id", playerId)
      .maybeSingle()
      .returns<PlayerDetailRow | null>(),
    supabase
      .from("player_guardians")
      .select(
        "is_primary, guardians(id, first_name, last_name, phone_primary, phone_secondary, email, relationship_label)"
      )
      .eq("player_id", playerId)
      .returns<PlayerGuardianDetailRow[]>(),
    supabase
      .from("enrollments")
      .select(
        "id, status, start_date, end_date, inscription_date, dropout_reason, dropout_notes, campuses(id, name, code), pricing_plans(id, name, currency)"
      )
      .eq("player_id", playerId)
      .order("start_date", { ascending: false })
      .returns<PlayerEnrollmentDetailRow[]>()
  ]);

  if (!player) return null;
  const visibleEnrollmentRows = (enrollmentRows ?? []).filter(
    (row) => !!row.campuses?.id && canAccessCampus(campusAccess, row.campuses.id)
  );
  if (visibleEnrollmentRows.length === 0) return null;

  // Defensive: fetch jersey_number separately so a missing migration doesn't 404 the page
  const { data: jrData } = await supabase
    .from("players")
    .select("jersey_number")
    .eq("id", playerId)
    .maybeSingle()
    .returns<JerseyNumberRow | null>();
  const jerseyNumber = jrData?.jersey_number ?? null;

  const enrollmentIds = visibleEnrollmentRows.map((row) => row.id);
  const activeEnrollmentRow = visibleEnrollmentRows.find((row) => row.status === "active");

  let balancesByEnrollment = new Map<string, EnrollmentBalanceRow>();
  let teamAssignment: TeamAssignmentDetailRow | null = null;
  let competitionAssignments: TeamAssignmentDetailRow[] = [];
  let trainingGroupAssignment: TrainingGroupAssignmentDetailRow | null = null;
  let activeIncident: ActiveIncident | null = null;
  let activeEnrollmentLedger: EnrollmentLedger | null = null;

  await Promise.all([
    enrollmentIds.length > 0
      ? supabase
          .from("v_enrollment_balances")
          .select("enrollment_id, total_charges, total_payments, balance")
          .in("enrollment_id", enrollmentIds)
          .returns<EnrollmentBalanceRow[]>()
          .then(({ data }) => {
            balancesByEnrollment = new Map((data ?? []).map((row) => [row.enrollment_id, row]));
          })
      : Promise.resolve(),
    activeEnrollmentRow
      ? supabase
          .from("team_assignments")
          .select("teams(id, name, birth_year, gender, level, coaches(first_name, last_name))")
          .eq("enrollment_id", activeEnrollmentRow.id)
          .is("end_date", null)
          .eq("is_primary", true)
          .maybeSingle()
          .returns<TeamAssignmentDetailRow | null>()
          .then(({ data }) => {
            teamAssignment = data;
          })
      : Promise.resolve(),
    activeEnrollmentRow
      ? supabase
          .from("team_assignments")
          .select("teams(id, name, birth_year, gender, level, coaches(first_name, last_name), type)")
          .eq("enrollment_id", activeEnrollmentRow.id)
          .is("end_date", null)
          .returns<TeamAssignmentDetailRow[]>()
          .then(({ data }) => {
            competitionAssignments = (data ?? []).filter((row) => row.teams && (row.teams as TeamAssignmentDetailRow["teams"] & { type?: string }).type === "competition");
          })
      : Promise.resolve(),
    activeEnrollmentRow
      ? supabase
          .from("training_group_assignments")
          .select("training_groups(id, name, program, level_label, group_code, gender, birth_year_min, birth_year_max)")
          .eq("enrollment_id", activeEnrollmentRow.id)
          .is("end_date", null)
          .maybeSingle()
          .returns<TrainingGroupAssignmentDetailRow | null>()
          .then(({ data }) => {
            trainingGroupAssignment = data;
          })
      : Promise.resolve(),
    activeEnrollmentRow
      ? supabase
          .from("enrollment_incidents")
          .select("incident_type, starts_on, ends_on, created_at, cancelled_at")
          .eq("enrollment_id", activeEnrollmentRow.id)
          .returns<Array<{
            incident_type: string;
            starts_on: string | null;
            ends_on: string | null;
            created_at: string;
            cancelled_at: string | null;
          }>>()
          .then(({ data }) => {
            activeIncident = resolveActiveIncident(
              (data ?? []).map((row) => ({
                incidentType: row.incident_type,
                startsOn: row.starts_on,
                endsOn: row.ends_on,
                createdAt: row.created_at,
                cancelledAt: row.cancelled_at,
              })),
            );
          })
      : Promise.resolve(),
  ]);

  if (activeEnrollmentRow) {
    activeEnrollmentLedger = await getEnrollmentLedger(activeEnrollmentRow.id);
  }

  const guardians = (guardianRows ?? [])
    .filter((row) => !!row.guardians)
    .map((row) => ({
      ...row.guardians!,
      isPrimary: row.is_primary
    }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  const enrollments = visibleEnrollmentRows.map((row) => {
    const balance = balancesByEnrollment.get(row.id);
    return {
      id: row.id,
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
      inscriptionDate: row.inscription_date,
      dropoutReason: row.dropout_reason,
      dropoutNotes: row.dropout_notes,
      campusName: row.campuses?.name ?? "-",
      campusCode: row.campuses?.code ?? "-",
      pricingPlanName: row.pricing_plans?.name ?? "-",
      currency: row.pricing_plans?.currency ?? "MXN",
      totalCharges: balance?.total_charges ?? 0,
      totalPayments: balance?.total_payments ?? 0,
      balance: balance?.balance ?? 0
    };
  });
  const activeEnrollment = enrollments.find((row) => row.status === "active") ?? null;
  const historicalEnrollments = enrollments.filter((row) => row.status !== "active");
  const latestEndedEnrollment =
    [...historicalEnrollments].sort((a, b) => {
      const left = a.endDate ?? a.startDate;
      const right = b.endDate ?? b.startDate;
      return right.localeCompare(left);
    })[0] ?? null;

  const team = (teamAssignment as TeamAssignmentDetailRow | null)?.teams ?? null;
  const trainingGroup = (trainingGroupAssignment as TrainingGroupAssignmentDetailRow | null)?.training_groups ?? null;

  return {
    id: player.id,
    publicPlayerId: player.public_player_id,
    firstName: player.first_name,
    lastName: player.last_name,
    fullName: `${player.first_name} ${player.last_name}`,
    birthDate: player.birth_date,
    status: player.status,
    gender: player.gender,
    medicalNotes: player.medical_notes,
    uniformSize: player.uniform_size,
    isGoalkeeper: player.is_goalkeeper,
    level: player.level,
    jerseyNumber,
    activeIncident,
    guardians,
    enrollments,
    hasActiveEnrollment: !!activeEnrollment,
    activeEnrollment,
    historicalEnrollments,
    latestEndedEnrollment,
    activeEnrollmentLedger,
    activeTrainingGroup: trainingGroup
      ? {
          id: trainingGroup.id,
          name: trainingGroup.name,
          program: trainingGroup.program,
          levelLabel: trainingGroup.level_label,
          groupCode: trainingGroup.group_code,
          gender: trainingGroup.gender,
          birthYearMin: trainingGroup.birth_year_min,
          birthYearMax: trainingGroup.birth_year_max,
        }
      : null,
    competitionTeams: competitionAssignments
      .map((row) => row.teams)
      .filter((teamRow): teamRow is NonNullable<typeof team> => Boolean(teamRow))
      .map((teamRow) => ({
        id: teamRow.id,
        name: teamRow.name,
        birthYear: teamRow.birth_year,
        gender: teamRow.gender,
        level: teamRow.level,
        coachName: teamRow.coaches
          ? `${teamRow.coaches.first_name} ${teamRow.coaches.last_name}`.trim()
          : null,
      })),
    activeTeam: team
      ? {
          id: team.id,
          name: team.name,
          birthYear: team.birth_year,
          gender: team.gender,
          level: team.level,
          coachName: team.coaches
            ? `${team.coaches.first_name} ${team.coaches.last_name}`.trim()
            : null
        }
      : null
  };
}
