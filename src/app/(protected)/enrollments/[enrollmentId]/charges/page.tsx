import { PageShell } from "@/components/ui/page-shell";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { LedgerSummaryCards } from "@/components/billing/ledger-summary-cards";
import { ChargesLedgerTable } from "@/components/billing/charges-ledger-table";
import { PaymentsTable } from "@/components/billing/payments-table";
import { PaymentPostForm } from "@/components/billing/payment-post-form";
import { postEnrollmentPaymentAction } from "@/server/actions/payments";

const errorMessages: Record<string, string> = {
  invalid_form: "Los datos del pago son invalidos. Revisa monto, metodo y asignaciones.",
  unauthenticated: "Tu sesion no es valida. Vuelve a iniciar sesion.",
  enrollment_not_found: "No se encontro la inscripcion.",
  no_pending_charges: "No hay cargos pendientes para asignar.",
  no_allocations: "Debes asignar al menos un monto a un cargo pendiente.",
  allocation_exceeds_payment: "La suma asignada no puede superar el monto total del pago.",
  allocation_must_match_payment: "La suma asignada debe ser igual al monto total del pago.",
  allocation_exceeds_pending: "Una asignacion supera el saldo pendiente de un cargo.",
  payment_insert_failed: "No se pudo registrar el pago. Intenta de nuevo.",
  allocation_insert_failed: "No se pudieron guardar las asignaciones del pago. Intenta de nuevo."
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

  const subtitle = `${ledger.enrollment.playerName} | ${ledger.enrollment.campusName} (${ledger.enrollment.campusCode})`;

  const postPayment = postEnrollmentPaymentAction.bind(null, enrollmentId);
  const pendingCharges = ledger.charges.filter((charge) => charge.pendingAmount > 0 && charge.status !== "void");
  const successMessage = query.ok === "payment_posted" ? "Pago registrado correctamente." : null;
  const errorMessage = query.err ? errorMessages[query.err] ?? "Ocurrio un error al registrar el pago." : null;

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

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
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
          <h2 className="text-lg font-semibold text-slate-900">Cargos</h2>
          <ChargesLedgerTable rows={ledger.charges} />
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">Pagos</h2>
          <PaymentPostForm charges={pendingCharges} action={postPayment} />
          <PaymentsTable rows={ledger.payments} />
        </section>
      </div>
    </PageShell>
  );
}
