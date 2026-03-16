import { createClient } from "@/lib/supabase/server";

// ── Equipos + Clases ───────────────────────────────────────────────────────────

export type PortoTeamRow = {
  id: string;
  name: string;
  campusName: string;
  birthYear: number | null;
  gender: string | null;
  level: string | null;
  coachName: string | null;
  playerCount: number;
};

export type PortoTeamsData = {
  competicion: PortoTeamRow[];
  clases: PortoTeamRow[];
};

type TeamWithRelations = {
  id: string;
  name: string;
  birth_year: number | null;
  gender: string | null;
  level: string | null;
  type: string;
  campuses: { name: string } | null;
  coaches: { first_name: string; last_name: string | null } | null;
};

type AssignmentRow = {
  team_id: string;
  enrollments: { status: string } | null;
};

export async function getPortoTeamsData(): Promise<PortoTeamsData> {
  const supabase = await createClient();

  const [teamsResult, assignmentsResult] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, birth_year, gender, level, type, campuses(name), coaches(first_name, last_name)")
      .eq("is_active", true)
      .order("birth_year", { ascending: true })
      .order("name", { ascending: true })
      .returns<TeamWithRelations[]>(),
    supabase
      .from("team_assignments")
      .select("team_id, enrollments!inner(status)")
      .is("end_date", null)
      .eq("enrollments.status", "active")
      .returns<AssignmentRow[]>()
  ]);

  const teams = teamsResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];

  // Count active players per team
  const countByTeam = new Map<string, number>();
  for (const a of assignments) {
    countByTeam.set(a.team_id, (countByTeam.get(a.team_id) ?? 0) + 1);
  }

  function toRow(t: TeamWithRelations): PortoTeamRow {
    const coachFirst = t.coaches?.first_name ?? null;
    const coachLast = t.coaches?.last_name ?? null;
    const coachName = coachFirst
      ? coachLast ? `${coachFirst} ${coachLast}` : coachFirst
      : null;
    return {
      id: t.id,
      name: t.name,
      campusName: t.campuses?.name ?? "-",
      birthYear: t.birth_year,
      gender: t.gender,
      level: t.level,
      coachName,
      playerCount: countByTeam.get(t.id) ?? 0
    };
  }

  return {
    competicion: teams.filter((t) => t.type === "competition").map(toRow),
    clases: teams.filter((t) => t.type === "class").map(toRow)
  };
}

export type PortoDatosGenerales = {
  periodFirstDay: string;
  periodLastDay: string;
  nuevasInscripciones: { total: number; varonil: number; femenil: number };
  retiros: { total: number; reasons: { reason: string; count: number }[] };
  activos: { total: number; varonil: number; femenil: number; becados: number };
  deudores: { count: number; pendienteMxn: number };
};

export async function getPortoDatosGenerales(
  month: string // "YYYY-MM"
): Promise<PortoDatosGenerales | null> {
  const supabase = await createClient();
  const firstDay = `${month}-01`;

  const { data, error } = await supabase.rpc("get_porto_datos_generales", {
    p_month: firstDay
  });

  if (error || !data) return null;

  const d = data as Record<string, unknown>;

  function obj(key: string) {
    return d[key] as Record<string, unknown>;
  }

  return {
    periodFirstDay: d.period_first_day as string,
    periodLastDay: d.period_last_day as string,
    nuevasInscripciones: {
      total: obj("nuevas_inscripciones").total as number,
      varonil: obj("nuevas_inscripciones").varonil as number,
      femenil: obj("nuevas_inscripciones").femenil as number
    },
    retiros: {
      total: obj("retiros").total as number,
      reasons: obj("retiros").reasons as { reason: string; count: number }[]
    },
    activos: {
      total: obj("activos").total as number,
      varonil: obj("activos").varonil as number,
      femenil: obj("activos").femenil as number,
      becados: obj("activos").becados as number
    },
    deudores: {
      count: obj("deudores").count as number,
      pendienteMxn: obj("deudores").pendiente_mxn as number
    }
  };
}
