import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { PaymentReassignmentPanel } from "@/components/billing/payment-reassignment-panel";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { getProductsForCajaAction, getEnrollmentForCajaAction } from "@/server/actions/caja";

type SearchParams = Promise<{ returnTo?: string }>;

function normalizeReturnTo(returnTo: string | undefined, fallback: string) {
  return typeof returnTo === "string" && returnTo.startsWith("/") ? returnTo : fallback;
}

export default async function ReassignPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ enrollmentId: string; paymentId: string }>;
  searchParams: SearchParams;
}) {
  const { enrollmentId, paymentId } = await params;
  const query = await searchParams;
  const returnTo = normalizeReturnTo(query.returnTo, `/enrollments/${enrollmentId}/charges`);

  const [ledger, cajaData, products] = await Promise.all([
    getEnrollmentLedger(enrollmentId),
    getEnrollmentForCajaAction(enrollmentId),
    getProductsForCajaAction(),
  ]);

  if (!ledger || !cajaData) notFound();

  const payment = ledger.payments.find((row) => row.id === paymentId);
  if (!payment) notFound();

  const sourceChargeIds = new Set(payment.sourceCharges.map((charge) => charge.chargeId));
  const pendingCharges = cajaData.pendingCharges.filter((charge) => !sourceChargeIds.has(charge.id));

  return (
    <PageShell
      title="Cambiar concepto"
      subtitle="Usa este mismo dinero para otros cargos sin dejar cr\u00e9dito flotando."
      breadcrumbs={[
        { label: "Cuenta", href: `/enrollments/${enrollmentId}/charges` },
        { label: "Cambiar concepto" },
      ]}
      wide
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900/60">
          <p>
            Pago de <span className="font-semibold">{ledger.enrollment.playerName}</span> en{" "}
            <span className="font-semibold">{ledger.enrollment.campusName}</span>
          </p>
          <Link
            href={returnTo}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-white dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Volver
          </Link>
        </div>

        <PaymentReassignmentPanel
          enrollmentId={enrollmentId}
          returnTo={returnTo}
          payment={payment}
          initialPendingCharges={pendingCharges}
          products={products}
          advanceTuitionOptions={cajaData.advanceTuitionOptions}
        />
      </div>
    </PageShell>
  );
}
