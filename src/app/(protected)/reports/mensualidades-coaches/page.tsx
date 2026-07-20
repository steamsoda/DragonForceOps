import Link from "next/link";
import { AttendanceCampusButtons } from "@/components/attendance/attendance-campus-buttons";
import { CoachTuitionCharts } from "@/components/reports/coach-tuition-charts";
import { CoachTuitionPrintButton } from "@/components/reports/coach-tuition-print-button";
import { PageShell } from "@/components/ui/page-shell";
import { requireTuitionStatusReportContext } from "@/lib/auth/permissions";
import { getCoachTuitionReport, type CoachTuitionPlayer, type TuitionReportStatus } from "@/lib/queries/coach-tuition-report";

type SearchParams = Promise<{ campus?: string; month?: string; coach?: string }>;

const STATUS_LABELS: Record<TuitionReportStatus, string> = {
  paid: "Pagada",
  pending: "Pendiente",
  scholarship: "Becado",
  omitted: "Omitida",
  missing: "Sin cargo",
  review: "Revisar",
};

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  const label = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function rateLabel(value: number | null) {
  return value == null ? "Sin datos" : `${value}%`;
}

function rateClass(value: number | null) {
  if (value == null) return "text-slate-500";
  if (value >= 80) return "text-emerald-700";
  if (value >= 60) return "text-amber-700";
  return "text-rose-700";
}

function backlogLabel(count: number) {
  if (count <= 0) return "";
  if (count === 1) return "1 mes anterior";
  if (count === 2) return "2 meses anteriores";
  return "3+ meses anteriores";
}

function playerList(players: CoachTuitionPlayer[], status: TuitionReportStatus) {
  const matching = players.filter((player) => player.status === status);
  if (matching.length === 0) return "Ninguno";
  return matching.map((player) => `${player.playerName}${player.previousPendingMonths > 0 ? ` (${backlogLabel(player.previousPendingMonths)})` : ""}`).join(", ");
}

export default async function CoachTuitionReportPage({ searchParams }: { searchParams: SearchParams }) {
  await requireTuitionStatusReportContext("/unauthorized");
  const params = await searchParams;
  const data = await getCoachTuitionReport({ campusId: params.campus, month: params.month, coachId: params.coach });
  const printableCoach = data.selectedCoachSummary?.coachName ?? "Todos los coaches";

  return (
    <PageShell title="Mensualidades por coach" subtitle={`Estado mensual por campus, categoria, coach y grupo | ${monthLabel(data.selectedMonth)}`} breadcrumbs={[{ label: "Reportes" }, { label: "Mensualidades por coach" }]} wide>
      <div className="space-y-5">
        <section className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 print:hidden dark:border-slate-700 dark:bg-slate-900">
          <AttendanceCampusButtons pathname="/reports/mensualidades-coaches" campuses={data.campuses} selectedCampusId={data.selectedCampusId} params={{ month: data.selectedMonth, coach: data.selectedCoachId }} allLabel="Todos" />
          <form className="grid items-end gap-3 md:grid-cols-[minmax(12rem,0.7fr)_minmax(16rem,1fr)_auto_auto]">
            {data.selectedCampusId ? <input type="hidden" name="campus" value={data.selectedCampusId} /> : null}
            <label className="text-sm font-medium">Mes<input name="month" type="month" defaultValue={data.selectedMonth} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" /></label>
            <label className="text-sm font-medium">Coach<select name="coach" defaultValue={data.selectedCoachId} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"><option value="">Todos los coaches</option>{data.coachOptions.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}</select></label>
            <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Aplicar</button>
            <div className="flex gap-2"><Link href="/reports/mensualidades-coaches" prefetch={false} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800">Limpiar</Link><CoachTuitionPrintButton selectedCoach={Boolean(data.selectedCoachId)} /></div>
          </form>
          <p className="text-xs text-slate-500">Reporte operativo sin montos. Usa el plantel y coach actuales; los cambios de grupo o coach se reflejan al volver a abrir el reporte.</p>
          <p className="text-xs text-slate-500">Media beca y beca personalizada cuentan como pago esperado. Beca completa y omision aprobada quedan fuera del porcentaje.</p>
        </section>

        <div className="hidden border-b border-black pb-2 text-xs print:block"><strong>{printableCoach}</strong> | {monthLabel(data.selectedMonth)}</div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 print:grid-cols-8 print:gap-1">
          {[
            ["Plantel actual", data.totals.rosterCount], ["Deben pagar", data.totals.expectedCount], ["Pagada", data.totals.paidCount], ["Pendiente", data.totals.pendingCount],
            ["Becado", data.totals.scholarshipCount], ["Omitida", data.totals.omittedCount], ["Sin cargo", data.totals.missingCount], ["Cobranza", rateLabel(data.totals.collectionRate)],
          ].map(([label, value]) => <article key={label} className="rounded-md border border-slate-200 bg-slate-50 p-3 print:rounded-none print:border-black print:bg-white print:p-1 dark:border-slate-700 dark:bg-slate-900"><p className="text-[11px] font-semibold uppercase text-slate-500 print:text-[8px] print:text-black">{label}</p><p className="mt-1 text-xl font-semibold print:text-sm">{value}</p></article>)}
        </section>

        {data.totals.reviewCount > 0 ? <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 print:border-black print:bg-white print:text-[9px]">{data.totals.reviewCount} jugador(es) requieren revision porque tienen un cargo junto con una beca completa u omision.</p> : null}

        <CoachTuitionCharts paid={data.totals.paidCount} notPaid={data.totals.pendingCount + data.totals.missingCount} selectedCoach={data.selectedCoachSummary} coachSummaries={data.coachSummaries} />

        <section className="print:hidden">
          <h2 className="mb-2 text-base font-semibold">Resumen por coach</h2>
          <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900"><tr><th className="px-3 py-2">Coach</th><th className="px-3 py-2 text-center">Grupos</th><th className="px-3 py-2 text-center">Plantel</th><th className="px-3 py-2 text-center">Deben pagar</th><th className="px-3 py-2 text-center">Pagada</th><th className="px-3 py-2 text-center">Pendiente</th><th className="px-3 py-2 text-center">Becado</th><th className="px-3 py-2 text-center">Omitida</th><th className="px-3 py-2 text-center">Sin cargo</th><th className="px-3 py-2 text-center">Cobranza</th></tr></thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {data.coachSummaries.map((coach) => <tr key={coach.coachId}><td className="px-3 py-2 font-medium">{coach.coachName}</td><td className="px-3 py-2 text-center">{coach.groups}</td><td className="px-3 py-2 text-center">{coach.rosterCount}</td><td className="px-3 py-2 text-center">{coach.expectedCount}</td><td className="px-3 py-2 text-center text-emerald-700">{coach.paidCount}</td><td className="px-3 py-2 text-center text-rose-700">{coach.pendingCount}</td><td className="px-3 py-2 text-center">{coach.scholarshipCount}</td><td className="px-3 py-2 text-center">{coach.omittedCount}</td><td className="px-3 py-2 text-center text-amber-700">{coach.missingCount}</td><td className={`px-3 py-2 text-center font-semibold ${rateClass(coach.collectionRate)}`}>{rateLabel(coach.collectionRate)}</td></tr>)}
                {data.coachSummaries.length === 0 ? <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-500">Sin datos para este alcance.</td></tr> : null}
              </tbody>
              {data.coachSummaries.length > 0 ? <tfoot className="border-t-2 border-slate-300 bg-slate-100 font-semibold dark:border-slate-600 dark:bg-slate-950"><tr><td className="px-3 py-2">Total general<span className="block text-[11px] font-normal text-slate-500">Jugadores unicos, sin duplicar coaches compartidos</span></td><td className="px-3 py-2 text-center">{data.totals.groups}</td><td className="px-3 py-2 text-center">{data.totals.rosterCount}</td><td className="px-3 py-2 text-center">{data.totals.expectedCount}</td><td className="px-3 py-2 text-center text-emerald-700">{data.totals.paidCount}</td><td className="px-3 py-2 text-center text-rose-700">{data.totals.pendingCount}</td><td className="px-3 py-2 text-center">{data.totals.scholarshipCount}</td><td className="px-3 py-2 text-center">{data.totals.omittedCount}</td><td className="px-3 py-2 text-center text-amber-700">{data.totals.missingCount}</td><td className={`px-3 py-2 text-center ${rateClass(data.totals.collectionRate)}`}>{rateLabel(data.totals.collectionRate)}</td></tr></tfoot> : null}
            </table>
          </div>
        </section>

        <section className="space-y-5 print:space-y-3">
          <div><h2 className="text-base font-semibold print:text-sm">Detalle del reporte</h2><p className="text-xs text-slate-500 print:text-black">Orden: campus, categoria, coach y grupo. La responsabilidad corresponde al plantel y coach actuales.</p></div>
          {data.campusSections.map((campus) => <section key={campus.campusId} className="space-y-4 print:space-y-2">
            <h2 className="border-b-2 border-portoBlue pb-1 text-lg font-semibold print:border-black print:text-sm">{campus.campusName}</h2>
            {campus.birthYears.map((year) => <section key={year.label} className="space-y-3 rounded-md border border-sky-200 p-3 print:space-y-1 print:rounded-none print:border-black print:p-1 dark:border-sky-800">
              <h3 className="border-b border-sky-200 pb-2 text-[17px] font-bold print:border-black print:pb-1 print:text-xs dark:border-sky-800">{year.label}</h3>
              {year.coaches.map((coach) => <section key={coach.coachId} className="space-y-2 print:space-y-1"><h4 className="text-sm font-semibold print:text-[10px]">Coach {coach.coachName}</h4>
                {coach.groups.map((group, groupIndex) => <article key={`${group.trainingGroupId}:${group.coachId}`} className={`border-t border-slate-200 px-2 py-2 print:border-black print:bg-white print:px-0 print:py-1 dark:border-slate-700 ${groupIndex % 2 === 0 ? "bg-sky-50/70 dark:bg-sky-950/30" : "bg-white dark:bg-slate-950"}`}>
                  <div className="grid gap-1 text-sm sm:grid-cols-[minmax(12rem,1fr)_repeat(5,auto)] sm:items-center sm:gap-4 print:grid-cols-[1fr_repeat(5,auto)] print:text-[8px]"><strong>{group.trainingGroupName} <span className="font-normal text-slate-500 print:text-black">({group.coachRole})</span></strong><span>Plantel: {group.rosterCount}</span><span>Esperados: {group.expectedCount}</span><span>Pagada: {group.paidCount}</span><span>Pendiente: {group.pendingCount + group.missingCount}</span><strong className={rateClass(group.collectionRate)}>{rateLabel(group.collectionRate)}</strong></div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2 print:mt-1 print:grid-cols-2 print:gap-3 print:text-[8px]"><p><strong>{STATUS_LABELS.paid}:</strong> {playerList(group.players, "paid")}.</p><p><strong>{STATUS_LABELS.pending}:</strong> {playerList(group.players, "pending")}.</p><p><strong>{STATUS_LABELS.scholarship} / {STATUS_LABELS.omitted}:</strong> {[playerList(group.players, "scholarship"), playerList(group.players, "omitted")].filter((value) => value !== "Ninguno").join(" | ") || "Ninguno"}.</p><p><strong>{STATUS_LABELS.missing} / {STATUS_LABELS.review}:</strong> {[playerList(group.players, "missing"), playerList(group.players, "review")].filter((value) => value !== "Ninguno").join(" | ") || "Ninguno"}.</p></div>
                </article>)}
              </section>)}
            </section>)}
          </section>)}
          {data.campusSections.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Sin jugadores activos para este alcance.</p> : null}
        </section>
      </div>
    </PageShell>
  );
}
