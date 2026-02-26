import { PageShell } from "@/components/ui/page-shell";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getEnrollmentChargeFormContext } from "@/lib/queries/billing";
import { ChargeCreateForm } from "@/components/billing/charge-create-form";
import { createChargeAction } from "@/server/actions/charges";

const errorMessages: Record<string, string> = {
  invalid_form: "Los datos del cargo son invalidos. Revisa tipo, monto y descripcion.",
  unauthenticated: "Tu sesion no es valida. Vuelve a iniciar sesion.",
  enrollment_not_found: "No se encontro la inscripcion.",
  invalid_charge_type: "El tipo de cargo seleccionado no es valido.",
  insert_failed: "No se pudo guardar el cargo. Intenta de nuevo."
};

export default async function ChargeCreatePage({
  params,
  searchParams
}: {
  params: Promise<{ enrollmentId: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { enrollmentId } = await params;
  const query = await searchParams;
  const context = await getEnrollmentChargeFormContext(enrollmentId);

  if (!context) notFound();

  const submit = createChargeAction.bind(null, enrollmentId);
  const subtitle = `${context.enrollment.playerName} | ${context.enrollment.campusName} (${context.enrollment.campusCode})`;
  const errorMessage = query.err ? errorMessages[query.err] ?? "Ocurrio un error al crear el cargo." : null;

  return (
    <PageShell title="Crear cargo" subtitle={subtitle}>
      <div className="space-y-4">
        {errorMessage ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{errorMessage}</div>
        ) : null}
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/enrollments/${enrollmentId}/charges`} className="text-portoBlue hover:underline">
            Volver a cargos y cuenta
          </Link>
        </div>
        <ChargeCreateForm chargeTypes={context.chargeTypes} action={submit} />
      </div>
    </PageShell>
  );
}
