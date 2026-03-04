"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateMonthlyChargesCore } from "@/lib/billing/generate-monthly-charges";

export async function generateMonthlyTuitionAction(formData: FormData) {
  const periodMonthRaw = String(formData.get("period_month") ?? "").trim();

  if (!/^\d{4}-\d{2}$/.test(periodMonthRaw)) {
    redirect("/admin/mensualidades?err=invalid_month");
  }

  const [yearStr, monthStr] = periodMonthRaw.split("-");
  const periodMonth = `${yearStr}-${monthStr}-01`;

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();
  if (userError || !user) redirect("/admin/mensualidades?err=unauthenticated");

  const result = await generateMonthlyChargesCore(supabase, periodMonth, user!.id);

  if (result.error) redirect(`/admin/mensualidades?err=${result.error}`);
  redirect(`/admin/mensualidades?ok=1&created=${result.created}&skipped=${result.skipped}`);
}
