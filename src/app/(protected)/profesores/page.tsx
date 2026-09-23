import { PageShell } from "@/components/ui/page-shell";
import { CoachDirectoryClient } from "@/components/coaches/coach-directory-client";
import { loadCoachDirectory } from "@/server/actions/coaches";

export default async function ProfesoresPage() {
  const data = await loadCoachDirectory();
  return <PageShell title="Profesores" wide><CoachDirectoryClient data={data} /></PageShell>;
}
