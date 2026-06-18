import { NextResponse } from "next/server";
import { getPermissionContext } from "@/lib/auth/permissions";
import { buildPendingDetailWorkbook } from "@/lib/exports/pending-detail-workbook";
import { getPendingTuitionCategoryDetailData } from "@/lib/queries/tuition-pending";

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
    .toLowerCase() || "pendientes";
}

export async function GET(request: Request) {
  const context = await getPermissionContext();
  if (!context) return NextResponse.json({ message: "No autenticado." }, { status: 401 });
  if (!context.hasOperationalAccess) return NextResponse.json({ message: "Sin permisos." }, { status: 403 });

  const url = new URL(request.url);
  const data = await getPendingTuitionCategoryDetailData({
    campusId: url.searchParams.get("campus") ?? undefined,
    birthYear: url.searchParams.get("birthYear") ?? undefined,
    month: url.searchParams.get("month") ?? undefined,
    bucket: url.searchParams.get("bucket") ?? undefined,
  });

  if (!data) return NextResponse.json({ message: "No hay datos para exportar." }, { status: 404 });

  const workbook = await buildPendingDetailWorkbook(data);
  const workbookBuffer = await workbook.xlsx.writeBuffer();
  const bytes = workbookBuffer instanceof Uint8Array ? workbookBuffer : new Uint8Array(workbookBuffer);
  const filename = [
    "pendientes",
    slugForFilename(data.categoryLabel),
    slugForFilename(data.campusName),
    formatDateForFilename(new Date()),
  ].join("-");

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
