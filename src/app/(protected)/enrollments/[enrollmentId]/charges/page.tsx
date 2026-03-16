import { PageShell } from "@/components/ui/page-shell";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { LedgerSummaryCards } from "@/components/billing/ledger-summary-cards";
import { ChargesLedgerTable } from "@/components/billing/charges-ledger-table";
import { PaymentsTable } from "@/components/billing/payments-table";
import { PaymentPostForm } from "@/components/billing/payment-post-form";
import { postEnrollmentPaymentAction } from "@/server/actions/payments";
import { voidChargeAction } from "@/server/actions/billing";
import { createClient } from "@/lib/supabase/server";

const errorMessages: Record<string, string> = {
  invalid_form: "Los datos del pago son invalidos. Revisa monto y metodo.",
  unauthenticated: "Tu sesion no es valida. Vuelve a iniciar sesion.",
  enrollment_not_found: "No se encontro la inscripcion.",
  no_pending_charges: "No hay cargos pendientes en esta cuenta.",
  payment_insert_failed: "No se pudo registrar el pago. Intenta de nuevo.",
  allocation_insert_failed: "No se pudieron guardar las asignaciones del pago. Intenta de nuevo.",
  charge_not_found: "Cargo no encontrado o ya fue anulado.",
  void_reason_required: "Debes escribir el motivo de anulacion.",
  void_failed: "No se pudo anular el cargo. Intenta de nuevo.",
  unauthorized: "No tienes permiso para anular cargos."
};

export default async function ChargesPage({
  params,
  searchParams
}: {
  params: Promise<{ enrollmentId: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { enrollmentId } = await params;
  const query = await searchParams;
  const ledger = await getEnrollmentLedger(enrollmentId);

  if (!ledger) notFound();

  // Check if current user is director_admin to show void controls
  const supabase = await createClient();
  const { data: isDirector } = await supabase.rpc("is_director_admin");

  const subtitle = `${ledger.enrollment.playerName} | ${ledger.enrollment.campusName} (${ledger.enrollment.campusCode})`;

  const postPayment = postEnrollmentPaymentAction.bind(null, enrollmentId);
  const voidCharge = isDirector
    ? voidChargeAction.bind(null, enrollmentId)
    : undefined;

  const successMessage =
    query.ok === "payment_posted"
      ? "Pago registrado correctamente."
      : query.ok === "charge_created"
      ? "Cargo creado correctamente."
      : query.ok === "charge_voided"
      ? "Cargo anulado correctamente."
      : null;
  const errorMessage = query.err ? errorMessages[query.err] ?? "Ocurrio un error." : null;

  return (
    <PageShell title="Cargos y cuenta" subtitle={subtitle}>
      <div className="space-y-5">
        {successMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {successMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{errorMessage}</div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-sm">
          <p>
            Inscripcion: <span className="font-medium">{ledger.enrollment.id}</span>
          </p>
          <div className="flex gap-2">
            <Link
              href={`/enrollments/${ledger.enrollment.id}/charges/new`}
              className="rounded-md bg-portoBlue px-3 py-1.5 font-medium text-white hover:bg-portoDark"
            >
              Nuevo cargo
            </Link>
          </div>
        </div>

        <LedgerSummaryCards
          currency={ledger.enrollment.currency}
          totalCharges={ledger.totals.totalCharges}
          totalPayments={ledger.totals.totalPayments}
          balance={ledger.totals.balance}
        />

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cargos</h2>
          <ChargesLedgerTable rows={ledger.charges} voidChargeAction={voidCharge} />
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Pagos</h2>
          <PaymentPostForm
            currentBalance={ledger.totals.balance}
            currency={ledger.enrollment.currency}
            action={postPayment}
          />
          <PaymentsTable rows={ledger.payments} />
        </section>
      </div>
    </PageShell>
  );
}
