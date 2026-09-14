import { z } from "zod";
import { PageShell } from "@/components/ui/page-shell";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { readManagementData, ManagementReadUnavailable } from "./management-read";

const count = z.number().int().nonnegative();
export const dashboardReadSchema = z.object({
  campuses: z.array(z.object({ id: z.string().uuid(), name: z.string() }).strict()),
  selectedCampusId: z.string(), selectedMonth: z.string().regex(/^\d{4}-\d{2}$/),
  activeEnrollments: count, newEnrollmentsThisMonth: count, bajasThisMonth: count,
  attendanceRateThisWeek: z.number().min(0).max(100).nullable(), attendanceRecordsThisWeek: count,
}).strict();

export async function NonfinancialDashboard({ filters }: { filters: Record<string, string | undefined> }) {
  const data = await readManagementData("director_readonly_dashboard_v1", filters, dashboardReadSchema);
  if (!data) return <ManagementReadUnavailable title="Panel" />;
  return <PageShell title="Panel" subtitle="Solo lectura">
    <div className="space-y-4">
      <DashboardFilters campuses={data.campuses} selectedCampusId={data.selectedCampusId} selectedMonth={data.selectedMonth} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Inscripciones activas" value={String(data.activeEnrollments)} description="Inscripciones actuales" />
        <KpiCard label="Nuevas inscripciones" value={String(data.newEnrollmentsThisMonth)} description="Mes seleccionado" href={`/dashboard/new-enrollments?${new URLSearchParams({ campus: data.selectedCampusId, month: data.selectedMonth })}`} />
        <KpiCard label="Bajas del mes" value={String(data.bajasThisMonth)} description="Mes seleccionado" />
        <KpiCard label="Asistencia semana" value={data.attendanceRateThisWeek === null ? "Sin datos" : `${data.attendanceRateThisWeek}%`} description={`${data.attendanceRecordsThisWeek} registros`} />
      </div>
    </div>
  </PageShell>;
}
