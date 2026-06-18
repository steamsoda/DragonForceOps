import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { getSafePendingReturnTo } from "@/lib/navigation/pending-return";
import { getPendingTuitionCategoryDetailData, type PendingTuitionPlayer } from "@/lib/queries/tuition-pending";
import { PendingDetailPrintButton } from "@/components/pending/pending-detail-print-button";
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

function categoryKey(player: PendingTuitionPlayer) {
  return player.birthYear == null ? "sin-categoria" : String(player.birthYear);
}

function categoryLabel(player: PendingTuitionPlayer) {
  return player.birthYear == null ? "Sin categoria" : `Cat. ${player.birthYear}`;
}

function pendingMonthsText(player: PendingTuitionPlayer) {
  return player.pendingMonths.map((month) => month.label).join(", ") || "-";
}

function groupPlayersByBirthYear(players: PendingTuitionPlayer[]) {
  const groups = new Map<string, PendingTuitionPlayer[]>();
  for (const player of players) {
    const key = categoryKey(player);
    groups.set(key, [...(groups.get(key) ?? []), player]);
  }
  return [...groups.entries()].map(([key, rows]) => ({
    key,
    label: rows[0] ? categoryLabel(rows[0]) : "Sin categoria",
    rows,
  }));
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
  const exportHref = withParams("/api/exports/pending-detail", {
    campus: data.campusId,
    birthYear: params.bucket ? undefined : params.birthYear,
    month: data.selectedMonth,
    bucket: params.bucket,
  });
  const playerGroups = groupPlayersByBirthYear(data.players);

  return (
    <PageShell
      title={`Pendientes - ${data.categoryLabel}`}
      subtitle={`${data.campusName}${data.selectedMonth ? ` | ${data.selectedMonth}` : ""}. Sin montos ni datos de contacto.`}
      wide
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Link
            href={boardReturnTo}
            className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-sm text-portoBlue hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Volver a categorias
          </Link>
          <a
            href={exportHref}
            className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-sm text-portoBlue hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            Exportar Excel
          </a>
          <PendingDetailPrintButton />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white print:hidden dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <p className="text-sm text-slate-600 dark:text-slate-400">{data.players.length} jugadores con mensualidad pendiente</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {playerGroups.length > 0 ? playerGroups.map((group) => (
              <section key={group.key}>
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800/60">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{group.label}</h2>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{group.rows.length} jugadores</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {group.rows.map((player) => (
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
                  ))}
                </div>
              </section>
            )) : (
              <div className="px-4 py-8 text-sm text-slate-600 dark:text-slate-400">
                No hay jugadores con este filtro.
              </div>
            )}
          </div>
        </div>

        <div className="hidden print:block">
          <div className="mb-4 text-slate-900">
            <h1 className="text-xl font-bold">Pendientes - {data.categoryLabel}</h1>
            <p className="text-sm">
              {data.campusName}
              {data.selectedMonth ? ` | ${data.selectedMonth}` : ""} | {data.players.length} jugadores
            </p>
          </div>
          {playerGroups.length > 0 ? playerGroups.map((group) => (
            <section key={`print-${group.key}`} className="mb-5 break-inside-avoid">
              <h2 className="border border-slate-300 bg-slate-100 px-2 py-1 text-sm font-bold text-slate-900">
                {group.label} ({group.rows.length} jugadores)
              </h2>
              <table className="w-full border-collapse text-[11px] text-slate-900">
                <thead>
                  <tr>
                    <th className="border border-slate-300 px-2 py-1 text-left">#</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Jugador</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Campus</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Nivel</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Telefono tutor</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Mensualidades</th>
                    <th className="border border-slate-300 px-2 py-1 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((player, index) => (
                    <tr key={`print-row-${player.enrollmentId}`}>
                      <td className="border border-slate-300 px-2 py-1">{index + 1}</td>
                      <td className="border border-slate-300 px-2 py-1">{player.playerName}</td>
                      <td className="border border-slate-300 px-2 py-1">{player.campusName}</td>
                      <td className="border border-slate-300 px-2 py-1">{player.level ?? "-"}</td>
                      <td className="border border-slate-300 px-2 py-1">{player.primaryPhone ?? "-"}</td>
                      <td className="border border-slate-300 px-2 py-1">{pendingMonthsText(player)}</td>
                      <td className="border border-slate-300 px-2 py-1">
                        {urgencyLabel(player)}
                        {player.overdueMonthCount > 0 ? " / Vencido" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )) : (
            <p className="text-sm text-slate-700">No hay jugadores con este filtro.</p>
          )}
        </div>
      </div>
    </PageShell>
  );
}
