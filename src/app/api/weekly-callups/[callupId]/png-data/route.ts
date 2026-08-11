import { NextResponse } from "next/server";
import { getWeeklyCallupDetail } from "@/lib/queries/weekly-callups";
import { buildWeeklyCallupPngData } from "@/lib/weekly-callups/png-data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ callupId: string }> },
) {
  const { callupId } = await params;
  const callup = await getWeeklyCallupDetail(callupId);
  if (!callup) {
    return NextResponse.json({ error: "callup_not_found" }, { status: 404 });
  }

  return NextResponse.json(buildWeeklyCallupPngData(callup), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
