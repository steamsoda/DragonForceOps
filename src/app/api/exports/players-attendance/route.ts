import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { buildAttendanceWorkbook } from "@/lib/exports/attendance-workbook";
import { getAttendanceExportData } from "@/lib/queries/player-exports";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function formatDateForFilename(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function readLogoBuffer(): Buffer | undefined {
  try {
    const logoPath = path.join(process.cwd(), "public", "watermark dragon force mty-15.png");
    return fs.readFileSync(logoPath);
  } catch {
    return undefined;
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ message: "No autenticado." }, { status: 401 });
  }

  const exportData = await getAttendanceExportData();
  const logoBuffer = readLogoBuffer();
  const workbook = await buildAttendanceWorkbook(exportData.rows, logoBuffer);
  const workbookBuffer = await workbook.xlsx.writeBuffer();
  const bytes = workbookBuffer instanceof Uint8Array ? workbookBuffer : new Uint8Array(workbookBuffer);
  const filename = `asistencia-jugadores-${formatDateForFilename(new Date())}.xlsx`;

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
