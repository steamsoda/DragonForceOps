import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { getPendingTuitionCategoryDetailData, type PendingTuitionPlayer } from "@/lib/queries/tuition-pending";
import { PageShell } from "@/components/ui/page-shell";

type SearchParams = Promise<{
  campus?: string;
  birthYear?: string;
  month?: string;
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
    return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200";
  }
  if (player.pendingMonthCount === 2 || player.overdueMonthCount > 0) {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200";
  }
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

function urgencyLabel(player: PendingTuitionPlayer) {
  if (player.pendingMonthCount >= 3) return "3+ meses";
  if (player.pendingMonthCount === 2) return "2 meses";
  return "1 mes";
}

export default async function PendingTuitionDetailPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOperationalContext("/unauthorized");

  const params = await searchParams;
  const data = await getPendingTuitionCategoryDetailData({
    campusId: params.campus,
    birthYear: params.birthYear,
    month: params.month,
  });

  if (!data) notFound();

  return (
    <PageShell
      title={`Pendientes - ${data.categoryLabel}`}
      subtitle={`${data.campusName}${data.selectedMonth ? ` | ${data.selectedMonth}` : ""}. Sin montos ni datos de contacto.`}
      wide
    >
      <div className="space-y-4">
        <Link
          href={withParams("/pending", { campus: data.campusId, month: data.selectedMonth })}
          className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-sm text-portoBlue hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          Volver a categorias
        </Link>

        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">{data.players.length} jugadores con mensualidad pendiente</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.players.map((player) => (
              <Link
                key={player.enrollmentId}
                href={`/players/${player.playerId}`}
                className="grid gap-3 px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/60 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto]"
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
                <div className="flex flex-wrap gap-1.5">
                  {player.pendingMonths.map((month) => (
                    <span
                      key={month.periodMonth}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        month.isOverdue
                          ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {month.label}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-start gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${urgencyChip(player)}`}>{urgencyLabel(player)}</span>
                  {player.overdueMonthCount > 0 ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
                      Vencido
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
