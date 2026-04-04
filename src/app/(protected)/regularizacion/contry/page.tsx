import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { getOperationalCampusAccess } from "@/lib/auth/campuses";
import { listPlayers } from "@/lib/queries/players";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { LedgerSummaryCards } from "@/components/billing/ledger-summary-cards";
import { ChargesLedgerTable } from "@/components/billing/charges-ledger-table";
import { PaymentsTable } from "@/components/billing/payments-table";
import { HistoricalPaymentPostForm } from "@/components/billing/historical-payment-post-form";
import { postContryHistoricalPaymentRedirectAction } from "@/server/actions/payments";

type SearchParams = Promise<{
  q?: string;
  phone?: string;
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

function isContryCampus(campus: { code: string; name: string }) {
  const normalized = `${campus.code} ${campus.name}`.toLowerCase();
  return normalized.includes("contry") || normalized.includes("ctr");
}

export default async function ContryRegularizationPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOperationalContext();
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const phone = params.phone?.trim() ?? "";
  const selectedEnrollmentId = params.enrollment?.trim() ?? "";
  const campusAccess = await getOperationalCampusAccess();

  if (!campusAccess) redirect("/unauthorized");
  const contryCampus = campusAccess.campuses.find(isContryCampus);
  if (!contryCampus) redirect("/unauthorized");

  const searchActive = Boolean(q || phone);
  const result = searchActive
    ? await listPlayers({
        q: q || undefined,
        phone: phone || undefined,
        campusId: contryCampus.id,
        page: 1,
      })
    : { rows: [], total: 0, page: 1, pageSize: 20 };

  const selectedLedger = selectedEnrollmentId ? await getEnrollmentLedger(selectedEnrollmentId) : null;
  if (selectedEnrollmentId && (!selectedLedger || selectedLedger.enrollment.campusId !== contryCampus.id)) {
    notFound();
  }

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  if (phone) baseParams.set("phone", phone);
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

        <form method="GET" className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto_auto]">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar jugador Contry por nombre"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            type="text"
            name="phone"
            defaultValue={phone}
            placeholder="Telefono tutor (opcional)"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
          />
          <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
            Buscar
          </button>
          {(q || phone || selectedEnrollmentId) ? (
            <Link
              href="/regularizacion/contry"
              className="rounded-md border border-slate-300 px-4 py-2 text-center text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Limpiar
            </Link>
          ) : null}
        </form>

        <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Resultados Contry</h2>
              {searchActive ? (
                <span className="text-xs text-slate-500 dark:text-slate-400">{result.total} resultado{result.total !== 1 ? "s" : ""}</span>
              ) : null}
            </div>

            {!searchActive ? (
              <div className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Busca por nombre o telefono para abrir una cuenta de Contry y registrar pagos historicos.
              </div>
            ) : result.rows.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No se encontraron jugadores activos de Contry con esos filtros.
              </div>
            ) : (
              <div className="space-y-3">
                {result.rows.map((row) => {
                  const rowParams = new URLSearchParams();
                  if (q) rowParams.set("q", q);
                  if (phone) rowParams.set("phone", phone);
                  if (row.enrollmentId) rowParams.set("enrollment", row.enrollmentId);
                  const isSelected = row.enrollmentId === selectedEnrollmentId;

                  return (
                    <Link
                      key={row.id}
                      href={`/regularizacion/contry?${rowParams.toString()}`}
                      className={`block rounded-md border px-4 py-3 transition ${
                        isSelected
                          ? "border-portoBlue bg-portoBlue/5"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60"
                      }`}
                    >
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{row.fullName}</p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        Cat. {new Date(row.birthDate).getFullYear()} | {row.level ?? "Sin nivel"} | {row.campusName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Saldo: {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(row.balance)}
                        {row.primaryPhone ? ` | Tutor: ${row.primaryPhone}` : ""}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

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
