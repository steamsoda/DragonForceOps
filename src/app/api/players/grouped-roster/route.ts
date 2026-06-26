import { NextResponse } from "next/server";
import { getPermissionContext } from "@/lib/auth/permissions";
import { getPlayerRosterGroupsData } from "@/lib/queries/player-roster-groups";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await getPermissionContext();
  if (!context) return NextResponse.json({ message: "No autenticado." }, { status: 401 });
  if (!context.hasPlayerRosterAccess) return NextResponse.json({ message: "Sin permisos." }, { status: 403 });

  const url = new URL(request.url);
  const gender = url.searchParams.get("gender") ?? undefined;
  const birthYear = url.searchParams.get("year") ?? undefined;
  const campusId = url.searchParams.get("campus") ?? undefined;

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

  const canEditTrainingGroups = context.hasAttendanceWriteAccess && (context.isDirector || context.isSportsDirector);

  return NextResponse.json(data ? { ...data, canEditTrainingGroups } : data, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
