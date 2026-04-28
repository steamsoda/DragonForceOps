import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { getSafePendingReturnTo } from "@/lib/navigation/pending-return";
import { getPendingTuitionCategoryDetailData, type PendingTuitionPlayer } from "@/lib/queries/tuition-pending";
import { PageShell } from "@/components/ui/page-shell";

type SearchParams = Promise<{
  campus?: string;
  birthYear?: string;
  month?: string;
  bucket?: string;
  returnTo?: string;
}>;

function withParams(path: string, params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

function urgencyChip(player: PendingTuitionPlayer) {
  if (player.pendingMonthCount >= 3) {
    return "border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200";
  }
  if (player.pendingMonthCount === 2 || player.overdueMonthCount > 0) {
    return "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200";
  }
  return "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

function urgencyLabel(player: PendingTuitionPlayer) {
  if (player.pendingMonthCount >= 3) return "3+ meses";
  if (player.pendingMonthCount === 2) return "2 meses";
  return "1 mes";
}

function monthChipClass(isOverdue: boolean) {
  if (isOverdue) {
    return "border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200";
  }
  return "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

export default async function PendingTuitionDetailPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOperationalContext("/unauthorized");

  const params = await searchParams;
  const data = await getPendingTuitionCategoryDetailData({
    campusId: params.campus,
    birthYear: params.birthYear,
    month: params.month,
    bucket: params.bucket,
  });

  if (!data) notFound();

  const fallbackReturnTo = withParams("/pending", { campus: data.campusId, month: data.selectedMonth });
  const boardReturnTo = getSafePendingReturnTo(params.returnTo) || fallbackReturnTo;
  const detailReturnTo = withParams("/pending/detail", {
    campus: data.campusId,
    birthYear: params.bucket ? undefined : params.birthYear,
    month: data.selectedMonth,
    bucket: params.bucket,
    returnTo: boardReturnTo,
  });

  return (
    <PageShell
      title={`Pendientes - ${data.categoryLabel}`}
      subtitle={`${data.campusName}${data.selectedMonth ? ` | ${data.selectedMonth}` : ""}. Sin montos ni datos de contacto.`}
      wide
    >
      <div className="space-y-4">
        <Link
          href={boardReturnTo}
          className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-sm text-portoBlue hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          Volver a categorias
        </Link>

        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">{data.players.length} jugadores con mensualidad pendiente</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.players.length > 0 ? data.players.map((player) => (
              <Link
                key={player.enrollmentId}
                href={withParams(`/players/${player.playerId}`, { returnTo: detailReturnTo })}
                className="grid gap-3 px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 md:grid-cols-[minmax(260px,1.4fr)_minmax(150px,0.8fr)_minmax(260px,1fr)_minmax(150px,auto)] md:items-center"
              >
                <div>
                  <p className="font-semibold text-portoBlue">{player.playerName}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Cat. {player.birthYear ?? "-"} | {player.campusName}
                  </p>
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400">
                  <p>
                    <span className="font-medium text-slate-700 dark:text-slate-200">Nivel</span> {player.level ?? "-"}
                  </p>
                  <p>
                    <span className="font-medium text-slate-700 dark:text-slate-200">Equipo</span> {player.teamName ?? "-"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {player.pendingMonths.map((month) => (
                    <span
                      key={month.periodMonth}
                      className={`inline-flex min-h-8 items-center justify-center rounded-full border px-3 py-1 text-center text-xs font-medium leading-none ${monthChipClass(month.isOverdue)}`}
                    >
                      {month.label}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-start gap-1.5 md:justify-end">
                  <span className={`inline-flex min-h-6 items-center justify-center rounded-full border px-2.5 py-0.5 text-center text-xs font-semibold leading-none ${urgencyChip(player)}`}>
                    {urgencyLabel(player)}
                  </span>
                  {player.overdueMonthCount > 0 ? (
                    <span className="inline-flex min-h-6 items-center justify-center rounded-full border border-rose-200 bg-rose-100 px-2.5 py-0.5 text-center text-xs font-semibold leading-none text-rose-800 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
                      Vencido
                    </span>
                  ) : null}
                </div>
              </Link>
            )) : (
              <div className="px-4 py-8 text-sm text-slate-600 dark:text-slate-400">
                No hay jugadores con este filtro.
              </div>
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
