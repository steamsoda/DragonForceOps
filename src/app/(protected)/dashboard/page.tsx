import { listCampuses } from "@/lib/queries/players";
import { getDashboardData } from "@/lib/queries/dashboard";
import { requireDirectorReadContext } from "@/lib/auth/permissions";
import { directorPresentation } from "@/lib/auth/director-presentation";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { NonfinancialDashboard } from "./nonfinancial";

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<{ campus?: string; month?: string }>;
}) {
  const context = await requireDirectorReadContext("/inicio");
  const params = await searchParams;
  if (!directorPresentation(context).consolidatedFinancials) {
    return <NonfinancialDashboard filters={params} />;
  }
  const selectedCampusId = params.campus ?? "";
  const [campuses, dashboard] = await Promise.all([
    listCampuses(),
    getDashboardData({ campusId: selectedCampusId || undefined, month: params.month }),
  ]);
  return <DashboardView campuses={campuses} dashboard={dashboard} selectedCampusId={selectedCampusId} />;
}
