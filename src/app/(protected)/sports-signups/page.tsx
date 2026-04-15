import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { SportsSignupsBoard } from "@/components/sports/sports-signups-board";
import {
  type FamilyKey,
  getCompetitionSignupDashboardData,
} from "@/lib/queries/sports-signups";

type SearchParams = Promise<{
  campus?: string;
  family?: string;
}>;

export default async function SportsSignupsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const dashboard = await getCompetitionSignupDashboardData({
    campusId: params.campus ?? "",
  });

  if (!dashboard) redirect("/unauthorized");

  const initialFamilyKey = dashboard.campusBoards[0]?.families.some((family) => family.key === params.family)
    ? (params.family as FamilyKey)
    : (dashboard.campusBoards[0]?.families[0]?.key ?? "superliga_regia");

  return (
    <PageShell
      title="Inscripciones Torneos"
      subtitle="Vista operativa por campus y por producto de torneo pagado. Solo muestra jugadores confirmados y avance por categoría."
      breadcrumbs={[{ label: "Inscripciones Torneos" }]}
    >
      <SportsSignupsBoard dashboard={dashboard} initialFamilyKey={initialFamilyKey} />
    </PageShell>
  );
}
