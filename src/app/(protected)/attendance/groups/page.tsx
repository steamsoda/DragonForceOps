import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceReadContext } from "@/lib/auth/permissions";
import {
  ATTENDANCE_STATUS_LABELS,
  getAttendanceGroupsMonthlyData,
  type AttendanceGroupMonthlyCard,
} from "@/lib/queries/attendance";

type SearchParams = Promise<{ campus?: string; month?: string; group?: string }>;

function formatRate(rate: number | null) {
  return rate == null ? "Sin datos" : `${rate}%`;
}

function groupHref(params: { campus?: string | null; month: string; group?: string | null }) {
  const search = new URLSearchParams();
  if (params.campus) search.set("campus", params.campus);
  if (params.month) search.set("month", params.month);
  if (params.group) search.set("group", params.group);
  const query = search.toString();
  return query ? `/attendance/groups?${query}` : "/attendance/groups";
}

function rateClass(rate: number | null) {
  if (rate == null) return "text-slate-500";
  if (rate < 70) return "text-rose-700 dark:text-rose-300";
  if (rate < 85) return "text-amber-700 dark:text-amber-300";
  return "text-emerald-700 dark:text-emerald-300";
}

function statusChip(status: string | null) {
  if (!status) return <span className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-500">Sin sesiones</span>;
  const tones: Record<string, string> = {
    present: "border-emerald-200 bg-emerald-50 text-emerald-800",
    absent: "border-rose-200 bg-rose-50 text-rose-800",
    injury: "border-sky-200 bg-sky-50 text-sky-800",
    justified: "border-slate-200 bg-slate-50 text-slate-700",
  };
  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${tones[status] ?? tones.present}`}>
      {ATTENDANCE_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function GroupCard({ group, selectedCampusId, selectedMonth }: { group: AttendanceGroupMonthlyCard; selectedCampusId: string | null; selectedMonth: string }) {
  return (
    <Link
      href={groupHref({ campus: selectedCampusId, month: selectedMonth, group: group.groupId })}
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-portoBlue dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex flex-col gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-900 dark:text-slate-100">{group.birthYearLabel} - {group.groupName}</p>
            {group.subgroupLabel ? <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-800">{group.subgroupLabel}</span> : null}
          </div>
          <p className="text-xs text-slate-500">
            {group.campusName} | {group.programLabel} | {group.genderLabel}
            {group.startTime && group.endTime ? ` | ${group.startTime}-${group.endTime}` : ""}
          </p>
          <p className="text-xs text-slate-500">Coach {group.coachName ?? "-"}</p>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="rounded-lg bg-slate-50 px-2 py-2 dark:bg-slate-800">
            <p className="text-slate-500">Jug.</p>
            <p className="text-base font-bold text-slate-900 dark:text-slate-100">{group.activePlayers}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-2 py-2 dark:bg-slate-800">
            <p className="text-slate-500">Ses.</p>
            <p className="text-base font-bold text-slate-900 dark:text-slate-100">{group.completedSessions}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-2 py-2 dark:bg-slate-800">
            <p className="text-slate-500">Aus.</p>
            <p className="text-base font-bold text-slate-900 dark:text-slate-100">{group.absent}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-2 py-2 dark:bg-slate-800">
            <p className="text-slate-500">Tasa</p>
            <p className={`text-base font-bold ${rateClass(group.rate)}`}>{formatRate(group.rate)}</p>
          </div>
        </div>
        {group.cancelledSessions > 0 ? (
          <p className="text-xs text-slate-500">{group.cancelledSessions} cancelada(s), fuera del calculo.</p>
        ) : null}
      </div>
    </Link>
  );
}

export default async function AttendanceGroupsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAttendanceReadContext("/unauthorized");
  const params = await searchParams;
  const data = await getAttendanceGroupsMonthlyData({
    campusId: params.campus,
    month: params.month,
    groupId: params.group,
  });

  return (
    <PageShell title="Grupos de asistencia" subtitle="Vista mensual por grupo de entrenamiento. Sin datos financieros ni contacto." wide>
      <div className="space-y-6">
        <form className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm font-medium">
            Campus
            <select name="campus" defaultValue={data.selectedCampusId ?? ""} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
              <option value="">Todos</option>
              {data.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            Mes
            <input name="month" type="month" defaultValue={data.selectedMonth} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
          </label>
          <div className="flex items-end">
            <button className="w-full rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Aplicar</button>
          </div>
        </form>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">Grupos</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.groups.length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">Jugadores activos</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.groups.reduce((sum, group) => sum + group.activePlayers, 0)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">Sesiones tomadas</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.groups.reduce((sum, group) => sum + group.completedSessions, 0)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-500">Canceladas</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.groups.reduce((sum, group) => sum + group.cancelledSessions, 0)}</p>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Grupos</h2>
            <p className="text-sm text-slate-500">Abre un grupo para ver asistencia mensual por jugador.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.groups.map((group) => (
              <GroupCard key={group.groupId} group={group} selectedCampusId={data.selectedCampusId} selectedMonth={data.selectedMonth} />
            ))}
            {data.groups.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">Sin grupos activos para el alcance seleccionado.</div>
            ) : null}
          </div>
        </section>

        {data.selectedGroup ? (
          <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {data.selectedGroup.birthYearLabel} - {data.selectedGroup.groupName}
                </h2>
                <p className="text-sm text-slate-500">
                  {data.selectedGroup.campusName} | {data.selectedGroup.programLabel} | {data.selectedGroup.genderLabel} | Coach {data.selectedGroup.coachName ?? "-"}
                </p>
              </div>
              <Link href={groupHref({ campus: data.selectedCampusId, month: data.selectedMonth })} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                Cerrar detalle
              </Link>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                  <tr>
                    <th className="px-3 py-2">Jugador</th>
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2">Sesiones</th>
                    <th className="px-3 py-2">Ausencias</th>
                    <th className="px-3 py-2">Justificadas / lesion</th>
                    <th className="px-3 py-2">Tasa</th>
                    <th className="px-3 py-2">Ultima</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.players.map((player) => (
                    <tr key={player.enrollmentId}>
                      <td className="px-3 py-2">
                        <Link href={`/players/${player.playerId}`} className="font-medium text-portoBlue hover:underline">{player.playerName}</Link>
                        <p className="text-xs text-slate-500">{player.publicPlayerId ?? "Sin ID"}</p>
                      </td>
                      <td className="px-3 py-2">{player.birthYear ?? "-"}</td>
                      <td className="px-3 py-2">{player.attended} de {player.total}</td>
                      <td className="px-3 py-2">{player.absent}</td>
                      <td className="px-3 py-2">{player.justified + player.injury}</td>
                      <td className={`px-3 py-2 font-semibold ${rateClass(player.rate)}`}>{formatRate(player.rate)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {statusChip(player.lastStatus)}
                          <span className="text-xs text-slate-500">{player.lastSessionDate ?? "-"}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.players.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Este grupo no tiene jugadores activos asignados.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}
