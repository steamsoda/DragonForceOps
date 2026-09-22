import { NextResponse } from "next/server";
import { z } from "zod";
import { getPermissionContext } from "@/lib/auth/permissions";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargeOperationReceiptSchema } from "@/lib/finance/charge-operation-receipt";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const fail = (status: number) => NextResponse.json({ error: "receipt_unavailable" }, { status, headers });
  const params = new URL(request.url).searchParams;
  const enrollmentId = params.get("enrollmentId"), chargeId = params.get("chargeId");
  if (!z.string().uuid().safeParse(enrollmentId).success || !z.string().uuid().safeParse(chargeId).success) return fail(400);
  const context = await getPermissionContext();
  if (!context || context.roleCodes.includes("porto_viewer") ||
    !(context.isDirector || context.isSuperAdmin || context.isFrontDesk || context.isDirectorReadOnly)) return fail(403);
  try {
    // The canonical ledger enforces normal campus or reviewed read-only scope.
    const ledger = await getEnrollmentLedger(enrollmentId!);
    if (!ledger || !ledger.charges.some(charge => charge.id === chargeId)) return fail(403);
    const { data, error } = await createAdminClient().from("charge_operation_receipts")
      .select("receipt").eq("charge_id", chargeId!).eq("enrollment_id", enrollmentId!).maybeSingle();
    if (error) return fail(503);
    if (!data) return fail(404);
    const receipt = chargeOperationReceiptSchema.parse(data.receipt);
    if (receipt.chargeId !== chargeId || receipt.enrollmentId !== enrollmentId) return fail(503);
    return NextResponse.json(receipt, { headers });
  } catch { return fail(503); }
}
