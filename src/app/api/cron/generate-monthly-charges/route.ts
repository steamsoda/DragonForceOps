import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateMonthlyChargesCore } from "@/lib/billing/generate-monthly-charges";

export async function GET(req: NextRequest) {
  // Vercel Cron automatically sends Authorization: Bearer {CRON_SECRET}
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cronUserId = process.env.CRON_USER_ID;
  if (!cronUserId) {
    return NextResponse.json({ error: "CRON_USER_ID env var not set" }, { status: 500 });
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const periodMonth = `${year}-${month}-01`;

  const supabase = createAdminClient();
  const result = await generateMonthlyChargesCore(supabase, periodMonth, cronUserId);

  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, periodMonth, ...result });
}
