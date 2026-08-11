import { NextRequest, NextResponse } from "next/server";
import {
  clearDebugViewCookies,
  getDebugViewContext,
  isPreviewDebugEnabled,
} from "@/lib/auth/debug-view";

function getSafeNextPath(request: NextRequest) {
  const requestedPath = request.nextUrl.searchParams.get("next")?.trim();
  if (!requestedPath || !requestedPath.startsWith("/") || requestedPath.startsWith("//")) {
    return "/dashboard";
  }
  return requestedPath;
}

export async function GET(request: NextRequest) {
  if (!isPreviewDebugEnabled()) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  const context = await getDebugViewContext();
  if (!context) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (!context.canManage) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  await clearDebugViewCookies();
  return NextResponse.redirect(new URL(getSafeNextPath(request), request.url));
}
