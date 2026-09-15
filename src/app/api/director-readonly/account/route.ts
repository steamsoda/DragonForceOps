import { NextResponse } from "next/server";
import { z } from "zod";
import { getPermissionContext } from "@/lib/auth/permissions";
import { directorReadOnlyEnabled } from "@/lib/auth/director-readonly-policy";
import { getEnrollmentLedger } from "@/lib/queries/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };

export async function GET(request: Request) {
  const context = await getPermissionContext();
  if (!context) return NextResponse.json({ message: "No autenticado." }, { status: 401, headers });
  if (!context.isDirectorReadOnly || !directorReadOnlyEnabled()) {
    return NextResponse.json({ message: "Sin permisos." }, { status: 403, headers });
  }
  const params = new URL(request.url).searchParams;
  const enrollmentId = z.string().uuid().safeParse(params.get("enrollmentId"));
  if (!enrollmentId.success || params.size !== 1) {
    return NextResponse.json({ message: "Selecciona una inscripcion." }, { status: 400, headers });
  }
  try {
    const ledger = await getEnrollmentLedger(enrollmentId.data, { strictReadErrors: true });
    if (!ledger) return NextResponse.json({ message: "Cuenta no disponible." }, { status: 404, headers });
    return NextResponse.json(ledger, { headers });
  } catch {
    return NextResponse.json({ message: "No se pudo cargar la cuenta." }, { status: 503, headers });
  }
}
