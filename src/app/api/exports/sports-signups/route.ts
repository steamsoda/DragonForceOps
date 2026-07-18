import { NextResponse } from "next/server";
import { getPermissionContext } from "@/lib/auth/permissions";
import { buildSportsSignupsWorkbook } from "@/lib/exports/sports-signups-workbook";
import { getCompetitionSignupExportData } from "@/lib/queries/sports-signups";
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

function formatDateForFilename(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
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
  if (!permissionContext || (!permissionContext.hasOperationalAccess && !permissionContext.hasSportsAccess)) {
    return NextResponse.json({ message: "Sin permisos." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const campusId = searchParams.get("campus")?.trim() ?? "";
  const competitionId = searchParams.get("competition")?.trim() ?? "";
  const paidFrom = searchParams.get("paidFrom")?.trim() ?? "";
  const paidTo = searchParams.get("paidTo")?.trim() ?? "";
  if (!campusId || !competitionId) {
    return NextResponse.json({ message: "Faltan filtros requeridos." }, { status: 400 });
  }

  const exportData = await getCompetitionSignupExportData({ campusId, competitionId, paidFrom, paidTo });
  if (!exportData) {
    return NextResponse.json({ message: "Sin permisos." }, { status: 403 });
  }

  const workbook = await buildSportsSignupsWorkbook(exportData);
  const workbookBuffer = await workbook.xlsx.writeBuffer();
  const bytes = workbookBuffer instanceof Uint8Array ? workbookBuffer : new Uint8Array(workbookBuffer);
  const filename = `inscripciones-${slugify(exportData.competitionLabel)}-${slugify(exportData.campusName)}-${formatDateForFilename(new Date())}.xlsx`;

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
