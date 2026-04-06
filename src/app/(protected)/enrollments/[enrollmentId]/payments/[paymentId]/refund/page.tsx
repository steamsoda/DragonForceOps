import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { PaymentRefundPanel } from "@/components/billing/payment-refund-panel";
import { getEnrollmentLedger } from "@/lib/queries/billing";

type SearchParams = Promise<{ returnTo?: string }>;

function normalizeReturnTo(returnTo: string | undefined, fallback: string) {
  return typeof returnTo === "string" && returnTo.startsWith("/") ? returnTo : fallback;
}

export default async function RefundPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ enrollmentId: string; paymentId: string }>;
  searchParams: SearchParams;
}) {
  const { enrollmentId, paymentId } = await params;
  const query = await searchParams;
  const returnTo = normalizeReturnTo(query.returnTo, `/enrollments/${enrollmentId}/charges`);

  const ledger = await getEnrollmentLedger(enrollmentId);
  if (!ledger) notFound();

  const payment = ledger.payments.find((row) => row.id === paymentId);
  if (!payment) notFound();

  return (
    <PageShell
      title="Reembolsar pago"
      subtitle="Registra la devoluci\u00f3n real del dinero en la fecha en que ocurri\u00f3."
      breadcrumbs={[
        { label: "Cuenta", href: `/enrollments/${enrollmentId}/charges` },
        { label: "Reembolsar" },
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

        <PaymentRefundPanel
          enrollmentId={enrollmentId}
          returnTo={returnTo}
          payment={{
            id: payment.id,
            amount: payment.amount,
            currency: payment.currency,
            paidAt: payment.paidAt,
            method: payment.method,
            notes: payment.notes,
          }}
        />
      </div>
    </PageShell>
  );
}
