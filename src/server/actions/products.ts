"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";

// Ad-hoc charge type codes that can be assigned to products
const AD_HOC_CODES = ["uniform_training", "uniform_game", "tournament", "cup", "trip", "event"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .trim();
}

async function assertDirectorAdmin() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data } = await supabase.rpc("is_director_admin");
  if (!data) return null;
  return { supabase, user };
}

// ── Create category ───────────────────────────────────────────────────────────

export async function createCategoryAction(formData: FormData): Promise<void> {
  const auth = await assertDirectorAdmin();
  if (!auth) redirect("/products?err=unauthenticated");

  const name = formData.get("name")?.toString().trim() ?? "";
  if (!name) redirect("/products?err=invalid_form");

  const slug = slugify(name);
  if (!slug) redirect("/products?err=invalid_form");

  const { supabase, user } = auth;

  const { error } = await supabase
    .from("product_categories")
    .insert({ name, slug });

  if (error) redirect("/products?err=category_create_failed");

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "product_category.created",
    tableName: "product_categories",
    afterData: { name, slug }
  });

  revalidatePath("/products");
  redirect("/products");
}

// ── Create product ────────────────────────────────────────────────────────────

export async function createProductAction(formData: FormData): Promise<void> {
  const auth = await assertDirectorAdmin();
  if (!auth) redirect("/products?err=unauthenticated");

  const name = formData.get("name")?.toString().trim() ?? "";
  const categoryId = formData.get("categoryId")?.toString().trim() ?? "";
  const chargeTypeId = formData.get("chargeTypeId")?.toString().trim() ?? "";
  const defaultAmountRaw = formData.get("defaultAmount")?.toString().trim() ?? "";
  const defaultAmount = defaultAmountRaw ? parseFloat(defaultAmountRaw) : null;
  const hasSizes = formData.get("hasSizes") === "1";

  if (!name || !categoryId || !chargeTypeId) redirect("/products?err=invalid_form");
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
    .insert({ name, category_id: categoryId, charge_type_id: chargeTypeId, default_amount: defaultAmount, has_sizes: hasSizes })
    .select("id")
    .single<{ id: string }>();

  if (error || !product) redirect("/products?err=product_create_failed");

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "product.created",
    tableName: "products",
    recordId: product.id,
    afterData: { name, category_id: categoryId, charge_type_id: chargeTypeId, default_amount: defaultAmount, has_sizes: hasSizes }
  });

  revalidatePath("/products");
  redirect("/products");
}

// ── Update product ────────────────────────────────────────────────────────────

export async function updateProductAction(productId: string, formData: FormData): Promise<void> {
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

// ── Get ad-hoc charge types (for create form) ─────────────────────────────────

export type AdHocChargeType = { id: string; code: string; name: string };

export async function getAdHocChargeTypesAction(): Promise<AdHocChargeType[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("charge_types")
    .select("id, code, name")
    .in("code", AD_HOC_CODES)
    .eq("is_active", true)
    .order("name")
    .returns<AdHocChargeType[]>();

  return data ?? [];
}
