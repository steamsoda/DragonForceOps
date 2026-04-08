import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { findContryCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { ContryRegularizationPlayerPicker } from "@/components/billing/contry-regularization-player-picker";
import { ContryRegularizationAccountPanel } from "@/components/billing/contry-regularization-account-panel";

type SearchParams = Promise<{
  enrollment?: string;
  ok?: string;
  err?: string;
  payment?: string;
}>;

const errorMessages: Record<string, string> = {
  invalid_form: "Los datos del pago histórico no son válidos.",
  unauthenticated: "Tu sesión no es válida.",
  enrollment_not_found: "La cuenta seleccionada no pertenece a Contry o ya no está disponible.",
  no_pending_charges: "No hay cargos pendientes en esta cuenta.",
  payment_insert_failed: "No se pudo registrar el pago histórico.",
  allocation_insert_failed: "No se pudieron guardar las asignaciones del pago histórico.",
  paid_at_required: "Debes capturar la fecha y hora real del pago.",
  debug_read_only: "El modo de solo lectura bloquea capturas históricas.",
};

export default async function ContryRegularizationPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOperationalContext();
  const params = await searchParams;
  const selectedEnrollmentId = params.enrollment?.trim() ?? "";
  const campusAccess = await getOperationalCampusAccess();

  if (!campusAccess) redirect("/unauthorized");
  const contryCampus = findContryCampus(campusAccess.campuses);
  if (!contryCampus) redirect("/unauthorized");

  const selectedLedger = selectedEnrollmentId ? await getEnrollmentLedger(selectedEnrollmentId) : null;
  if (selectedEnrollmentId && (!selectedLedger || selectedLedger.enrollment.campusId !== contryCampus.id)) {
    notFound();
  }

  const successMessage =
    params.ok === "historical_payment_posted"
      ? "Pago histórico registrado correctamente para Contry."
      : params.ok === "payment_reassigned"
        ? "Cambio de concepto aplicado correctamente."
        : params.ok === "payment_refunded"
          ? "Reembolso registrado correctamente."
          : null;
  const errorMessage = params.err ? errorMessages[params.err] ?? "Ocurrió un error en la regularización." : null;

  return (
    <PageShell
      title="Regularización Contry"
      subtitle="Captura pagos históricos de Contry sin salir del flujo operativo y manteniendo la cuenta seleccionada a la vista."
      breadcrumbs={[{ label: "Regularización Contry" }]}
      wide
    >
      <div className="space-y-5">
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-semibold">Modo histórico Contry</p>
          <p>
            Esta pantalla registra pagos reales con fecha histórica. Los pagos quedan operativamente como Contry, no se
            imprimen automáticamente y no se vinculan a la sesión de caja abierta.
          </p>
        </div>

        {successMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
            <p>{successMessage}</p>
            {params.payment ? (
              <div className="mt-2 flex flex-wrap gap-3">
                <Link href={`/receipts?payment=${encodeURIComponent(params.payment)}`} className="font-medium text-portoBlue hover:underline">
                  Ver recibo guardado
                </Link>
                {selectedLedger ? (
                  <Link href={`/enrollments/${selectedLedger.enrollment.id}/charges`} className="font-medium text-portoBlue hover:underline">
                    Ver cuenta completa
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <ContryRegularizationPlayerPicker selectedEnrollmentId={selectedEnrollmentId} />

          <section className="space-y-4">
            {!selectedLedger ? (
              <div className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Selecciona una cuenta de Contry para revisar cargos pendientes, aplicar pagos históricos o agregar cargos.
              </div>
            ) : (
              <ContryRegularizationAccountPanel initialLedger={selectedLedger} contryCampusId={contryCampus.id} />
            )}
          </section>
        </div>
      </div>
    </PageShell>
  );
}
