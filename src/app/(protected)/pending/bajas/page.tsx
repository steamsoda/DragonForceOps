import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { BajaWriteoffTable } from "@/components/pending/baja-writeoff-table";
import { requireDirectorContext } from "@/lib/auth/permissions";
import { listBajaEnrollmentsWithBalance } from "@/lib/queries/enrollments";

type SearchParams = Promise<{ ok?: string; err?: string; count?: string }>;

export default async function BajaWriteoffPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  await requireDirectorContext("/unauthorized");

  const rows = await listBajaEnrollmentsWithBalance();
  const totalAmount = rows.reduce((sum, row) => sum + row.pendingTotal, 0);
  const totalCharges = rows.reduce((sum, row) => sum + row.pendingChargeCount, 0);

  const fmt = (value: number) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(value);

  return (
    <PageShell
      title="Castigo de bajas"
      subtitle="Anula cargos pendientes de alumnos que ya estan de baja o cancelados."
    >
      <div className="space-y-4">
        <Link href="/llamadas" className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
          {"<-"} Llamadas
        </Link>

        {params.ok === "voided" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
            {params.count ?? "0"} {Number(params.count ?? 0) === 1 ? "cargo anulado" : "cargos anulados"} correctamente.
          </div>
        ) : null}

        {params.err ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
            {params.err === "reason_required" && "Debes ingresar un motivo de anulacion."}
            {params.err === "none_selected" && "Selecciona al menos una baja."}
            {params.err === "no_pending_charges" && "Los registros seleccionados no tienen cargos pendientes."}
            {params.err === "unauthorized" && "Solo directores pueden anular cargos."}
            {params.err === "void_failed" && "Error al anular los cargos. Intenta de nuevo."}
            {!["reason_required", "none_selected", "no_pending_charges", "unauthorized", "void_failed"].includes(
              params.err
            ) && `Error: ${params.err}`}
          </div>
        ) : null}

        {rows.length > 0 ? (
          <div className="flex flex-wrap gap-4 text-sm text-slate-600 dark:text-slate-400">
            <span>{rows.length} {rows.length === 1 ? "baja" : "bajas"} con saldo pendiente</span>
            <span>·</span>
            <span>{totalCharges} cargos</span>
            <span>·</span>
            <span className="font-medium text-red-600 dark:text-red-400">{fmt(totalAmount)} total</span>
          </div>
        ) : null}

        <BajaWriteoffTable rows={rows} />
      </div>
    </PageShell>
  );
}
