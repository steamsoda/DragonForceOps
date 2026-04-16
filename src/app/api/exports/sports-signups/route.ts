import { NextResponse } from "next/server";
import { getPermissionContext } from "@/lib/auth/permissions";
import {
  getCompetitionSignupExportData,
  type CompetitionSignupExportRow,
} from "@/lib/queries/sports-signups";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function escapeCsv(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function toCsv(rows: CompetitionSignupExportRow[]) {
  const headers = [
    "Jugador",
    "Ano nacimiento",
    "Campus",
    "Nivel",
    "Equipo base",
  ];

  const lines = [headers.join(",")];
  for (const row of rows ?? []) {
    lines.push(
      [
        escapeCsv(row.playerName),
        row.birthYear?.toString() ?? "",
        escapeCsv(row.campusName),
        escapeCsv(row.level),
        escapeCsv(row.teamName),
      ].join(","),
    );
  }

  return lines.join("\n");
}

function formatDateForFilename(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ message: "No autenticado." }, { status: 401 });
  }

  const permissionContext = await getPermissionContext();
  if (!permissionContext?.isSuperAdmin) {
    return NextResponse.json({ message: "Sin permisos." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const campusId = searchParams.get("campus")?.trim() ?? "";
  const competitionId = searchParams.get("competition")?.trim() ?? "";
  if (!campusId || !competitionId) {
    return NextResponse.json({ message: "Faltan filtros requeridos." }, { status: 400 });
  }

  const exportData = await getCompetitionSignupExportData({ campusId, competitionId });
  if (!exportData) {
    return NextResponse.json({ message: "Sin permisos." }, { status: 403 });
  }

  const csv = toCsv(exportData.rows);
  const filename = `inscripciones-${slugify(exportData.competitionLabel)}-${slugify(exportData.campusName)}-${formatDateForFilename(new Date())}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
