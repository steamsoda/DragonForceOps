import { NextResponse } from "next/server";
import { getCompetitionSignupExportData } from "@/lib/queries/sports-signups";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function escapeCsv(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function toCsv(rows: Awaited<ReturnType<typeof getCompetitionSignupExportData>>) {
  const headers = [
    "Jugador",
    "Ano nacimiento",
    "Campus",
    "SLR",
    "RPC",
    "CECAFF",
  ];

  const lines = [headers.join(",")];
  for (const row of rows ?? []) {
    lines.push(
      [
        escapeCsv(row.playerName),
        row.birthYear?.toString() ?? "",
        escapeCsv(row.campusName),
        escapeCsv(row.superligaRegia),
        escapeCsv(row.rosaPowerCup),
        escapeCsv(row.cecaff),
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

  const { searchParams } = new URL(request.url);
  const campusId = searchParams.get("campus")?.trim() ?? "";
  const rows = await getCompetitionSignupExportData({ campusId });
  if (rows === null) {
    return NextResponse.json({ message: "Sin permisos." }, { status: 403 });
  }

  const csv = toCsv(rows);
  const suffix = campusId ? `-${campusId}` : "-todos";
  const filename = `inscripciones-torneos${suffix}-${formatDateForFilename(new Date())}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
