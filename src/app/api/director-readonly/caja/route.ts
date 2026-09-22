import { NextResponse } from "next/server";
import { z } from "zod";
import { getPermissionContext } from "@/lib/auth/permissions";
import { directorReadOnlyEnabled } from "@/lib/auth/director-readonly-policy";
import { getEnrollmentForCajaAction, getProductsForCajaAction } from "@/server/actions/caja";
import { loadExplicitCredit } from "@/server/actions/explicit-credit";
import { loadPendingOperations } from "@/server/actions/operation-resolution";
import { getCopaTigresOptionsAction } from "@/server/actions/copa-tigres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };
const filters = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("meta") }).strict(),
  z.object({ mode: z.literal("search"), q: z.string().trim().min(2).max(100) }).strict(),
  z.object({ mode: z.literal("year"), campus: z.string().uuid(), year: z.coerce.number().int().min(1900).max(2100) }).strict(),
  z.object({ mode: z.literal("account"), enrollmentId: z.string().uuid() }).strict(),
  z.object({ mode: z.literal("credit"), enrollmentId: z.string().uuid() }).strict(),
  z.object({ mode: z.literal("operations"), enrollmentId: z.string().uuid() }).strict(),
  z.object({ mode: z.literal("installments"), enrollmentId: z.string().uuid() }).strict(),
  z.object({ mode: z.literal("products"), enrollmentId: z.string().uuid(), full: z.enum(["true", "false"]) }).strict(),
]);

export async function GET(request: Request) {
  const context = await getPermissionContext();
  if (!context) return NextResponse.json({ error: "No autenticado." }, { status: 401, headers });
  if (!context.isDirectorReadOnly || !directorReadOnlyEnabled()) return NextResponse.json({ error: "Sin permisos." }, { status: 403, headers });
  const params = new URL(request.url).searchParams;
  const parsed = filters.safeParse(Object.fromEntries(params));
  if (!parsed.success || new Set(params.keys()).size !== params.size) return NextResponse.json({ error: "Filtros invalidos." }, { status: 400, headers });
  try {
    const { data: valid, error: authError } = await context.supabase.rpc("is_director_readonly");
    if (authError || valid !== true) return NextResponse.json({ error: "Sin permisos." }, { status: 403, headers });
    const f = parsed.data;
    if (f.mode === "credit") return NextResponse.json(await loadExplicitCredit(f.enrollmentId), { headers });
    if (f.mode === "operations") return NextResponse.json(await loadPendingOperations(f.enrollmentId), { headers });
    if (f.mode === "installments") return NextResponse.json(await getCopaTigresOptionsAction(f.enrollmentId), { headers });
    if (f.mode === "account") {
      const data = await getEnrollmentForCajaAction(f.enrollmentId);
      return NextResponse.json(data, { status: data ? 200 : 404, headers });
    }
    if (f.mode === "products") return NextResponse.json(await getProductsForCajaAction(f.enrollmentId, f.full === "true"), { headers });
    if (f.mode === "meta") {
      const { data, error } = await context.supabase.rpc("director_caja_years");
      if (error) throw error;
      const campuses = context.campusAccess?.campuses.map(({ id, name }) => ({ id, name })) ?? [];
      const birthYearsByCampus: Record<string, number[]> = {};
      for (const row of data ?? []) if (campuses.some(c => c.id === row.campus_id)) (birthYearsByCampus[row.campus_id] ??= []).push(row.birth_year);
      return NextResponse.json({ campuses, birthYearsByCampus }, { headers });
    }
    if (f.mode === "year" && !context.campusAccess?.campusIds.includes(f.campus)) return NextResponse.json({ error: "Sin permisos." }, { status: 403, headers });
    const { data, error } = await context.supabase.rpc("director_caja_players", {
      p_search: f.mode === "search" ? f.q : null,
      p_campus: f.mode === "year" ? f.campus : null,
      p_year: f.mode === "year" ? f.year : null,
    });
    if (error) throw error;
    if (f.mode === "year" && (data?.length ?? 0) >= 1000) throw new Error("Cohort exceeds safe result limit");
    return NextResponse.json((data ?? []).map((row: Record<string, unknown>) => ({
      playerId: row.player_id, playerName: row.player_name, birthYear: row.birth_year,
      enrollmentId: row.enrollment_id, campusName: row.campus_name, balance: Number(row.balance),
      teamName: row.team_name, coachName: row.coach_name,
    })), { headers });
  } catch {
    return NextResponse.json({ error: "No se pudo cargar Caja. Intenta nuevamente." }, { status: 503, headers });
  }
}
