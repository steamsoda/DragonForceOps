import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createCheckoutTrace, type CheckoutTrace } from "@/lib/perf/checkout-timing";
import { getPermissionContext, canAccessEnrollmentRecord } from "@/lib/auth/permissions";
import { isDebugWriteBlocked } from "@/lib/auth/debug-view";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseMonterreyDateTimeInput } from "@/lib/time";
import { parseExplicitCheckoutCommand, validateExplicitCheckout, ExplicitCheckoutError,
  type ExplicitCheckoutSnapshot, type ExplicitCheckoutReceipt } from "@/lib/finance/explicit-checkout";

type Context = NonNullable<Awaited<ReturnType<typeof getPermissionContext>>>;
export type PreparedExplicitCart = { snapshot: ExplicitCheckoutSnapshot; charges: Array<Record<string, unknown> & { id: string; key: string }> };
export type ExplicitCartResolver = (enrollmentId: string, form: FormData, context: Context, trace?: CheckoutTrace) => Promise<PreparedExplicitCart>;
export type ExplicitCartSaveResult = { ok: true; receipt: ExplicitCheckoutReceipt; recovered: boolean } | { ok: false; error: string; uncertain?: boolean };

async function authorized(enrollmentId: string) {
  if (!z.string().uuid().safeParse(enrollmentId).success || await isDebugWriteBlocked()) return null;
  const context = await getPermissionContext();
  if (!context || context.isDirectorReadOnly || context.roleCodes.includes("porto_viewer")
    || !(context.isDirector || context.isFrontDesk) || !(await canAccessEnrollmentRecord(enrollmentId, context))) return null;
  return context;
}

export async function getExplicitCartRecoveryActor(enrollmentId: string) {
  return (await authorized(enrollmentId))?.user.id ?? null;
}

export async function getExplicitCartRecoveryState(enrollmentId: string) {
  const context = await authorized(enrollmentId);
  if (!context) return null;
  const { data, error } = await createAdminClient().from("explicit_cart_intents").select("actor_id,recovery")
    .eq("enrollment_id", enrollmentId).eq("state", "pending").maybeSingle();
  if (error) throw Error("checkout_recovery_unavailable");
  return { actorId: context.user.id, blocked: !!data && data.actor_id !== context.user.id,
    recovery: data?.actor_id === context.user.id ? data.recovery as { fields: [string, string][]; snapshot: ExplicitCheckoutSnapshot } : null };
}

export async function acknowledgeExplicitCart(enrollmentId: string, requestId: string, traceId?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const trace = createCheckoutTrace(traceId);
  try {
    const context = await trace.run("authorization", () => authorized(enrollmentId));
    if (!context || !z.string().uuid().safeParse(requestId).success) return { ok: false, error: "forbidden" };
    const admin = createAdminClient();
    const lookup = () => admin.from("explicit_cart_intents").select("id,state").eq("id", requestId)
      .eq("enrollment_id", enrollmentId).eq("actor_id", context.user.id).maybeSingle();
    const { data, error } = await trace.run("intent_lookup", async () => await lookup());
    if (error || !data) return { ok: false, error: "acknowledgement_unconfirmed" };
    const result = await trace.run("acknowledge", async () => await admin.rpc("acknowledge_explicit_cart", { p_actor: context.user.id, p_request: requestId }));
    if (result.error) return { ok: false, error: "acknowledgement_unconfirmed" };
    const verified = await trace.run("ack_verify", async () => await lookup());
    return !verified.error && verified.data?.state === "completed" ? { ok: true } : { ok: false, error: "acknowledgement_unconfirmed" };
  } catch { return { ok: false, error: "acknowledgement_unconfirmed" }; }
}

export async function reviewExplicitCart(enrollmentId: string, form: FormData, resolve: ExplicitCartResolver) {
  const trace = createCheckoutTrace(form.get("diagnosticTraceId"));
  const context = await trace.run("authorization", () => authorized(enrollmentId));
  if (!context) return { ok: false as const, error: "forbidden" };
  try { return { ok: true as const, snapshot: (await trace.run("resolve", () => resolve(enrollmentId, form, context, trace))).snapshot }; }
  catch (error) { return { ok: false as const, error: error instanceof ExplicitCheckoutError ? error.code : "checkout_review_failed" }; }
}

// Resolve on the server; no prepared price, actor or source credit comes from the browser.
export async function saveExplicitCart(enrollmentId: string, form: FormData, resolve: ExplicitCartResolver): Promise<ExplicitCartSaveResult> {
  const trace = createCheckoutTrace(form.get("diagnosticTraceId"));
  const context = await trace.run("authorization", () => authorized(enrollmentId));
  if (!context) return { ok: false, error: "forbidden" };
  if (form.get("checkoutActorId") !== context.user.id) return { ok: false, error: "forbidden" };
  let command;
  try { command = parseExplicitCheckoutCommand(JSON.parse(String(form.get("explicitCommand") ?? ""))); }
  catch { return { ok: false, error: "invalid_checkout" }; }
  if (command.enrollmentId !== enrollmentId) return { ok: false, error: "invalid_checkout" };
  const campus = String(form.get("operatorCampusId") ?? "");
  if (!z.string().uuid().safeParse(campus).success) return { ok: false, error: "invalid_checkout" };
  const paidRaw = String(form.get("paidAt") ?? "");
  const paidAt = paidRaw ? parseMonterreyDateTimeInput(paidRaw) : null;
  if (paidRaw && !paidAt) return { ok: false, error: "invalid_checkout" };
  const fields = ["operatorCampusId", "paidAt", "notes", "cartItems", "cartKeys", "targetChargeIds"];
  const fingerprint = createHash("sha256").update(JSON.stringify([command, ...fields.map(key => [key, String(form.get(key) ?? "")])])).digest("hex");
  const admin = createAdminClient();
  let payload: Record<string, unknown>;
  let recovered = false;
  try {
    const { data: prior, error } = await trace.run("prior_lookup", async () => await admin.from("explicit_cart_checkouts").select("actor_id,enrollment_id,campus_id,payload")
      .eq("id", command.requestId).maybeSingle());
    if (error) return { ok: false, error: "checkout_uncertain", uncertain: true };
    if (prior) {
      recovered = true;
      if (prior.actor_id !== context.user.id || prior.enrollment_id !== enrollmentId || prior.campus_id !== campus
        || prior.payload.clientFingerprint !== fingerprint) return { ok: false, error: "checkout_request_conflict" };
      // Recheck current SQL authorization, but never regenerate a completed cart.
      payload = prior.payload;
    } else {
      const { data: intent, error: intentError } = await trace.run("intent_lookup", async () => await admin.from("explicit_cart_intents")
        .select("actor_id,enrollment_id,campus_id,payload,recovery,state").eq("id", command.requestId).maybeSingle());
      if (intentError) return { ok: false, error: "checkout_uncertain", uncertain: true };
      let recovery;
      if (intent) {
        recovered = true;
        if (intent.actor_id !== context.user.id || intent.enrollment_id !== enrollmentId || intent.campus_id !== campus
          || intent.payload.clientFingerprint !== fingerprint) return { ok: false, error: "checkout_request_conflict" };
        if (intent.state === "failed") return { ok: false, error: "checkout_changed" };
        payload = intent.payload; recovery = intent.recovery;
      } else {
        const prepared = await trace.run("resolve", () => resolve(enrollmentId, form, context, trace));
        const validated = validateExplicitCheckout(prepared.snapshot, command);
        payload = { command: validated.command, charges: prepared.charges, paidAt,
          notes: String(form.get("notes") ?? "").trim() || null, clientFingerprint: fingerprint };
        const recoveryFields = [...fields, "explicitCommand", "checkoutActorId", "method", "method2", "amount", "amount2"];
        recovery = { snapshot: prepared.snapshot, fields: recoveryFields.filter(key => form.has(key)).map(key => [key, String(form.get(key))]) };
      }
      const staged = await trace.run("stage", async () => await admin.rpc("stage_explicit_cart", { p_actor: context.user.id, p_enrollment: enrollmentId,
        p_campus: campus, p_request: command.requestId, p_payload: payload, p_recovery: recovery }));
      if (staged.error) {
        const known = ["checkout_in_progress", "checkout_changed", "checkout_request_conflict", "forbidden", "enrollment_inactive"];
        return known.includes(staged.error.message) ? { ok: false, error: staged.error.message }
          : { ok: false, error: "checkout_uncertain", uncertain: true };
      }
    }
  } catch (error) {
    return error instanceof ExplicitCheckoutError ? { ok: false, error: error.code }
      : { ok: false, error: "checkout_uncertain", uncertain: true };
  }
  try {
    const { data, error } = await trace.run("checkout", async () => await admin.rpc("checkout_explicit_cart", {
      p_actor: context.user.id, p_enrollment: enrollmentId, p_campus: campus, p_request: command.requestId, p_payload: payload,
    }));
    if (error) {
      const known = ["forbidden", "enrollment_inactive", "invalid_campus", "checkout_changed", "invalid_checkout",
        "checkout_request_conflict", "invalid_credit_selection", "credit_source_requires_review", "copa_tigres_no_credit",
        "invalid_copa_installment", "payment_total_mismatch", "invalid_payment_date", "prior_month_arrears"];
      if (known.includes(error.message) && !["forbidden", "checkout_request_conflict"].includes(error.message)) {
        const closed = await admin.rpc("fail_explicit_cart_intent", { p_actor: context.user.id, p_request: command.requestId });
        if (closed.error) return { ok: false, error: "checkout_uncertain", uncertain: true };
      }
      return known.includes(error.message) ? { ok: false, error: error.message } : { ok: false, error: "checkout_uncertain", uncertain: true };
    }
    if (!data || data.operationId !== command.requestId) return { ok: false, error: "checkout_uncertain", uncertain: true };
    await trace.run("invalidate", async () => { for (const path of ["/caja", "/players", "/sports-signups", "/convocatorias", "/receipts", "/products", "/uniforms", "/pending", "/reports/corte-diario"]) {
      try { revalidatePath(path); } catch { /* A cache failure cannot undo a saved payment. */ }
    } });
    return { ok: true, receipt: data as ExplicitCheckoutReceipt, recovered };
  } catch { return { ok: false, error: "checkout_uncertain", uncertain: true }; }
}
