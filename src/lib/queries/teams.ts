import { createClient } from "@/lib/supabase/server";

type TeamRow = {
  id: string;
  name: string;
  birth_year: number | null;
  gender: string | null;
  level: string | null;
  campus_id: string;
  campuses: { name: string | null } | null;
};

type ChargeTypeRow = {
  id: string;
  code: string;
  name: string;
};

// Charge type codes that are auto-managed — exclude from bulk charge form.
const EXCLUDED_CODES = new Set(["monthly_tuition", "inscription", "early_bird_discount"]);

export type TeamOption = {
  id: string;
  name: string;
  campusId: string;
  campusName: string;
  birthYear: number | null;
  gender: string | null;
  level: string | null;
};

export type BulkChargeType = {
  id: string;
  code: string;
  name: string;
};

export async function listTeamsWithCampus(): Promise<TeamOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("teams")
    .select("id, name, birth_year, gender, level, campus_id, campuses(name)")
    .eq("is_active", true)
    .order("campus_id", { ascending: true })
    .order("birth_year", { ascending: true })
    .order("name", { ascending: true })
    .returns<TeamRow[]>();

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    campusId: row.campus_id,
    campusName: row.campuses?.name ?? "-",
    birthYear: row.birth_year,
    gender: row.gender,
    level: row.level
  }));
}

export async function listBulkChargeTypes(): Promise<BulkChargeType[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("charge_types")
    .select("id, code, name")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .returns<ChargeTypeRow[]>();

  return (data ?? [])
    .filter((row) => !EXCLUDED_CODES.has(row.code))
    .map((row) => ({ id: row.id, code: row.code, name: row.name }));
}
