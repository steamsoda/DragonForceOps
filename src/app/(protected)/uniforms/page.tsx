import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { getUniformDashboardData } from "@/lib/queries/uniforms";
import { formatDateMonterrey } from "@/lib/time";
import { UniformsDashboard } from "@/components/uniforms/uniforms-dashboard";

type SearchParams = Promise<{
  campus?: string;
  type?: string;
  queue?: string;
}>;

export default async function UniformsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireOperationalContext();
  const params = await searchParams;
  const data = await getUniformDashboardData({
    campusId: params.campus ?? "",
    type: params.type === "training" || params.type === "game" ? params.type : "",
    queue:
      params.queue === "sold_week" ||
      params.queue === "pending_order" ||
      params.queue === "ordered" ||
      params.queue === "pending_delivery" ||
      params.queue === "delivered_week"
        ? params.queue
        : "all",
  });

  if (data.campuses.length === 0) redirect("/unauthorized");

  const weekStartLabel = data.week.start ? formatDateMonterrey(data.week.start) : "-";
  const weekEndLabel = data.week.end
    ? formatDateMonterrey(new Date(new Date(data.week.end).getTime() - 86_400_000))
    : "-";

  return (
    <PageShell
      title="Uniformes"
      subtitle={`Flujo operativo de uniformes vendidos y entregados. Semana actual: ${weekStartLabel} - ${weekEndLabel}`}
      breadcrumbs={[{ label: "Uniformes" }]}
      wide
    >
      <UniformsDashboard
        campuses={data.campuses}
        initialSelectedCampusId={data.selectedCampusId}
        initialSelectedType={data.selectedType}
        initialSelectedQueue={data.selectedQueue ?? "all"}
        week={data.week}
        rows={data.rows}
      />
    </PageShell>
  );
}
