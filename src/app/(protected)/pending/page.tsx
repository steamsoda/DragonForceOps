import { PageShell } from "@/components/ui/page-shell";
import Link from "next/link";
import { listCampuses } from "@/lib/queries/players";
import { listPendingEnrollments, listTeamsForPending } from "@/lib/queries/enrollments";
import { PendingFilters } from "@/components/pending/pending-filters";
import { PendingTable } from "@/components/pending/pending-table";

type SearchParams = Promise<{
  q?: string;
  campus?: string;
  team?: string;
  bucket?: "all" | "small" | "medium" | "high";
  overdue?: "all" | "overdue" | "7plus" | "30plus";
  page?: string;
}>;

export default async function PendingPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const campusId = params.campus ?? "";
  const teamId = params.team ?? "";
  const bucket = params.bucket ?? "all";
  const overdue = params.overdue ?? "all";
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const [campuses, teams, result] = await Promise.all([
    listCampuses(),
    listTeamsForPending(campusId || undefined),
    listPendingEnrollments({
      q,
      campusId: campusId || undefined,
      teamId: teamId || undefined,
      balanceBucket: bucket,
      overdue,
      page
    })
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const qsBase = `q=${encodeURIComponent(q)}&campus=${encodeURIComponent(campusId)}&team=${encodeURIComponent(teamId)}&bucket=${encodeURIComponent(bucket)}&overdue=${encodeURIComponent(overdue)}`;

  return (
    <PageShell title="Pagos pendientes" subtitle="Filtra por campus, equipo, rango de saldo y dias vencidos">
      <div className="space-y-4">
        <PendingFilters
          q={q}
          campusId={campusId}
          teamId={teamId}
          balanceBucket={bucket}
          overdue={overdue}
          campuses={campuses.map((campus) => ({ id: campus.id, name: campus.name }))}
          teams={teams.map((team) => ({ id: team.id, name: team.name }))}
        />
        <p className="text-sm text-slate-600">Total de resultados: {result.total}</p>
        <PendingTable rows={result.rows} />

        <div className="flex items-center justify-between text-sm">
          <p>
            Pagina {page} de {totalPages}
          </p>
          <div className="flex gap-3">
            {prevPage ? (
              <Link href={`/pending?${qsBase}&page=${prevPage}`} className="rounded border px-3 py-1.5 hover:bg-slate-50">
                Anterior
              </Link>
            ) : (
              <span className="rounded border px-3 py-1.5 text-slate-400">Anterior</span>
            )}
            {nextPage ? (
              <Link href={`/pending?${qsBase}&page=${nextPage}`} className="rounded border px-3 py-1.5 hover:bg-slate-50">
                Siguiente
              </Link>
            ) : (
              <span className="rounded border px-3 py-1.5 text-slate-400">Siguiente</span>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
