import { NextResponse } from "next/server";
import { getPermissionContext } from "@/lib/auth/permissions";
import { directorReadOnlyEnabled } from "@/lib/auth/director-readonly-policy";
import { searchLikelyPlayersForIntakeAction, searchReturningPlayersForIntakeAction } from "@/server/actions/intake";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const context = await getPermissionContext();
  if (!context?.isDirectorReadOnly || !directorReadOnlyEnabled()) return NextResponse.json({}, { status: 403 });
  const role = await context.supabase.rpc("is_director_readonly");
  if (role.error || role.data !== true) return NextResponse.json({}, { status: 403 });
  const params = new URL(request.url).searchParams;
  if (new Set(params.keys()).size !== params.size || [...params.values()].some(value => value.length > 150)) return NextResponse.json({}, { status: 400 });
  let result;
  if (params.get("mode") === "returning") result = await searchReturningPlayersForIntakeAction(params.get("q") ?? "");
  else if (params.get("mode") === "matches") result = await searchLikelyPlayersForIntakeAction({
    firstName: params.get("firstName") ?? "", lastName: params.get("lastName") ?? "", birthDate: params.get("birthDate"),
  });
  else return NextResponse.json({}, { status: 400 });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" } });
}
