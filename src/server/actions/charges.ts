"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertDebugWritesAllowed } from "@/lib/auth/debug-view";
import { createClient } from "@/lib/supabase/server";
import { getEnrollmentChargeFormContext } from "@/lib/queries/billing";
import { parseChargeFormData } from "@/lib/validations/charge";
import { writeAuditLog } from "@/lib/audit";

function redirectWithError(enrollmentId: string, code: string): never {
  redirect(`/enrollments/${enrollmentId}/charges/new?err=${code}`);
}

export async function createChargeAction(enrollmentId: string, formData: FormData) {
  const parsed = parseChargeFormData(formData);
  if (!parsed) return redirectWithError(enrollmentId, "invalid_form");
  await assertDebugWritesAllowed(`/enrollments/${enrollmentId}/charges/new`);

  const supabase = await createClient();
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) return redirectWithError(enrollmentId, "unauthenticated");

  const context = await getEnrollmentChargeFormContext(enrollmentId);
  if (!context) return redirectWithError(enrollmentId, "enrollment_not_found");

  const chargeTypeExists = context.chargeTypes.some((type) => type.id === parsed.chargeTypeId);
  if (!chargeTypeExists) return redirectWithError(enrollmentId, "invalid_charge_type");

  const { error } = await supabase.from("charges").insert({
    enrollment_id: enrollmentId,
    charge_type_id: parsed.chargeTypeId,
    description: parsed.description,
    amount: parsed.amount,
    currency: context.enrollment.currency,
    status: "pending",
    due_date: parsed.dueDate,
    created_by: user.id
  });

  if (error) return redirectWithError(enrollmentId, "insert_failed");

  await writeAuditLog(supabase, {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    action: "charge.created",
    tableName: "charges",
    afterData: {
      enrollment_id: enrollmentId,
      charge_type_id: parsed.chargeTypeId,
      amount: parsed.amount,
      description: parsed.description
    }
  });

  revalidatePath(`/enrollments/${enrollmentId}/charges`);
  redirect(`/enrollments/${enrollmentId}/charges?ok=charge_created`);
}
