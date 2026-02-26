import { PageShell } from "@/components/ui/page-shell";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { LedgerSummaryCards } from "@/components/billing/ledger-summary-cards";
import { ChargesLedgerTable } from "@/components/billing/charges-ledger-table";
import { PaymentsTable } from "@/components/billing/payments-table";

export default async function ChargesPage({
  params
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;
  const ledger = await getEnrollmentLedger(enrollmentId);

  if (!ledger) notFound();

  const subtitle = `${ledger.enrollment.playerName} | ${ledger.enrollment.campusName} (${ledger.enrollment.campusCode})`;

  return (
    <PageShell title="Cargos y cuenta" subtitle={subtitle}>
      <div className="space-y-5">
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
          <PaymentsTable rows={ledger.payments} />
        </section>
      </div>
    </PageShell>
  );
}
