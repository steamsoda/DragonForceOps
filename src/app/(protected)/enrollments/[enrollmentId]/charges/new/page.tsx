import { PageShell } from "@/components/ui/page-shell";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getEnrollmentChargeFormContext } from "@/lib/queries/billing";
import { getProductsForCajaAction } from "@/server/actions/caja";
import { ChargeProductGrid } from "@/components/billing/charge-product-grid";

export default async function ChargeCreatePage({
  params,
}: {
  params: Promise<{ enrollmentId: string }>;
}) {
  const { enrollmentId } = await params;

  const [context, products] = await Promise.all([
    getEnrollmentChargeFormContext(enrollmentId),
    getProductsForCajaAction(),
  ]);

  if (!context) notFound();

  const subtitle = `${context.enrollment.playerName} | ${context.enrollment.campusName} (${context.enrollment.campusCode})`;

  return (
    <PageShell title="Nuevo cargo" subtitle={subtitle}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <Link href={`/enrollments/${enrollmentId}/charges`} className="text-portoBlue hover:underline">
            Volver a cargos y cuenta
          </Link>
        </div>
        <ChargeProductGrid
          enrollmentId={enrollmentId}
          playerName={context.enrollment.playerName}
          campusName={context.enrollment.campusName}
          currency={context.enrollment.currency}
          products={products}
        />
      </div>
    </PageShell>
  );
}
