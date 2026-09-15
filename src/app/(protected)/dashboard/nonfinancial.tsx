import { z } from "zod";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { restrictedDashboard } from "@/lib/queries/dashboard-presentation";
import { getDashboardPaymentCounts } from "@/lib/queries/director-report-presentation";
import { readManagementData, ManagementReadUnavailable } from "./management-read";

const count = z.number().int().nonnegative();
export const dashboardReadSchema = z.object({
  campuses: z.array(z.object({ id: z.string().uuid(), name: z.string() }).strict()),
  selectedCampusId: z.string(), selectedMonth: z.string().regex(/^\d{4}-\d{2}$/),
  activeEnrollments: count, newEnrollmentsThisMonth: count, bajasThisMonth: count,
  attendanceRateThisWeek: z.number().min(0).max(100).nullable(), attendanceRecordsThisWeek: count,
  attendedPlayersThisMonth: count, playersWithoutAttendanceThisMonth: count,
}).strict();

export async function NonfinancialDashboard({ filters }: { filters: Record<string, string | undefined> }) {
  const data = await readManagementData("director_readonly_dashboard_v1", filters, dashboardReadSchema);
  if (!data) return <ManagementReadUnavailable title="Panel" />;
  const counts = await getDashboardPaymentCounts({ month: data.selectedMonth, campusId: data.selectedCampusId || undefined });
  return <DashboardView campuses={data.campuses} selectedCampusId={data.selectedCampusId}
    dashboard={restrictedDashboard({ ...data, ...counts })} />;
}
