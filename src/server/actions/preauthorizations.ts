"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
import { requireSuperAdminContext } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { directorReadOnlyEnabled } from "@/lib/auth/director-readonly-policy";

const base = "/admin/users?tab=preauthorizations";
const identity = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  revision: z.coerce.number().int().min(-1) });
const save = identity.extend({ role: z.enum(["porto_viewer", "director_readonly", "superadmin", "director_admin",
  "director_deportivo", "nutritionist", "attendance_admin", "admin_oficina", "front_desk"]),
  campus: z.union([z.string().uuid(), z.literal("")]) });
const errors = ["staff_domain_required", "invalid_campus", "preauthorization_changed", "existing_user_access"];

async function client() {
  await assertDebugWritesAllowed("/admin/users");
  await requireSuperAdminContext("/unauthorized");
  return createClient();
}
function finish(error: { message: string } | null, ok: string): never {
  if (error) redirect(`${base}&err=${errors.find(code => error.message.includes(code)) ?? "preauthorization_failed"}`);
  revalidatePath("/admin/users");
  redirect(`${base}&ok=${ok}`);
}
export async function savePreauthorization(form: FormData) {
  const db = await client();
  const parsed = save.safeParse(Object.fromEntries(form));
  if (!parsed.success || (parsed.data.role === "director_readonly" && !directorReadOnlyEnabled())) redirect(`${base}&err=invalid_form`);
  const { email, role, campus, revision } = parsed.data;
  const { error } = await db.rpc("save_email_preauthorization", { p_email: email, p_role: role, p_campus: campus || null, p_revision: revision });
  finish(error, "preauthorization_saved");
}
export async function revokePreauthorization(form: FormData) {
  const db = await client();
  const parsed = identity.safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`${base}&err=invalid_form`);
  const { error } = await db.rpc("revoke_email_preauthorization", { p_email: parsed.data.email, p_revision: parsed.data.revision });
  finish(error, "preauthorization_revoked");
}
