import { NextResponse } from "next/server";
import { buildCompetitionRosterSnapshotWorkbook } from "@/lib/exports/competition-roster-snapshot-workbook";
import { getCompetitionRosterSnapshotExportData } from "@/lib/queries/competition-rosters";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ message: "No autenticado." }, { status: 401 });

  const snapshotId = new URL(request.url).searchParams.get("snapshot")?.trim() ?? "";
  if (!snapshotId) return NextResponse.json({ message: "Falta la copia del plantel." }, { status: 400 });

  const data = await getCompetitionRosterSnapshotExportData(snapshotId);
  if (!data) return NextResponse.json({ message: "Sin permisos o copia no disponible." }, { status: 403 });

  const workbook = await buildCompetitionRosterSnapshotWorkbook(data);
  const buffer = await workbook.xlsx.writeBuffer();
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const filename = `plantel-${slugify(data.tournamentName)}-${slugify(data.campusName)}.xlsx`;
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
