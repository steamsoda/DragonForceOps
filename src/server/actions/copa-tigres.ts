"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPermissionContext } from "@/lib/auth/permissions";
import { isDebugWriteBlocked } from "@/lib/auth/debug-view";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { getReceiptForPrintAction } from "@/server/actions/receipts";
import type { CajaPaymentResult } from "@/server/actions/caja";

export type CopaTigresOption = { productId: string; name: string; paid: number; pending: number; chargeId?: string | null };

export async function getCopaTigresOptionsAction(enrollmentId: string): Promise<CopaTigresOption[]> {
  const ctx = await getPermissionContext();
  if (!ctx?.hasOperationalReadAccess) return [];
  // Existing ledger enforces the user's enrollment/campus boundary before admin reads.
  const ledger = await getEnrollmentLedger(enrollmentId);
  if (!ledger) return [];
  const admin = createAdminClient();
  const { data: products, error } = await admin.from("products")
    .select("id,name").eq("is_active", true).eq("copa_tigres_installments", true);
  if (error) throw new Error("No se pudo cargar Copa Tigres.");
  const { data: charges, error: chargeError } = await admin.from("charges")
    .select("id,product_id").eq("enrollment_id", enrollmentId)
    .eq("copa_tigres_installments", true).neq("status", "void");
  if (chargeError) throw new Error("No se pudo cargar el saldo de Copa Tigres.");
  return (products ?? []).map((product) => {
    const chargeId = charges?.find((charge) => charge.product_id === product.id)?.id;
    const charge = ledger.charges.find((row) => row.id === chargeId);
    const paid = charge?.allocatedAmount ?? 0;
    return { productId: product.id, name: product.name, paid, pending: 1250 - paid, chargeId: chargeId ?? null };
  });
}

export async function payCopaTigresAction(input: {
  enrollmentId: string; productId: string; amount: number; method: string; operatorCampusId: string; requestId: string;
}): Promise<CajaPaymentResult> {
  if (await isDebugWriteBlocked()) return { ok: false, error: "Solo lectura." };
  const ctx = await getPermissionContext();
  if (!ctx?.hasOperationalAccess) return { ok: false, error: "Sin permiso para cobrar." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pay_copa_tigres_installment", {
    p_enrollment: input.enrollmentId, p_product: input.productId, p_amount: input.amount,
    p_method: input.method, p_operator_campus: input.operatorCampusId, p_request: input.requestId,
  });
  if (error) {
    return { ok: false, error: "No se registro el pago. Revisa el saldo y el campus antes de intentar nuevamente." };
  }
  const paymentId = (data as { payment_id: string }).payment_id;
  for (const path of ["/caja", "/players", "/sports-signups", "/convocatorias", "/products"]) revalidatePath(path);
  const receipt = await getReceiptForPrintAction(paymentId);
  // Retrying this request reuses the same payment, even if receipt loading fails.
  if (!receipt.ok) return { ok: false, error: "Pago guardado. Reintenta para recuperar el recibo; no se duplicara el pago." };
  const { data: payment } = await supabase.from("payments").select("paid_at,method")
    .eq("id", paymentId).single();
  const { data: cashEntry } = await supabase.from("cash_session_entries").select("id")
    .eq("payment_id", paymentId).limit(1);
  return { ok: true, ...receipt.receipt, method: payment?.method ?? input.method,
    paidAt: payment?.paid_at ?? new Date().toISOString(),
    sessionWarning: input.method === "cash" && !cashEntry?.length, competitionRosterSyncPending: true };
}
