import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { findContryCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { LedgerSummaryCards } from "@/components/billing/ledger-summary-cards";
import { ChargesLedgerTable } from "@/components/billing/charges-ledger-table";
import { PaymentsTable } from "@/components/billing/payments-table";
import { HistoricalPaymentPostForm } from "@/components/billing/historical-payment-post-form";
import { ContryRegularizationPlayerPicker } from "@/components/billing/contry-regularization-player-picker";
import { postContryHistoricalPaymentRedirectAction } from "@/server/actions/payments";

type SearchParams = Promise<{
  enrollment?: string;
  ok?: string;
  err?: string;
  payment?: string;
}>;

const errorMessages: Record<string, string> = {
  invalid_form: "Los datos del pago historico no son validos.",
  unauthenticated: "Tu sesion no es valida.",
  enrollment_not_found: "La cuenta seleccionada no pertenece a Contry o ya no esta disponible.",
  no_pending_charges: "No hay cargos pendientes en esta cuenta.",
  payment_insert_failed: "No se pudo registrar el pago historico.",
  allocation_insert_failed: "No se pudieron guardar las asignaciones del pago historico.",
  paid_at_required: "Debes capturar la fecha y hora real del pago.",
  debug_read_only: "El modo de solo lectura bloquea capturas historicas.",
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

  const baseParams = new URLSearchParams();
  if (selectedEnrollmentId) baseParams.set("enrollment", selectedEnrollmentId);
  const returnTo = `/regularizacion/contry${baseParams.toString() ? `?${baseParams.toString()}` : ""}`;

  const postHistoricalPayment = selectedLedger
    ? postContryHistoricalPaymentRedirectAction.bind(null, selectedLedger.enrollment.id, contryCampus.id, returnTo)
    : null;

  const successMessage =
    params.ok === "historical_payment_posted"
      ? "Pago historico registrado correctamente para Contry."
      : null;
  const errorMessage = params.err ? errorMessages[params.err] ?? "Ocurrio un error en la regularizacion." : null;

  return (
    <PageShell
      title="Regularizacion Contry"
      subtitle="Captura historica de pagos de Contry para migrar el rezago del sistema en papel sin tocar la base manualmente."
      breadcrumbs={[{ label: "Regularizacion Contry" }]}
      wide
    >
      <div className="space-y-5">
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-semibold">Modo historico Contry</p>
          <p>
            Esta pantalla registra pagos reales con fecha historica. Los pagos quedan operativamente como Contry, no se
            imprimen automaticamente y no se vinculan a la sesion de caja abierta.
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
                Selecciona una cuenta de Contry para revisar cargos pendientes y capturar el pago historico.
              </div>
            ) : (
              <>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedLedger.enrollment.playerName}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {selectedLedger.enrollment.campusName} ({selectedLedger.enrollment.campusCode}) | Inscripcion {selectedLedger.enrollment.id}
                      </p>
                    </div>
                    <Link
                      href={`/enrollments/${selectedLedger.enrollment.id}/charges`}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Ver cuenta completa
                    </Link>
                  </div>
                </div>

                <LedgerSummaryCards
                  currency={selectedLedger.enrollment.currency}
                  totalCharges={selectedLedger.totals.totalCharges}
                  totalPayments={selectedLedger.totals.totalPayments}
                  balance={selectedLedger.totals.balance}
                />

                {postHistoricalPayment ? (
                  <HistoricalPaymentPostForm
                    action={postHistoricalPayment}
                    currentBalance={selectedLedger.totals.balance}
                    currency={selectedLedger.enrollment.currency}
                  />
                ) : null}

                <section className="space-y-2">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Cargos pendientes e historicos</h3>
                  <ChargesLedgerTable rows={selectedLedger.charges} />
                </section>

                <section className="space-y-2">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Pagos registrados</h3>
                  <PaymentsTable rows={selectedLedger.payments} />
                </section>
              </>
            )}
          </section>
        </div>
      </div>
    </PageShell>
  );
}
