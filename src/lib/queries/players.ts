import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

export type PlayerListFilters = {
  q?: string;
  phone?: string;
  status?: "active" | "inactive" | "archived" | "all";
  campusId?: string;
  page?: number;
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
  first_name: string;
  last_name: string;
  birth_date: string;
  status: string;
  gender: string | null;
  medical_notes: string | null;
};

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

type EnrollmentBalanceRow = {
  enrollment_id: string;
  total_charges: number;
  total_payments: number;
  balance: number;
};

export async function listPlayers(filters: PlayerListFilters) {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let constrainedPlayerIds: string[] | null = null;
  if (filters.campusId) {
    const { data: enrollmentsInCampus } = await supabase
      .from("enrollments")
      .select("player_id")
      .eq("status", "active")
      .eq("campus_id", filters.campusId);

    constrainedPlayerIds = [...new Set((enrollmentsInCampus ?? []).map((row) => row.player_id as string))];
    if (constrainedPlayerIds.length === 0) {
      return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
    }
  }

  if (filters.phone) {
    const phone = filters.phone.trim();
    if (phone.length > 0) {
      const { data: linksByPhone } = await supabase
        .from("player_guardians")
        .select("player_id, guardians!inner(phone_primary)")
        .ilike("guardians.phone_primary", `%${phone}%`);

      const phonePlayerIds = [...new Set((linksByPhone ?? []).map((row) => row.player_id as string))];
      if (phonePlayerIds.length === 0) {
        return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
      }

      if (constrainedPlayerIds) {
        const allowed = new Set(constrainedPlayerIds);
        constrainedPlayerIds = phonePlayerIds.filter((id) => allowed.has(id));
      } else {
        constrainedPlayerIds = phonePlayerIds;
      }

      if (constrainedPlayerIds.length === 0) {
        return { rows: [], total: 0, page, pageSize: PAGE_SIZE };
      }
    }
  }

  let playerQuery = supabase
    .from("players")
    .select("id, first_name, last_name, birth_date, status", { count: "exact" })
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .range(from, to);

  if (filters.q) {
    const q = filters.q.trim();
    if (q.length > 0) {
      playerQuery = playerQuery.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
    }
  }

  if (filters.status && filters.status !== "all") {
    playerQuery = playerQuery.eq("status", filters.status);
  }

  if (constrainedPlayerIds) {
    playerQuery = playerQuery.in("id", constrainedPlayerIds);
  }

  const { data: players, count } = await playerQuery.returns<PlayerRow[]>();
  const playerIds = (players ?? []).map((p) => p.id);

  if (playerIds.length === 0) {
    return { rows: [], total: count ?? 0, page, pageSize: PAGE_SIZE };
  }

  const [{ data: guardianLinks }, { data: activeEnrollments }] = await Promise.all([
    supabase
      .from("player_guardians")
      .select("player_id, is_primary, guardians(phone_primary, first_name, last_name)")
      .in("player_id", playerIds)
      .returns<GuardianLinkRow[]>(),
    supabase
      .from("enrollments")
      .select("player_id, campus_id, status, campuses(name, code)")
      .eq("status", "active")
      .in("player_id", playerIds)
      .returns<EnrollmentRow[]>()
  ]);

  const guardiansByPlayer = new Map<string, GuardianLinkRow[]>();
  (guardianLinks ?? []).forEach((row) => {
    const arr = guardiansByPlayer.get(row.player_id) ?? [];
    arr.push(row);
    guardiansByPlayer.set(row.player_id, arr);
  });

  const enrollmentByPlayer = new Map<string, EnrollmentRow>();
  (activeEnrollments ?? []).forEach((row) => {
    if (!enrollmentByPlayer.has(row.player_id)) {
      enrollmentByPlayer.set(row.player_id, row);
    }
  });

  const rows = (players ?? []).map((player) => {
    const guardians = guardiansByPlayer.get(player.id) ?? [];
    const primary =
      guardians.find((g) => g.is_primary)?.guardians?.phone_primary ??
      guardians.find((g) => !!g.guardians?.phone_primary)?.guardians?.phone_primary ??
      null;
    const activeEnrollment = enrollmentByPlayer.get(player.id);

    return {
      id: player.id,
      fullName: `${player.first_name} ${player.last_name}`,
      birthDate: player.birth_date,
      status: player.status,
      campusName: activeEnrollment?.campuses?.name ?? "-",
      campusCode: activeEnrollment?.campuses?.code ?? null,
      primaryPhone: primary
    };
  });

  return { rows, total: count ?? 0, page, pageSize: PAGE_SIZE };
}

export async function listCampuses() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campuses")
    .select("id, name, code")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .returns<CampusRow[]>();

  return data ?? [];
}

export async function getPlayerDetail(playerId: string) {
  const supabase = await createClient();

  const [{ data: player }, { data: guardianRows }, { data: enrollmentRows }] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, birth_date, status, gender, medical_notes")
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
        "id, status, start_date, end_date, inscription_date, campuses(id, name, code), pricing_plans(id, name, currency)"
      )
      .eq("player_id", playerId)
      .order("start_date", { ascending: false })
      .returns<PlayerEnrollmentDetailRow[]>()
  ]);

  if (!player) return null;

  const enrollmentIds = (enrollmentRows ?? []).map((row) => row.id);
  let balancesByEnrollment = new Map<string, EnrollmentBalanceRow>();

  if (enrollmentIds.length > 0) {
    const { data: balanceRows } = await supabase
      .from("v_enrollment_balances")
      .select("enrollment_id, total_charges, total_payments, balance")
      .in("enrollment_id", enrollmentIds)
      .returns<EnrollmentBalanceRow[]>();

    balancesByEnrollment = new Map((balanceRows ?? []).map((row) => [row.enrollment_id, row]));
  }

  const guardians = (guardianRows ?? [])
    .filter((row) => !!row.guardians)
    .map((row) => ({
      ...row.guardians!,
      isPrimary: row.is_primary
    }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  const enrollments = (enrollmentRows ?? []).map((row) => {
    const balance = balancesByEnrollment.get(row.id);
    return {
      id: row.id,
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
      inscriptionDate: row.inscription_date,
      campusName: row.campuses?.name ?? "-",
      campusCode: row.campuses?.code ?? "-",
      pricingPlanName: row.pricing_plans?.name ?? "-",
      currency: row.pricing_plans?.currency ?? "MXN",
      totalCharges: balance?.total_charges ?? 0,
      totalPayments: balance?.total_payments ?? 0,
      balance: balance?.balance ?? 0
    };
  });

  return {
    id: player.id,
    fullName: `${player.first_name} ${player.last_name}`,
    birthDate: player.birth_date,
    status: player.status,
    gender: player.gender,
    medicalNotes: player.medical_notes,
    guardians,
    enrollments
  };
}
