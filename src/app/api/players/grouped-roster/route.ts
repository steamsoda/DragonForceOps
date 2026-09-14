import { NextResponse } from "next/server";
import { getPermissionContext } from "@/lib/auth/permissions";
import { getPlayerRosterGroupsData } from "@/lib/queries/player-roster-groups";
import { createAdminClient } from "@/lib/supabase/admin";
import { readDirectorRoster } from "@/app/(protected)/players/director-readonly-roster";

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

  if (context.isDirectorReadOnly) {
    const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
    if (context.canViewFinancials !== false) return NextResponse.json({ message: "Sin permisos." }, { status: 403, headers });
    if ((gender && gender !== "male" && gender !== "female")
      || (birthYear && !/^(19\d{2}|20\d{2}|2100)$/.test(birthYear))
      || (campusId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(campusId))) {
      return NextResponse.json({ message: "Filtros invalidos." }, { status: 400, headers });
    }
    try {
      const data = await readDirectorRoster(context, { campusId, gender, birthYear });
      return NextResponse.json(data, { headers });
    } catch {
      return NextResponse.json({ message: "No se pudo cargar el roster." }, { status: 503, headers });
    }
  }

  const data = await getPlayerRosterGroupsData(
    {
      campusId,
      gender,
      birthYear,
    },
    {
      campusAccess: context.campusAccess,
      supabase: createAdminClient(),
      recentAttendanceLimit: 5,
    },
  );

  const canEditTrainingGroups = context.hasAttendanceWriteAccess && (context.isDirector || context.isSportsDirector);

  return NextResponse.json(data ? { ...data, canEditTrainingGroups } : data, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
