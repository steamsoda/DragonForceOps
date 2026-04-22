import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceReadContext } from "@/lib/auth/permissions";
import { getAttendanceReports } from "@/lib/queries/attendance";

type SearchParams = Promise<{ campus?: string; period?: string; birthYear?: string; month?: string }>;

function formatRate(rate: number | null) {
  return rate == null ? "Sin datos" : `${rate}%`;
}

export default async function AttendanceReportsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAttendanceReadContext("/unauthorized");
  const params = await searchParams;
  const periodDays = Number(params.period ?? 30);
  const birthYear = params.birthYear ? Number(params.birthYear) : undefined;
  const data = await getAttendanceReports({
    campusId: params.campus,
    periodDays,
    birthYear: Number.isFinite(birthYear) ? birthYear : undefined,
    month: params.month,
  });

  const birthYears = Array.from(new Set(data.inactivePlayers.map((row) => row.birthYear).filter((value): value is number => Boolean(value)))).sort((a, b) => b - a);

  return (
    <PageShell title="Reportes de asistencia" subtitle="Lectura operativa para detectar inactividad y comparar equipos." wide>
      <div className="space-y-6">
        <form className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-5">
          <label className="text-sm font-medium">
            Campus
            <select name="campus" defaultValue={data.selectedCampusId ?? ""} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
              <option value="">Todos</option>
              {data.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            Periodo
            <select name="period" defaultValue={data.periodDays} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
              <option value="30">30 dias</option>
              <option value="60">60 dias</option>
              <option value="90">90 dias</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Categoria
            <select name="birthYear" defaultValue={birthYear ?? ""} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950">
              <option value="">Todas</option>
              {birthYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">
            Mes equipos
            <input name="month" type="month" defaultValue={data.month} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
          </label>
          <div className="flex items-end">
            <button className="w-full rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Aplicar</button>
          </div>
        </form>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Jugadores con menor asistencia</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2">Jugador</th>
                  <th className="px-3 py-2">Campus</th>
                  <th className="px-3 py-2">Equipo</th>
                  <th className="px-3 py-2">Sesiones</th>
                  <th className="px-3 py-2">Ausencias</th>
                  <th className="px-3 py-2">Asistencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.inactivePlayers.slice(0, 80).map((row) => (
                  <tr key={row.playerId}>
                    <td className="px-3 py-2">
                      <Link href={`/players/${row.playerId}`} className="font-medium text-portoBlue hover:underline">{row.playerName}</Link>
                      <p className="text-xs text-slate-500">Cat. {row.birthYear ?? "-"}</p>
                    </td>
                    <td className="px-3 py-2">{row.campusName}</td>
                    <td className="px-3 py-2">{row.teamName}</td>
                    <td className="px-3 py-2">{row.total}</td>
                    <td className="px-3 py-2">{row.absent}</td>
                    <td className={`px-3 py-2 font-semibold ${(row.rate ?? 100) < 70 ? "text-rose-700 dark:text-rose-300" : "text-slate-900 dark:text-slate-100"}`}>{formatRate(row.rate)}</td>
                  </tr>
                ))}
                {data.inactivePlayers.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Sin datos de asistencia para el periodo.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Equipos y coach</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.teamReports.map((row) => (
              <article key={row.teamId} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{row.teamName}</p>
                <p className="text-sm text-slate-500">{row.campusName} | Coach {row.coachName ?? "-"}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                  <div><p className="text-xs text-slate-500">Sesiones</p><p className="font-bold">{row.completedSessions}</p></div>
                  <div><p className="text-xs text-slate-500">Ausencias</p><p className="font-bold">{row.absent}</p></div>
                  <div><p className="text-xs text-slate-500">Tasa</p><p className="font-bold">{formatRate(row.rate)}</p></div>
                </div>
              </article>
            ))}
            {data.teamReports.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">Sin equipos con asistencia registrada en el mes.</div>
            ) : null}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
