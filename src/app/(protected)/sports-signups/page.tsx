import { redirect } from "next/navigation";
import { SportsSignupsBoard } from "@/components/sports/sports-signups-board";
import { PageShell } from "@/components/ui/page-shell";
import { getPermissionContext } from "@/lib/auth/permissions";
import {
  getCompetitionSignupDashboardData,
} from "@/lib/queries/sports-signups";

type SearchParams = Promise<{
  campus?: string;
  competition?: string;
  perf?: string;
}>;

export default async function SportsSignupsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const permissionContext = await getPermissionContext();
  const dashboard = await getCompetitionSignupDashboardData({
    campusId: params.campus ?? "",
    competitionId: params.competition ?? "",
    perf: permissionContext?.isSuperAdmin === true && params.perf === "1",
  });

  if (!dashboard || !permissionContext) redirect("/unauthorized");

  const initialCompetitionId = dashboard.competitionOptions.some((option) => option.id === params.competition)
    ? (params.competition as string)
    : (dashboard.competitionOptions[0]?.id ?? "");

  return (
    <PageShell
      title="Inscripciones Torneos"
      subtitle="Vista operativa por campus y por producto de torneo pagado. Solo muestra jugadores confirmados y avance por categoria."
      breadcrumbs={[{ label: "Inscripciones Torneos" }]}
      wide
    >
      <SportsSignupsBoard
        dashboard={dashboard}
        initialCompetitionId={initialCompetitionId}
        canExportCsv={permissionContext.isSuperAdmin}
        canUsePerfDebug={permissionContext.isSuperAdmin && params.perf === "1"}
      />
    </PageShell>
  );
}
