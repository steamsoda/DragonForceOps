import { PageShell } from "@/components/ui/page-shell";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { TrialBirthYearChart } from "@/components/trial-classes/trial-report-charts";
import { formatDateOnlyDdMmYyyy } from "@/lib/time";
import { readManagementData, ManagementReadUnavailable } from "../dashboard/management-read";
import { ManagementCampusSelect, ManagementReadPagination, managementInputClass } from "../dashboard/management-read-controls";
import { trialsReadSchema } from "./read-contract";

const labels = { active: "En seguimiento", converted: "Inscrito", closed: "Cerrado" };
export async function NonfinancialTrials({ filters }: { filters: Record<string, string | undefined> }) {
  const safeFilters = { campus: filters.campus, q: filters.q, status: filters.status, page: filters.page, reportFrom: filters.reportFrom, reportTo: filters.reportTo };
  const data = await readManagementData("director_readonly_trials_v1", safeFilters, trialsReadSchema);
  if (!data) return <ManagementReadUnavailable title="Clases de prueba" />;
  const report = data.report;
  return <PageShell title="Clases de prueba" subtitle="Prospectos y visitas | Solo lectura" wide>
    <form method="get" className="grid items-end gap-3 border-b pb-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr_auto]">
      <ManagementCampusSelect campuses={data.campuses} selected={data.selectedCampusId} />
      <input type="hidden" name="reportFrom" value={report.dateFrom} /><input type="hidden" name="reportTo" value={report.dateTo} />
      <label className="grid gap-1 text-sm">Estado<select name="status" defaultValue={data.selectedStatus} className={managementInputClass}><option value="all">Todos</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Buscar<input name="q" type="search" defaultValue={data.q} placeholder="Prospecto, tutor o telefono" className={managementInputClass} /></label>
      <button type="submit" className={`${managementInputClass} font-medium text-portoBlue`}>Buscar</button>
    </form>
    <ManagementReadPagination pathname="/trial-classes" filters={safeFilters} {...data} />
    <section className="space-y-3">
      {data.prospects.map((p) => <article key={p.id} className="space-y-3 rounded-md border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-semibold text-portoBlue">{p.firstName} {p.lastName}</h2><p className="text-sm text-slate-500">{p.campusName} | {formatDateOnlyDdMmYyyy(p.birthDate)} | {p.gender === "female" ? "Femenil" : "Varonil"}</p></div>
          <span className="text-sm font-semibold">{labels[p.status]} | {p.visits.length}/3 clases</span>
        </div>
        <p className="text-sm">{p.preferredGroupName}</p><p className="text-sm">Tutor: {p.guardianName || "Sin nombre"} | {p.guardianPhone}</p>
        <details><summary className="cursor-pointer text-sm font-medium text-portoBlue">Historial de visitas ({p.visits.length})</summary>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-2">Clase</th><th>Fecha</th><th>Grupo</th></tr></thead><tbody>
            {p.visits.map((v) => <tr key={v.id} className="border-t"><td className="py-2">{v.visitNumber}/3</td><td>{formatDateOnlyDdMmYyyy(v.visitDate)}</td><td>{v.groupName}</td></tr>)}
          </tbody></table></div>{!p.visits.length && <p className="py-3 text-sm text-slate-500">Sin visitas registradas.</p>}
        </details>
      </article>)}
      {!data.prospects.length && <p className="py-8 text-center text-sm text-slate-500">Sin prospectos para estos filtros.</p>}
    </section>
    <ManagementReadPagination pathname="/trial-classes" filters={safeFilters} {...data} />
    <section className="space-y-4 border-t pt-5">
      <h2 className="text-lg font-semibold">Reporte de clases de prueba</h2>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="campus" value={data.selectedCampusId} /><input type="hidden" name="q" value={data.q} /><input type="hidden" name="status" value={data.selectedStatus} />
        <label className="grid gap-1 text-sm">Desde<input name="reportFrom" type="date" defaultValue={report.dateFrom} className={managementInputClass} /></label>
        <label className="grid gap-1 text-sm">Hasta<input name="reportTo" type="date" defaultValue={report.dateTo} className={managementInputClass} /></label>
        <button type="submit" className={`${managementInputClass} font-medium text-portoBlue`}>Ver reporte</button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Prospectos registrados" value={String(report.registeredProspects)} description="Altas durante el periodo" />
        <KpiCard label="Inscritos" value={String(report.convertedProspects)} description="De los prospectos registrados en el periodo" />
        <KpiCard label="Visitas realizadas" value={String(report.visits)} description="Visitas durante el periodo" />
        <KpiCard label="Prospectos con visita" value={String(report.visitingProspects)} description="Prospectos unicos durante el periodo" />
      </div>
      <TrialBirthYearChart rows={report.birthYears} />
    </section>
  </PageShell>;
}
