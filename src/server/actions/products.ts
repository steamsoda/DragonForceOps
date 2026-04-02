"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
import { requireDirectorContext } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";

// Ad-hoc charge type codes that can be assigned to products
const AD_HOC_CODES = ["uniform_training", "uniform_game", "tournament", "cup", "trip", "event"];

// ── Auth guard ─────────────────────────────────────────────────────────────────

async function assertDirectorAdmin() {
  try {
    return await requireDirectorContext("/unauthorized");
  } catch {
    return null;
  }
}

// ── Create product ────────────────────────────────────────────────────────────

export async function createProductAction(formData: FormData): Promise<void> {
  await assertDebugWritesAllowed("/products");
  const auth = await assertDirectorAdmin();
  if (!auth) redirect("/products?err=unauthenticated");

  const name = formData.get("name")?.toString().trim() ?? "";
  const chargeTypeId = formData.get("chargeTypeId")?.toString().trim() ?? "";
  const defaultAmountRaw = formData.get("defaultAmount")?.toString().trim() ?? "";
  const defaultAmount = defaultAmountRaw ? parseFloat(defaultAmountRaw) : null;
  const hasSizes = formData.get("hasSizes") === "1";

  if (!name || !chargeTypeId) redirect("/products?err=invalid_form");
  if (defaultAmount !== null && (isNaN(defaultAmount) || defaultAmount <= 0)) {
    redirect("/products?err=invalid_amount");
  }

  const { supabase, user } = auth;

  // Verify the charge type is an allowed ad-hoc type
  const { data: ct } = await supabase
    .from("charge_types")
    .select("id, code")
    .eq("id", chargeTypeId)
    .eq("is_active", true)
    .in("code", AD_HOC_CODES)
    .maybeSingle();

  if (!ct) redirect("/products?err=invalid_charge_type");

  const { data: product, error } = await supabase
    .from("products")
    .insert({ name, charge_type_id: chargeTypeId, default_amount: defaultAmount, has_sizes: hasSizes })
    .select("id")
    .single<{ id: string }>();

  if (error || !product) redirect("/products?err=product_create_failed");

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "product.created",
    tableName: "products",
    recordId: product.id,
    afterData: { name, charge_type_id: chargeTypeId, default_amount: defaultAmount, has_sizes: hasSizes }
  });

  revalidatePath("/products");
  redirect("/products");
}

// ── Update product ────────────────────────────────────────────────────────────

export async function updateProductAction(productId: string, formData: FormData): Promise<void> {
  await assertDebugWritesAllowed(`/products/${productId}`);
  const auth = await assertDirectorAdmin();
  if (!auth) redirect(`/products/${productId}?err=unauthenticated`);

  const name = formData.get("name")?.toString().trim() ?? "";
  const defaultAmountRaw = formData.get("defaultAmount")?.toString().trim() ?? "";
  const defaultAmount = defaultAmountRaw ? parseFloat(defaultAmountRaw) : null;
  const isActive = formData.get("isActive") === "1";
  const hasSizes = formData.get("hasSizes") === "1";

  if (!name) redirect(`/products/${productId}?err=invalid_form`);
  if (defaultAmount !== null && (isNaN(defaultAmount) || defaultAmount <= 0)) {
    redirect(`/products/${productId}?err=invalid_amount`);
  }

  const { supabase, user } = auth;

  const { error } = await supabase
    .from("products")
    .update({ name, default_amount: defaultAmount, is_active: isActive, has_sizes: hasSizes })
    .eq("id", productId);

  if (error) redirect(`/products/${productId}?err=update_failed`);

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "product.updated",
    tableName: "products",
    recordId: productId,
    afterData: { name, default_amount: defaultAmount, is_active: isActive, has_sizes: hasSizes }
  });

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}

// ── Delete product ────────────────────────────────────────────────────────────

export async function deleteProductAction(productId: string): Promise<void> {
  await assertDebugWritesAllowed(`/products/${productId}`);
  const auth = await assertDirectorAdmin();
  if (!auth) redirect(`/products/${productId}?err=unauthenticated`);

  const { supabase, user } = auth;

  // Block deletion if any non-void charges reference this product
  const { count, error: countError } = await supabase
    .from("charges")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .neq("status", "void");

  if (countError) redirect(`/products/${productId}?err=delete_failed`);
  if (count && count > 0) redirect(`/products/${productId}?err=has_charges`);

  const { data: product } = await supabase
    .from("products")
    .select("name")
    .eq("id", productId)
    .maybeSingle<{ name: string }>();

  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) redirect(`/products/${productId}?err=delete_failed`);

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "product.deleted",
    tableName: "products",
    recordId: productId,
    afterData: { name: product?.name ?? productId }
  });

  revalidatePath("/products");
  redirect("/products?ok=product_deleted");
}

// ── Get ad-hoc charge types (for create form) ─────────────────────────────────

export type AdHocChargeType = { id: string; code: string; name: string };

export async function getAdHocChargeTypesAction(): Promise<AdHocChargeType[]> {
  const auth = await assertDirectorAdmin();
  if (!auth) return [];
  const { supabase } = auth;

  const { data } = await supabase
    .from("charge_types")
    .select("id, code, name")
    .in("code", AD_HOC_CODES)
    .eq("is_active", true)
    .order("name")
    .returns<AdHocChargeType[]>();

  return data ?? [];
}
