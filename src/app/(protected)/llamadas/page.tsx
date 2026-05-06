import Link from "next/link";
import { PendingFilters } from "@/components/pending/pending-filters";
import { PendingTable } from "@/components/pending/pending-table";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { listPendingEnrollments, listTeamsForPending, type PendingFollowUpFilter } from "@/lib/queries/enrollments";
import { listCampuses } from "@/lib/queries/players";
import { PageShell } from "@/components/ui/page-shell";

type SearchParams = Promise<{
  q?: string;
  campus?: string;
  team?: string;
  bucket?: "all" | "small" | "medium" | "high";
  overdue?: "all" | "overdue" | "7plus" | "30plus";
  followUp?: PendingFollowUpFilter;
  ok?: string;
  page?: string;
}>;

function normalizeFollowUp(value: string | undefined): PendingFollowUpFilter {
  if (
    value === "uncontacted" ||
    value === "no_answer" ||
    value === "contacted" ||
    value === "promise_to_pay" ||
    value === "will_not_return"
  ) {
    return value;
  }
  return "all";
}

export default async function CallsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOperationalContext("/unauthorized");

  const params = await searchParams;
  const q = params.q ?? "";
  const campusId = params.campus ?? "";
  const teamId = params.team ?? "";
  const bucket = params.bucket ?? "all";
  const overdue = params.overdue ?? "all";
  const followUp = normalizeFollowUp(params.followUp);
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
      followUpStatus: followUp,
      page,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = page < totalPages ? page + 1 : null;
  const qsBase = `q=${encodeURIComponent(q)}&campus=${encodeURIComponent(campusId)}&team=${encodeURIComponent(teamId)}&bucket=${encodeURIComponent(bucket)}&overdue=${encodeURIComponent(overdue)}&followUp=${encodeURIComponent(followUp)}`;

  return (
    <PageShell
      title="Llamadas"
      subtitle="Seguimiento operativo de cuentas con saldo, telefonos y promesas de pago"
      wide
    >
      <div className="space-y-4">
        <PendingFilters
          q={q}
          campusId={campusId}
          teamId={teamId}
          balanceBucket={bucket}
          overdue={overdue}
          followUpStatus={followUp}
          showFollowUpFilter
          campuses={campuses.map((campus) => ({ id: campus.id, name: campus.name }))}
          teams={teams.map((team) => ({ id: team.id, name: team.name }))}
          basePath="/llamadas"
        />
        {params.ok === "baja" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
            Baja registrada correctamente. Los cargos pendientes no fueron anulados.
          </div>
        ) : null}
        <p className="text-sm text-slate-600 dark:text-slate-400">Total de resultados: {result.total}</p>
        <PendingTable rows={result.rows} />

        <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            Pagina {page} de {totalPages}
          </p>
          <div className="flex gap-3">
            {prevPage ? (
              <Link href={`/llamadas?${qsBase}&page=${prevPage}`} className="rounded border px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                Anterior
              </Link>
            ) : (
              <span className="rounded border px-3 py-1.5 text-slate-400">Anterior</span>
            )}
            {nextPage ? (
              <Link href={`/llamadas?${qsBase}&page=${nextPage}`} className="rounded border px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
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
