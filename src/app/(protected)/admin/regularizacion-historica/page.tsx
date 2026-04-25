import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requireSuperAdminContext } from "@/lib/auth/permissions";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { voidHistoricalRegularizationChargeAction } from "@/server/actions/billing";
import { ContryRegularizationPlayerPicker } from "@/components/billing/contry-regularization-player-picker";
import { ContryRegularizationAccountPanel } from "@/components/billing/contry-regularization-account-panel";

type SearchParams = Promise<{
  campus?: string;
  enrollment?: string;
  ok?: string;
  err?: string;
  payment?: string;
}>;

const errorMessages: Record<string, string> = {
  invalid_form: "Los datos del pago historico no son validos.",
  unauthenticated: "Tu sesion no es valida.",
  enrollment_not_found: "La cuenta seleccionada ya no esta disponible para regularizacion historica.",
  no_pending_charges: "No hay cargos pendientes en esta cuenta.",
  payment_insert_failed: "No se pudo registrar el pago historico.",
  allocation_insert_failed: "No se pudieron guardar las asignaciones del pago historico.",
  paid_at_required: "Debes capturar la fecha y hora real del pago.",
  void_reason_required: "Debes capturar el motivo de anulacion.",
  charge_not_found: "El cargo ya no esta disponible para anularse en esta cuenta.",
  void_failed: "No se pudo anular el cargo.",
  debug_read_only: "El modo de solo lectura bloquea capturas historicas.",
};

function sanitizeParam(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "";
}

export default async function HistoricalRegularizationPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requireSuperAdminContext("/unauthorized");
  const params = await searchParams;
  const selectedEnrollmentId = sanitizeParam(params.enrollment);
  const selectedLedger = selectedEnrollmentId ? await getEnrollmentLedger(selectedEnrollmentId) : null;

  if (selectedEnrollmentId && !selectedLedger) {
    notFound();
  }

  const selectedCampusId =
    sanitizeParam(params.campus) || (selectedLedger?.enrollment.campusId ? selectedLedger.enrollment.campusId : "");

  const successMessage =
    params.ok === "historical_payment_posted"
      ? "Pago historico registrado correctamente."
      : params.ok === "charge_voided"
        ? "Cargo anulado correctamente."
        : params.ok === "payment_reassigned"
          ? "Cambio de concepto aplicado correctamente."
          : params.ok === "payment_refunded"
            ? "Reembolso registrado correctamente."
            : null;
  const errorMessage = params.err ? errorMessages[params.err] ?? "Ocurrio un error en la regularizacion historica." : null;

  return (
    <PageShell
      title="Regularizacion historica"
      subtitle="Workspace excepcional para captura atrasada, creacion o recalculo de mensualidades y correcciones historicas sin usar Caja."
      breadcrumbs={[{ label: "Super Admin", href: "/admin/users" }, { label: "Regularizacion historica" }]}
      wide
    >
      <div className="space-y-5">
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-semibold">Superadmin unicamente</p>
          <p>
            Esta pantalla registra movimientos historicos con fecha real. No forma parte del flujo normal de Caja, no imprime
            automaticamente y no enlaza pagos a una sesion de caja abierta.
          </p>
          <p className="mt-1 text-xs opacity-80">Usuario actual: {context.user.email ?? "superadmin"}</p>
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
          <ContryRegularizationPlayerPicker
            selectedEnrollmentId={selectedEnrollmentId || undefined}
            selectedCampusId={selectedCampusId || undefined}
          />

          <section className="space-y-4">
            {!selectedLedger ? (
              <div className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Selecciona un campus y luego una cuenta para revisar cargos, aplicar pagos historicos o crear mensualidades con
                fecha efectiva real.
              </div>
            ) : (
              <ContryRegularizationAccountPanel
                initialLedger={selectedLedger}
                voidChargeAction={voidHistoricalRegularizationChargeAction.bind(
                  null,
                  selectedLedger.enrollment.id,
                  selectedLedger.enrollment.campusId,
                )}
              />
            )}
          </section>
        </div>
      </div>
    </PageShell>
  );
}
