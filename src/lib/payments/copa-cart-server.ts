import "server-only";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { getPermissionContext } from "@/lib/auth/permissions";
import { parsePaymentFormData } from "@/lib/validations/payment";
import { parseMonterreyDateTimeInput } from "@/lib/time";
import { getReceiptForPrintAction } from "@/server/actions/receipts";
import type { CajaPaymentResult } from "@/server/actions/caja";

type Context = NonNullable<Awaited<ReturnType<typeof getPermissionContext>>>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requestInfo(form: FormData) {
  const id = String(form.get("checkoutRequestId") ?? "");
  const fields = ["amount", "method", "amount2", "method2", "operatorCampusId", "paidAt", "notes", "cartItems", "targetChargeIds"];
  const fingerprint = createHash("sha256").update(JSON.stringify(fields.map((key) => [key, String(form.get(key) ?? "")]))).digest("hex");
  return { id, fingerprint };
}

async function receiptResult(paymentId: string): Promise<CajaPaymentResult> {
  const receipt = await getReceiptForPrintAction(paymentId);
  if (!receipt.ok) return { ok: false, error: "copa_cart_receipt" };
  const { data, error } = await createAdminClient().from("copa_cart_checkouts")
    .select("receipt").contains("payment_ids", [paymentId]).single();
  if (error || !data) return { ok: false, error: "copa_cart_receipt" };
  return { ok: true, ...receipt.receipt, paidAt: data.receipt.paidAt,
    sessionWarning: data.receipt.sessionWarning, competitionRosterSyncPending: true };
}

export async function resumeCopaCartCheckout(enrollmentId: string, form: FormData, context: Context): Promise<CajaPaymentResult | null> {
  const { id, fingerprint } = requestInfo(form);
  if (!uuid.test(id)) return { ok: false, error: "invalid_form" };
  const { data, error } = await createAdminClient().from("copa_cart_checkouts")
    .select("enrollment_id,actor_id,fingerprint,payment_ids").eq("id", id).maybeSingle();
  if (error) return { ok: false, error: "copa_cart_failed" };
  if (!data) return null;
  if (data.enrollment_id !== enrollmentId || data.actor_id !== context.user.id || data.fingerprint !== fingerprint) {
    return { ok: false, error: "copa_cart_changed" };
  }
  return receiptResult(data.payment_ids[0]);
}

export async function completeCopaCartCheckout(
  enrollmentId: string, form: FormData, context: Context,
  copa: { productId: string; amount: number }, charges: Array<Record<string, unknown>>,
): Promise<CajaPaymentResult> {
  const parsed = parsePaymentFormData(form);
  const { id, fingerprint } = requestInfo(form);
  if (!parsed?.operatorCampusId || !uuid.test(id)) return { ok: false, error: "invalid_form" };
  // Invalid split data must not silently become a single-method checkout.
  if (form.get("amount2") && !parsed.split) return { ok: false, error: "invalid_form" };
  const paidAt = parsed.paidAtRaw ? parseMonterreyDateTimeInput(parsed.paidAtRaw) : null;
  if (parsed.paidAtRaw && !paidAt) return { ok: false, error: "invalid_form" };
  const { data, error } = await createAdminClient().rpc("checkout_copa_cart", {
    p_actor: context.user.id, p_enrollment: enrollmentId, p_campus: parsed.operatorCampusId,
    p_request: id, p_fingerprint: fingerprint,
    p_payload: { copa, charges, targets: parsed.targetChargeIds,
      payments: [{ amount: parsed.amount, method: parsed.method }, ...(parsed.split ? [parsed.split] : [])],
      paidAt, notes: parsed.notes },
  });
  if (error) {
    console.error("[copa-cart] transaction failed", { code: error.code, message: error.message });
    return { ok: false, error: error.message.includes("changed") || error.message.includes("conflict") ? "copa_cart_changed" : "copa_cart_failed" };
  }
  for (const path of ["/caja", "/players", "/sports-signups", "/convocatorias", "/receipts", "/products", "/uniforms", "/pending", "/reports/corte-diario"]) revalidatePath(path);
  return receiptResult(data.payment_id);
}
