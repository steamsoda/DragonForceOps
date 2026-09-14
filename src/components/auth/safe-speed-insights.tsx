"use client";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";

export function SafeSpeedInsights() {
  const path = usePathname();
  if (path === "/" || path?.startsWith("/auth/") || path === "/login") return null;
  return <SpeedInsights beforeSend={event => {
    const url = new URL(event.url);
    return url.pathname.startsWith("/auth/") || url.searchParams.has("token_hash") || url.searchParams.has("code") ? null : event;
  }} />;
}
