import { NextResponse } from "next/server";
import { getCompetitionRosterLiveViewData } from "@/lib/queries/competition-rosters";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ message: "No autenticado." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const tournamentId = params.get("tournament")?.trim() ?? "";
  const campusId = params.get("campus")?.trim() ?? "";
  const program = params.get("program")?.trim() ?? "";
  if (!tournamentId || !campusId || !program) {
    return NextResponse.json({ message: "Faltan filtros para consultar los equipos." }, { status: 400 });
  }

  const data = await getCompetitionRosterLiveViewData({ tournamentId, campusId, program });
  if (!data) return NextResponse.json({ message: "Sin permisos o equipos no disponibles." }, { status: 403 });

  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
