import { AttendanceCampusButtons } from "@/components/attendance/attendance-campus-buttons";
import { TrialProspectForm } from "@/components/trial-classes/trial-prospect-form";
import { TrialBirthYearChart } from "@/components/trial-classes/trial-report-charts";
import { TrialCheckInControl, TrialTicketReprintButton } from "@/components/trial-classes/trial-visit-controls";
import { PageShell } from "@/components/ui/page-shell";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { getPrinterName } from "@/lib/queries/settings";
import { getTrialClassesData, getTrialClassesReport } from "@/lib/queries/trial-classes";
import { formatDateOnlyDdMmYyyy, formatTimeMonterrey, getMonterreyDateString } from "@/lib/time";
import { addTrialProspectNoteAction } from "@/server/actions/trial-classes";

type SearchParams = Promise<{
  campus?: string;
  q?: string;
  err?: string;
  ok?: string;
  duplicate?: string;
  focus?: string;
  reportMonth?: string;
  reportRange?: string;
  reportFrom?: string;
  reportTo?: string;
}>;

const ERROR_LABELS: Record<string, string> = {
  unauthorized: "No tienes permiso para guardar en este campus.",
  invalid_form: "Completa nombre, apellido, fecha de nacimiento, genero, telefono y grupo.",
  invalid_group: "El grupo seleccionado ya no esta disponible.",
  possible_duplicate: "Encontramos un posible registro existente. Revisalo antes de crear otro.",
  create_failed: "No se pudo registrar al prospecto.",
  note_failed: "No se pudo guardar la nota.",
};

function genderLabel(value: string) {
  return value === "female" ? "Femenino" : "Masculino";
}

function rateLabel(rate: number | null) {
  return rate == null ? "Sin base" : `${rate}%`;
}

function prospectStatusLabel(status: string) {
  if (status === "converted") return "Inscrito";
  if (status === "closed") return "Cerrado";
  return "En seguimiento";
}

export default async function TrialClassesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await requireOperationalContext();
  if (!context.campusAccess) return null;
  const [data, report, printerName] = await Promise.all([
    getTrialClassesData({ campusAccess: context.campusAccess, campusId: params.campus, query: params.q }),
    getTrialClassesReport({ campusAccess: context.campusAccess, campusId: params.campus, month: params.reportMonth, rangeMode: params.reportRange, dateFrom: params.reportFrom, dateTo: params.reportTo }),
    getPrinterName(),
  ]);
  const returnQuery = new URLSearchParams();
  if (data.selectedCampusId) returnQuery.set("campus", data.selectedCampusId);
  if (params.q) returnQuery.set("q", params.q);
  const returnTo = `/trial-classes?${returnQuery.toString()}`;
  const counts = data.prospects.reduce((summary, prospect) => {
    const visits = prospect.visits.length;
    if (visits === 0) summary.pending += 1;
    else if (visits >= 3) summary.completed += 1;
    else summary.inProgress += 1;
    return summary;
  }, { pending: 0, inProgress: 0, completed: 0 });

  return (
    <PageShell wide title="Clases de prueba" subtitle="Registro previo a inscripcion. Las visitas de prueba no alteran planteles, asistencia oficial ni finanzas.">
      <div className="space-y-5">
        {params.err ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{ERROR_LABELS[params.err] ?? "No se pudo completar la accion."}</p>
        ) : null}
        {params.ok ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {params.ok === "created" ? "Prospecto registrado." : "Nota guardada."}
          </p>
        ) : null}

        <section className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
          <AttendanceCampusButtons pathname="/trial-classes" campuses={data.campuses} selectedCampusId={data.selectedCampusId} allLabel="Campus" params={{ q: params.q, reportMonth: report.selectedMonth, reportRange: report.rangeMode, reportFrom: report.dateFrom, reportTo: report.dateTo }} />
          <form className="flex flex-col gap-2 sm:flex-row">
            {data.selectedCampusId ? <input type="hidden" name="campus" value={data.selectedCampusId} /> : null}
            <input name="q" defaultValue={params.q ?? ""} placeholder="Buscar por jugador, tutor o telefono" className="min-h-10 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" />
            <button className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white">Buscar</button>
            <a href={data.selectedCampusId ? `/trial-classes?campus=${data.selectedCampusId}` : "/trial-classes"} className="rounded-md border border-slate-300 px-4 py-2 text-center text-sm font-medium">Limpiar</a>
          </form>
        </section>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-4"><p className="text-xs uppercase text-slate-500">Por iniciar</p><p className="text-2xl font-semibold">{counts.pending}</p></div>
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4"><p className="text-xs uppercase text-blue-700">En prueba</p><p className="text-2xl font-semibold text-blue-900">{counts.inProgress}</p></div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4"><p className="text-xs uppercase text-emerald-700">3 clases completadas</p><p className="text-2xl font-semibold text-emerald-900">{counts.completed}</p></div>
        </div>

        <details className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" open={data.prospects.length === 0}>
          <summary className="cursor-pointer text-base font-semibold text-portoBlue">Registrar nuevo prospecto</summary>
          <TrialProspectForm campusId={data.selectedCampusId} groups={data.groups} maxBirthDate={getMonterreyDateString()} />
        </details>

        <section className="space-y-3">
          <div><h2 className="text-lg font-semibold">Prospectos activos</h2><p className="text-sm text-slate-500">{data.prospects.length} registros visibles.</p></div>
          {data.prospects.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Sin prospectos para este filtro.</p> : data.prospects.map((prospect) => {
            const highlighted = params.focus === prospect.id || params.duplicate === prospect.id;
            return (
              <article id={`prospect-${prospect.id}`} key={prospect.id} className={`space-y-4 rounded-lg border p-4 ${highlighted ? "border-amber-400 bg-amber-50/40" : "border-slate-200 bg-white"}`}>
                <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div><h3 className="text-base font-semibold text-portoBlue">{prospect.firstName} {prospect.lastName}</h3><p className="text-sm text-slate-500">{formatDateOnlyDdMmYyyy(prospect.birthDate)} | {genderLabel(prospect.gender)} | {prospect.preferredGroupName}</p></div>
                      <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${prospect.visits.length >= 3 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-blue-300 bg-blue-50 text-blue-800"}`}>{prospect.visits.length}/3 clases</span>
                    </div>
                    <p className="text-sm"><span className="font-medium">Tutor:</span> {prospect.guardianName || "Sin nombre"} | <a className="text-portoBlue hover:underline" href={`tel:${prospect.guardianPhone}`}>{prospect.guardianPhone}</a></p>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Historial</p>
                      {prospect.visits.length === 0 ? <p className="text-sm text-slate-500">Sin visitas registradas.</p> : prospect.visits.map((visit) => (
                        <div key={visit.id} className="flex flex-col gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                          <span><strong>Clase {visit.visitNumber}/3</strong> | {formatDateOnlyDdMmYyyy(visit.visitDate)} | {visit.groupName}{visit.note ? ` | ${visit.note}` : ""}</span>
                          <TrialTicketReprintButton printerName={printerName} ticket={{ visitId: visit.id, prospectName: `${prospect.firstName} ${prospect.lastName}`, campusName: data.campuses.find((campus) => campus.id === prospect.campusId)?.name ?? "Campus", groupName: visit.groupName, coachNames: visit.coachNames, visitNumber: visit.visitNumber, visitDate: formatDateOnlyDdMmYyyy(visit.visitDate), checkedInAt: formatTimeMonterrey(visit.checkedInAt) }} />
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {prospect.notes.map((note) => <p key={note.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm"><span className="text-xs text-slate-500">{formatDateOnlyDdMmYyyy(note.createdAt.slice(0, 10))} {formatTimeMonterrey(note.createdAt)}</span><br />{note.body}</p>)}
                      <form action={addTrialProspectNoteAction} className="flex flex-col gap-2 sm:flex-row"><input type="hidden" name="prospectId" value={prospect.id} /><input type="hidden" name="returnTo" value={returnTo} /><input required name="body" maxLength={2000} placeholder="Agregar nota" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" /><button className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium">Guardar nota</button></form>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <TrialCheckInControl prospectId={prospect.id} preferredTrainingGroupId={prospect.preferredTrainingGroupId} sessions={data.sessions} visitCount={prospect.visits.length} printerName={printerName} />
                    <a
                      href={`/players/new?trialProspectId=${prospect.id}`}
                      className="block rounded-md bg-portoBlue px-4 py-2 text-center text-sm font-semibold text-white hover:bg-portoDark"
                    >
                      Inscribir jugador
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Reporte mensual</h2>
              <p className="text-sm text-slate-500">Clases de prueba separadas del plantel, asistencia oficial y finanzas.</p>
            </div>
            <form className="grid items-end gap-2 sm:grid-cols-2 xl:grid-cols-[12rem_10rem_10rem_10rem_auto]">
              {data.selectedCampusId ? <input type="hidden" name="campus" value={data.selectedCampusId} /> : null}
              {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
              <label className="text-sm font-medium">Periodo<select name="reportRange" defaultValue={report.rangeMode} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"><option value="month">Mes seleccionado</option><option value="three_months">Ultimos 3 meses</option><option value="custom">Rango personalizado</option></select></label>
              <label className="text-sm font-medium">Mes<input name="reportMonth" type="month" defaultValue={report.selectedMonth} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" /></label>
              <label className="text-sm font-medium">Desde<input name="reportFrom" type="date" defaultValue={report.dateFrom} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" /></label>
              <label className="text-sm font-medium">Hasta<input name="reportTo" type="date" defaultValue={report.dateTo} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950" /></label>
              <button className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white">Ver reporte</button>
            </form>
          </div>

          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Periodo: {formatDateOnlyDdMmYyyy(report.dateFrom)} al {formatDateOnlyDdMmYyyy(report.dateTo)}</p>
          <p className="text-xs text-slate-500">Los campos Desde/Hasta se usan solamente con Rango personalizado. Ultimos 3 meses termina en el mes seleccionado.</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              ["Prospectos registrados", report.registeredProspects],
              ["Visitas realizadas", report.visits],
              ["Convertidos", report.convertedProspects],
              ["Conversion", rateLabel(report.conversionRate)],
              ["Siguen activos", report.activeProspects],
              ["Prospectos con visita", report.visitingProspects],
            ].map(([label, value]) => (
              <article key={label} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-semibold">{value}</p>
              </article>
            ))}
          </div>

          <TrialBirthYearChart rows={report.birthYears} />

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-950"><tr><th className="px-3 py-2">Grupo</th><th className="px-3 py-2">Campus / categoria</th><th className="px-3 py-2 text-center">Registrados</th><th className="px-3 py-2 text-center">Visitas</th><th className="px-3 py-2 text-center">Convertidos</th><th className="px-3 py-2 text-center">Conversion</th></tr></thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {report.groups.map((group) => <tr key={group.trainingGroupId}><td className="px-3 py-2 font-medium">{group.trainingGroupName}</td><td className="px-3 py-2 text-slate-600 dark:text-slate-300">{group.campusName}<br /><span className="text-xs">{group.birthYearLabel}</span></td><td className="px-3 py-2 text-center">{group.registeredProspects}</td><td className="px-3 py-2 text-center">{group.visits}</td><td className="px-3 py-2 text-center">{group.convertedProspects}</td><td className="px-3 py-2 text-center font-semibold">{rateLabel(group.conversionRate)}</td></tr>)}
                  {report.groups.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Sin actividad en este mes.</td></tr> : null}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <div><h3 className="font-semibold">Atribucion por coach</h3><p className="text-xs text-slate-500">Usa el coach guardado al registrar cada visita. Un prospecto atendido por varios coaches puede aparecer en varias filas; los KPIs generales no se duplican.</p></div>
              <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-950"><tr><th className="px-3 py-2">Coach</th><th className="px-3 py-2 text-center">Prospectos</th><th className="px-3 py-2 text-center">Visitas</th><th className="px-3 py-2 text-center">Convertidos</th><th className="px-3 py-2 text-center">Conversion</th></tr></thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {report.coaches.map((coach) => <tr key={coach.coachName}><td className="px-3 py-2 font-medium">{coach.coachName}</td><td className="px-3 py-2 text-center">{coach.prospectsSeen}</td><td className="px-3 py-2 text-center">{coach.visits}</td><td className="px-3 py-2 text-center">{coach.convertedProspects}</td><td className="px-3 py-2 text-center font-semibold">{rateLabel(coach.conversionRate)}</td></tr>)}
                    {report.coaches.length === 0 ? <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Sin visitas atribuidas en este mes.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div><h3 className="font-semibold">Prospectos que asistieron</h3><p className="text-xs text-slate-500">Una fila por prospecto con al menos una visita durante el mes seleccionado.</p></div>
            <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-950"><tr><th className="px-3 py-2">Prospecto</th><th className="px-3 py-2 text-center">Categoria</th><th className="px-3 py-2">Grupo(s)</th><th className="px-3 py-2">Coach(es)</th><th className="px-3 py-2 text-center">Visitas</th><th className="px-3 py-2 text-center">Ultima visita</th><th className="px-3 py-2">Estado</th></tr></thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {report.visitors.map((visitor) => <tr key={visitor.prospectId}><td className="px-3 py-2 font-medium">{visitor.prospectName}</td><td className="px-3 py-2 text-center">{visitor.birthYear ?? "-"}</td><td className="px-3 py-2">{visitor.groupNames.join(", ")}</td><td className="px-3 py-2">{visitor.coachNames.join(", ") || "Sin coach"}</td><td className="px-3 py-2 text-center">{visitor.visits}</td><td className="px-3 py-2 text-center">{formatDateOnlyDdMmYyyy(visitor.lastVisitDate)}</td><td className="px-3 py-2">{prospectStatusLabel(visitor.status)}</td></tr>)}
                  {report.visitors.length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Sin prospectos con visitas en este mes.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-slate-500">La conversion general usa como cohorte los prospectos registrados durante el periodo seleccionado. Las visitas se cuentan por su fecha real dentro del mismo periodo.</p>
        </section>
      </div>
    </PageShell>
  );
}
