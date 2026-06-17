import { NextResponse } from "next/server";
import { getPermissionContext } from "@/lib/auth/permissions";
import { buildPlayerRosterGroupsWorkbook } from "@/lib/exports/player-roster-groups-workbook";
import { getPlayerRosterGroupsData } from "@/lib/queries/player-roster-groups";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatDateForFilename(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function slugForFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "roster";
}

export async function GET(request: Request) {
  const context = await getPermissionContext();
  if (!context) return NextResponse.json({ message: "No autenticado." }, { status: 401 });
  if (!context.hasPlayerDataAccess) return NextResponse.json({ message: "Sin permisos." }, { status: 403 });

  const url = new URL(request.url);
  const campusId = url.searchParams.get("campus") ?? undefined;
  const gender = url.searchParams.get("gender") ?? undefined;
  const birthYear = url.searchParams.get("year") ?? undefined;

  const data = await getPlayerRosterGroupsData(
    {
      campusId,
      gender,
      birthYear,
    },
    {
      campusAccess: context.campusAccess,
      supabase: createAdminClient(),
    },
  );

  const workbook = await buildPlayerRosterGroupsWorkbook(data);
  const workbookBuffer = await workbook.xlsx.writeBuffer();
  const bytes = workbookBuffer instanceof Uint8Array ? workbookBuffer : new Uint8Array(workbookBuffer);
  const campusSlug = slugForFilename(data?.selectedCampusName ?? "roster");
  const filename = `jugadores-por-grupos-${campusSlug}-${formatDateForFilename(new Date())}.xlsx`;

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
